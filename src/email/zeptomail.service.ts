import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtml } from '../common/escape-html';

export type SendZeptoMailParams = {
  to: string;
  toName?: string;
  subject: string;
  htmlbody: string;
  textbody?: string;
};

export type SendZeptoMailResult =
  | { ok: true; requestId?: string }
  | { ok: false; status: number; message: string };

@Injectable()
export class ZeptoMailService {
  private readonly logger = new Logger(ZeptoMailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('ZEPTOMAIL_TOKEN')?.trim());
  }

  async send(params: SendZeptoMailParams): Promise<SendZeptoMailResult> {
    const token = this.config.get<string>('ZEPTOMAIL_TOKEN')?.trim();
    if (!token) {
      return { ok: false, status: 503, message: 'ZEPTOMAIL_TOKEN is not configured' };
    }

    const fromAddress =
      this.config.get<string>('ZEPTOMAIL_FROM_ADDRESS')?.trim() ||
      'noreply@zenithinnovation.com.ng';
    const fromName =
      this.config.get<string>('ZEPTOMAIL_FROM_NAME')?.trim() || 'Rent Pilot';
    const apiUrl =
      this.config.get<string>('ZEPTOMAIL_API_URL')?.trim() ||
      'https://api.zeptomail.com/v1.1/email';

    const auth = /^zoho-enczapikey\s+/i.test(token)
      ? token
      : `Zoho-enczapikey ${token}`;

    const body: Record<string, unknown> = {
      from: { address: fromAddress, name: fromName },
      to: [
        {
          email_address: {
            address: params.to.trim().toLowerCase(),
            name: params.toName?.trim() || params.to.trim(),
          },
        },
      ],
      subject: params.subject,
      htmlbody: params.htmlbody,
    };
    if (params.textbody?.trim()) {
      body.textbody = params.textbody;
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: auth,
        },
        body: JSON.stringify(body),
      });
      const raw = await response.text();
      let parsed: {
        request_id?: string;
        message?: string;
        error?: { message?: string };
      } = {};
      try {
        parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
      } catch {
        // non-JSON
      }

      if (!response.ok) {
        const message =
          parsed.error?.message ||
          parsed.message ||
          (raw.trim() ? raw.slice(0, 300) : `ZeptoMail error (${response.status})`);
        this.logger.warn(`ZeptoMail send failed status=${response.status}: ${message}`);
        return { ok: false, status: response.status, message };
      }

      return { ok: true, requestId: parsed.request_id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`ZeptoMail request exception: ${message}`);
      return { ok: false, status: 502, message };
    }
  }

  async sendSignupOtp(params: {
    to: string;
    fullName: string;
    otp: string;
    expiresMinutes: number;
  }): Promise<SendZeptoMailResult> {
    const safeName = escapeHtml(params.fullName.trim() || 'there');
    const safeOtp = escapeHtml(params.otp);
    const subject = 'Your Rent Pilot verification code';
    const htmlbody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;">
    <tr>
      <td style="background:#0a192f;color:#fff;border-radius:12px 12px 0 0;padding:20px 24px;">
        <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6ffbbe;">Rent Pilot</p>
        <h1 style="margin:8px 0 0;font-size:20px;">Verify your email</h1>
      </td>
    </tr>
    <tr>
      <td style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px;">
        <p style="margin:0 0 12px;font-size:15px;">Hi ${safeName},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;">
          Use this one-time code to finish creating your Rent Pilot account. It expires in ${params.expiresMinutes} minutes.
        </p>
        <p style="margin:0 0 20px;text-align:center;font-size:32px;font-weight:700;letter-spacing:0.35em;color:#0a192f;">
          ${safeOtp}
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          If you did not create an account, you can ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
    const textbody = [
      `Hi ${params.fullName.trim() || 'there'},`,
      '',
      `Your Rent Pilot verification code is: ${params.otp}`,
      `It expires in ${params.expiresMinutes} minutes.`,
      '',
      'If you did not create an account, ignore this email.',
    ].join('\n');

    return this.send({
      to: params.to,
      toName: params.fullName,
      subject,
      htmlbody,
      textbody,
    });
  }
}
