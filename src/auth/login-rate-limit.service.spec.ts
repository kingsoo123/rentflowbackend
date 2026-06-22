import { HttpException, UnauthorizedException } from '@nestjs/common';
import { LoginRateLimitService } from './login-rate-limit.service';

describe('LoginRateLimitService', () => {
  let service: LoginRateLimitService;

  beforeEach(() => {
    service = new LoginRateLimitService();
  });

  it('allows attempts initially', () => {
    expect(() => service.assertCanAttempt('user@example.com', '1.2.3.4')).not.toThrow();
  });

  it('escalates messages before lockout', () => {
    for (let i = 0; i < 3; i++) {
      try {
        service.rejectFailedAttempt('user@example.com', '1.2.3.4');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
      }
    }
    try {
      service.rejectFailedAttempt('user@example.com', '1.2.3.4');
    } catch (e) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect((e as UnauthorizedException).message).toContain('lockout');
    }
  });

  it('locks out after five failures', () => {
    for (let i = 0; i < 5; i++) {
      try {
        service.rejectFailedAttempt('attacker@example.com', '9.9.9.9');
      } catch (e) {
        /* expected */
      }
    }
    expect(() => service.assertCanAttempt('attacker@example.com', '9.9.9.9')).toThrow(HttpException);
    try {
      service.assertCanAttempt('attacker@example.com', '9.9.9.9');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const err = e as HttpException;
      expect(err.getStatus()).toBe(429);
      expect(String(err.message)).toMatch(/blocked|locked|Too many/i);
    }
  });

  it('clears failures after successful login', () => {
    for (let i = 0; i < 3; i++) {
      try {
        service.rejectFailedAttempt('ok@example.com', '5.5.5.5');
      } catch {
        /* expected */
      }
    }
    service.recordSuccess('ok@example.com', '5.5.5.5');
    expect(() => service.assertCanAttempt('ok@example.com', '5.5.5.5')).not.toThrow();
  });
});
