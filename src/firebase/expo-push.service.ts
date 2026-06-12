import { Injectable, Logger } from '@nestjs/common';
import { DevicePushTokensService } from '../device-push-tokens/device-push-tokens.service';

type ExpoTicketOk = { status: 'ok'; id?: string };
type ExpoTicketErr = {
  status: 'error';
  message?: string;
  details?: { error?: string; expoPushToken?: string };
};

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Sends via Expo’s HTTP push API (works for iOS + Android with `ExponentPushToken[...]`).
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);
  private readonly endpoint = 'https://exp.host/--/api/v2/push/send';

  constructor(private readonly devicePushTokens: DevicePushTokensService) {}

  static isExpoPushToken(token: string): boolean {
    return (
      typeof token === 'string' &&
      (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
    );
  }

  async sendForRows(
    rows: { userId: string; token: string }[],
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    const targets = rows.filter((r) => ExpoPushService.isExpoPushToken(r.token));
    if (targets.length === 0) {
      return;
    }
    const dataObj: Record<string, unknown> = { ...data };
    const chunkSize = 100;
    for (let i = 0; i < targets.length; i += chunkSize) {
      const slice = targets.slice(i, i + chunkSize);
      const messages = slice.map((r) => ({
        to: r.token,
        sound: 'default' as const,
        title: truncate(title, 120),
        body: truncate(body, 360),
        data: dataObj,
      }));
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });
        const json = (await res.json()) as { data?: unknown[] };
        if (!res.ok) {
          this.logger.warn(`Expo push HTTP ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
          continue;
        }
        const tickets = Array.isArray(json?.data) ? json.data : [];
        tickets.forEach((ticket, idx) => {
          const row = slice[idx];
          if (!row || !ticket || typeof ticket !== 'object') {
            return;
          }
          const t = ticket as ExpoTicketOk | ExpoTicketErr;
          if (t.status === 'error') {
            const err = t.details?.error;
            if (err === 'DeviceNotRegistered') {
              void this.devicePushTokens.deleteByUserIdAndToken(row.userId, row.token);
            } else {
              this.logger.warn(
                `Expo push ticket error for user ${row.userId}: ${t.message ?? err ?? 'unknown'}`,
              );
            }
          }
        });
      } catch (e) {
        this.logger.warn(`Expo push request failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
