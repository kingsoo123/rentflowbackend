import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

type AttemptRecord = {
  failures: number;
  lockedUntilMs: number;
  lastFailureMs: number;
};

const FAILURE_DECAY_MS = 24 * 60 * 60 * 1000;

/** Escalating lockouts after repeated wrong passwords (per email and per IP). */
const LOCKOUT_TIERS: { failures: number; lockMs: number }[] = [
  { failures: 5, lockMs: 60_000 },
  { failures: 8, lockMs: 5 * 60_000 },
  { failures: 12, lockMs: 30 * 60_000 },
  { failures: 15, lockMs: 2 * 60 * 60_000 },
];

function lockMsForFailures(failures: number): number {
  let lockMs = 0;
  for (const tier of LOCKOUT_TIERS) {
    if (failures >= tier.failures) {
      lockMs = tier.lockMs;
    }
  }
  return lockMs;
}

function formatRetryDuration(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

function lockoutMessage(retryAfterSeconds: number): string {
  const duration = formatRetryDuration(retryAfterSeconds);
  if (retryAfterSeconds >= 3600) {
    return `Login blocked. Too many failed attempts from this account or device. Try again in about ${duration}. Further attempts will be rejected until the lockout expires.`;
  }
  if (retryAfterSeconds >= 300) {
    return `Login blocked. Repeated wrong passwords triggered a security lockout. Wait ${duration} before trying again.`;
  }
  if (retryAfterSeconds >= 60) {
    return `Too many failed login attempts. Access is temporarily locked for ${duration}. Stop guessing credentials.`;
  }
  return `Too many failed login attempts. Wait ${duration} before trying again.`;
}

function failureMessage(failures: number): string {
  if (failures >= 4) {
    return 'Invalid email or password. One more failed attempt will trigger a temporary login lockout.';
  }
  if (failures >= 3) {
    return 'Invalid email or password. Repeated failures are logged and may lock this account.';
  }
  if (failures >= 2) {
    return 'Invalid email or password. Check your credentials before trying again.';
  }
  return 'Invalid email or password';
}

@Injectable()
export class LoginRateLimitService {
  private readonly logger = new Logger(LoginRateLimitService.name);
  private readonly store = new Map<string, AttemptRecord>();

  assertCanAttempt(email: string, clientIp: string): void {
    const now = Date.now();
    const keys = this.keysFor(email, clientIp);
    let maxRetryAfterSec = 0;

    for (const key of keys) {
      const record = this.readRecord(key, now);
      if (record.lockedUntilMs > now) {
        const retryAfterSec = Math.max(1, Math.ceil((record.lockedUntilMs - now) / 1000));
        maxRetryAfterSec = Math.max(maxRetryAfterSec, retryAfterSec);
      }
    }

    if (maxRetryAfterSec > 0) {
      this.throwLockout(maxRetryAfterSec, email, clientIp);
    }
  }

  recordSuccess(email: string, clientIp: string): void {
    for (const key of this.keysFor(email, clientIp)) {
      this.store.delete(key);
    }
  }

  /** Call when credentials are wrong — may throw lockout or unauthorized. */
  rejectFailedAttempt(email: string, clientIp: string): never {
    const now = Date.now();
    let maxFailures = 0;

    for (const key of this.keysFor(email, clientIp)) {
      const record = this.readRecord(key, now);
      record.failures += 1;
      record.lastFailureMs = now;
      const lockMs = lockMsForFailures(record.failures);
      if (lockMs > 0) {
        record.lockedUntilMs = Math.max(record.lockedUntilMs, now + lockMs);
      }
      this.store.set(key, record);
      maxFailures = Math.max(maxFailures, record.failures);
    }

    this.logger.warn(
      `Failed login for ${this.maskEmail(email)} from ${clientIp} (${maxFailures} failure(s) on record)`,
    );

    if (maxFailures >= LOCKOUT_TIERS[0]!.failures) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil(
          (Math.max(
            ...this.keysFor(email, clientIp).map((k) => this.store.get(k)?.lockedUntilMs ?? 0),
          ) -
            now) /
            1000,
        ),
      );
      this.throwLockout(retryAfterSec, email, clientIp);
    }

    throw new UnauthorizedException(failureMessage(maxFailures));
  }

  private throwLockout(retryAfterSeconds: number, email: string, clientIp: string): never {
    this.logger.warn(
      `Login lockout for ${this.maskEmail(email)} from ${clientIp} (${retryAfterSeconds}s remaining)`,
    );
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: lockoutMessage(retryAfterSeconds),
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private keysFor(email: string, clientIp: string): string[] {
    const normalizedEmail = email.trim().toLowerCase();
    return [`account:${normalizedEmail}`, `ip:${clientIp}`];
  }

  private readRecord(key: string, now: number): AttemptRecord {
    const existing = this.store.get(key);
    if (!existing) {
      return { failures: 0, lockedUntilMs: 0, lastFailureMs: now };
    }
    if (now - existing.lastFailureMs > FAILURE_DECAY_MS) {
      this.store.delete(key);
      return { failures: 0, lockedUntilMs: 0, lastFailureMs: now };
    }
    return { ...existing };
  }

  private maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 1) {
      return '***';
    }
    return `${email.slice(0, 2)}***${email.slice(at)}`;
  }
}
