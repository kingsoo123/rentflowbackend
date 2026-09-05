import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  FlutterwaveStandardPaymentResponse,
  FlutterwaveVerifyTransactionResponse,
} from './flutterwave-standard.types';

const FLUTTERWAVE_V3_BASE = 'https://api.flutterwave.com/v3';

@Injectable()
export class FlutterwaveStandardService {
  private readonly logger = new Logger(FlutterwaveStandardService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('FLUTTERWAVE_SECRET_KEY')?.trim());
  }

  get webhookHash(): string {
    return this.config.get<string>('FLUTTERWAVE_WEBHOOK_HASH')?.trim() ?? '';
  }

  private secretKey(): string {
    const key = this.config.get<string>('FLUTTERWAVE_SECRET_KEY')?.trim();
    if (!key) {
      throw new InternalServerErrorException(
        'Flutterwave is not configured (FLUTTERWAVE_SECRET_KEY).',
      );
    }
    return key;
  }

  async createHostedCheckout(input: {
    txRef: string;
    amountNgn: number;
    currency?: string;
    redirectUrl: string;
    customerEmail: string;
    customerName: string;
    customerPhone?: string;
    title: string;
    description: string;
  }): Promise<{ checkoutUrl: string }> {
    const body = {
      tx_ref: input.txRef,
      amount: input.amountNgn,
      currency: input.currency ?? 'NGN',
      redirect_url: input.redirectUrl,
      customer: {
        email: input.customerEmail,
        name: input.customerName,
        ...(input.customerPhone?.trim()
          ? { phonenumber: input.customerPhone.trim() }
          : {}),
      },
      customizations: {
        title: input.title,
        description: input.description,
        logo: 'https://rentpilot.com.ng/favicon.ico',
      },
      meta: {
        source: 'rent_pilot_pricing',
      },
    };

    const response = await fetch(`${FLUTTERWAVE_V3_BASE}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as FlutterwaveStandardPaymentResponse;
    if (!response.ok || payload.status !== 'success' || !payload.data?.link) {
      this.logger.error(
        `Flutterwave checkout failed (${response.status}): ${JSON.stringify(payload)}`,
      );
      throw new BadRequestException(
        payload.message ?? 'Could not start Flutterwave checkout.',
      );
    }

    return { checkoutUrl: payload.data.link };
  }

  async verifyByTxRef(
    txRef: string,
  ): Promise<NonNullable<FlutterwaveVerifyTransactionResponse['data']> | null> {
    const url = new URL(`${FLUTTERWAVE_V3_BASE}/transactions/verify_by_reference`);
    url.searchParams.set('tx_ref', txRef);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.secretKey()}`,
        'Content-Type': 'application/json',
      },
    });

    const payload = (await response.json().catch(() => ({}))) as FlutterwaveVerifyTransactionResponse;
    if (!response.ok || payload.status !== 'success' || !payload.data) {
      this.logger.warn(
        `Flutterwave verify failed for ${txRef}: ${JSON.stringify(payload)}`,
      );
      return null;
    }

    return payload.data;
  }
}
