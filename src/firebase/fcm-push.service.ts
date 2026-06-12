import { Injectable, Logger } from '@nestjs/common';
import { DevicePushTokensService } from '../device-push-tokens/device-push-tokens.service';
import { FirebaseAdminService } from './firebase-admin.service';

function getMessagingErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('code' in err)) {
    return undefined;
  }
  const c = (err as { code: unknown }).code;
  return typeof c === 'string' ? c : undefined;
}

function isUnregisteredTokenError(err: unknown): boolean {
  const code = getMessagingErrorCode(err);
  return (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered'
  );
}

function stringifyData(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = String(v);
  }
  return out;
}

/** FCM `notification` title/body should stay reasonably short for OS UI. */
function fcmText(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Sends FCM notifications to stored **Android** device tokens only.
 * iOS rows from Expo are typically APNs device tokens — use a separate APNs path if needed.
 */
@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);

  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly devicePushTokens: DevicePushTokensService,
  ) {}

  /**
   * One tenant, one headline/body — iterates all Android tokens for that user.
   */
  async notifyTenant(
    tenantId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    const messaging = this.firebaseAdmin.getMessaging();
    if (!messaging) {
      return;
    }
    const rows = await this.devicePushTokens.findAndroidTokensByUserIds([tenantId]);
    for (const row of rows) {
      try {
        await messaging.send({
          token: row.token,
          notification: { title: fcmText(title, 120), body: fcmText(body, 360) },
          data: stringifyData(data),
        });
      } catch (e) {
        if (isUnregisteredTokenError(e)) {
          await this.devicePushTokens.deleteByUserIdAndToken(tenantId, row.token);
        } else {
          this.logger.warn(
            `FCM send failed for user ${tenantId}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  /**
   * Same notification to many tenants (e.g. portfolio broadcast). Uses multicast in chunks of 500.
   */
  async notifyTenantsMulticast(
    tenantIds: string[],
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    const messaging = this.firebaseAdmin.getMessaging();
    if (!messaging || tenantIds.length === 0) {
      return;
    }
    const rows = await this.devicePushTokens.findAndroidTokensByUserIds(tenantIds);
    if (rows.length === 0) {
      return;
    }
    const dataPayload = stringifyData(data);
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const tokens = chunk.map((r) => r.token);
      try {
        const batch = await messaging.sendEachForMulticast({
          tokens,
          notification: { title: fcmText(title, 120), body: fcmText(body, 360) },
          data: dataPayload,
        });
        batch.responses.forEach((resp, idx) => {
          if (resp.success) {
            return;
          }
          const row = chunk[idx];
          if (!row) {
            return;
          }
          if (resp.error && isUnregisteredTokenError(resp.error)) {
            void this.devicePushTokens.deleteByUserIdAndToken(row.userId, row.token);
          } else if (resp.error) {
            this.logger.warn(
              `FCM multicast failure for user ${row.userId}: ${resp.error.message}`,
            );
          }
        });
      } catch (e) {
        this.logger.warn(`FCM multicast batch failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
