import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRentRenewalHtml(noticeBody: string): string {
  const safe = escapeHtml(noticeBody);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#0f172a;background:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="background:#ffffff;border-radius:12px;padding:24px 28px;border:1px solid #e2e8f0;">
        <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#0c4a6e;">Rent renewal notice</p>
        <p style="margin:0 0 20px;font-size:14px;color:#475569;">
          Your property manager has sent you a rent renewal notice through <strong>EstateFlow</strong>.
          The full letter is below. You can also read it anytime in your tenant dashboard under <strong>Alerts</strong>.
        </p>
        <pre style="margin:0;padding:16px;background:#f1f5f9;border-radius:8px;font-size:13px;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;color:#0f172a;border:1px solid #e2e8f0;">${safe}</pre>
        <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">This message was generated automatically. Please contact your property manager with questions.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildRentRenewalText(noticeBody: string): string {
  return [
    'Rent renewal notice (EstateFlow)',
    '',
    'Your property manager has sent you a rent renewal notice. The full letter follows.',
    'You can also read it in your tenant dashboard under Alerts.',
    '',
    '---',
    '',
    noticeBody.trim(),
    '',
    '---',
    'Please contact your property manager with questions.',
  ].join('\n');
}

@Injectable()
export class RentRenewalMailService {
  private readonly logger = new Logger(RentRenewalMailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.resend = key ? new Resend(key) : null;
    if (!key) {
      this.logger.warn(
        'RESEND_API_KEY is not set — rent renewal emails will be skipped (in-app notice is still created).',
      );
    }
  }

  /**
   * Sends the renewal letter to the tenant mailbox via Resend.
   * Never throws; logs failures. In-app notification is independent of email delivery.
   */
  async sendRentRenewalNoticeEmail(params: {
    to: string;
    subject: string;
    noticeBody: string;
  }): Promise<{ ok: boolean; skipped?: boolean; errorMessage?: string }> {
    if (!this.resend) {
      return { ok: false, skipped: true };
    }

    const from =
      this.config.get<string>('RESEND_FROM')?.trim() ||
      'EstateFlow <onboarding@resend.dev>';

    try {
      const result = await this.resend.emails.send({
        from,
        to: params.to.trim().toLowerCase(),
        subject: params.subject.trim() || 'Rent renewal notice',
        html: buildRentRenewalHtml(params.noticeBody),
        text: buildRentRenewalText(params.noticeBody),
        tags: [{ name: 'category', value: 'rent_renewal' }],
      });

      if (result.error) {
        const msg =
          typeof result.error.message === 'string'
            ? result.error.message
            : JSON.stringify(result.error);
        this.logger.warn(`Resend rent renewal email failed: ${msg}`);
        return { ok: false, errorMessage: msg };
      }

      this.logger.log(
        `Rent renewal email queued/sent via Resend id=${result.data?.id ?? 'unknown'} to=${params.to}`,
      );
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Resend rent renewal email exception: ${msg}`);
      return { ok: false, errorMessage: msg };
    }
  }
}
