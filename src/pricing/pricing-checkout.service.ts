import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { FlutterwaveStandardService } from '../flutterwave/flutterwave-standard.service';
import type { FlutterwaveV3WebhookPayload } from '../flutterwave/flutterwave-standard.types';
import { AdminRealtimeService } from '../admin/admin-realtime.service';
import type { CreatePricingCheckoutDto } from './dto/create-pricing-checkout.dto';
import { PricingCheckout } from './pricing-checkout.entity';
import { PricingCheckoutStatus } from './pricing-checkout-status.enum';
import { getPricingPlan } from './pricing-plans';

export type PricingCheckoutSession = {
  checkoutId: string;
  txRef: string;
  checkoutUrl: string;
  planId: string;
  planName: string;
  amountNgn: number;
  currency: string;
};

export type PricingCheckoutStatusResult = {
  txRef: string;
  status: PricingCheckoutStatus;
  planId: string;
  planName: string;
  amountNgn: number;
  currency: string;
  paidAt: string | null;
};

@Injectable()
export class PricingCheckoutService {
  private readonly logger = new Logger(PricingCheckoutService.name);

  constructor(
    @InjectRepository(PricingCheckout)
    private readonly checkoutsRepository: Repository<PricingCheckout>,
    private readonly flutterwave: FlutterwaveStandardService,
    private readonly config: ConfigService,
    private readonly adminRealtime: AdminRealtimeService,
  ) {}

  async createCheckout(dto: CreatePricingCheckoutDto): Promise<PricingCheckoutSession> {
    if (!this.flutterwave.isConfigured()) {
      throw new ServiceUnavailableException(
        'Online plan checkout is not configured yet. Set FLUTTERWAVE_SECRET_KEY on the API server.',
      );
    }

    const plan = getPricingPlan(dto.planId);
    const txRef = this.buildTxRef(plan.id);
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();
    const phone = dto.phone?.trim() || null;

    const redirectUrl = `${this.publicWebUrl()}/pricing/payment/success?tx_ref=${encodeURIComponent(txRef)}`;

    const checkout = this.checkoutsRepository.create({
      txRef,
      planId: plan.id,
      planName: plan.name,
      amountNgn: plan.amountNgn,
      currency: 'NGN',
      customerName: fullName,
      customerEmail: email,
      customerPhone: phone,
      status: PricingCheckoutStatus.PENDING,
    });

    let saved = await this.checkoutsRepository.save(checkout);

    try {
      const hosted = await this.flutterwave.createHostedCheckout({
        txRef,
        amountNgn: plan.amountNgn,
        redirectUrl,
        customerEmail: email,
        customerName: fullName,
        customerPhone: phone ?? undefined,
        title: `Rent Pilot — ${plan.name}`,
        description: plan.description,
      });

      saved.checkoutUrl = hosted.checkoutUrl;
      saved = await this.checkoutsRepository.save(saved);

      this.emitAdminPaymentUpdate(saved);

      return {
        checkoutId: saved.id,
        txRef: saved.txRef,
        checkoutUrl: hosted.checkoutUrl,
        planId: saved.planId,
        planName: saved.planName,
        amountNgn: saved.amountNgn,
        currency: saved.currency,
      };
    } catch (err) {
      saved.status = PricingCheckoutStatus.FAILED;
      saved = await this.checkoutsRepository.save(saved);
      this.emitAdminPaymentUpdate(saved);
      throw err;
    }
  }

  async getStatusByTxRef(
    txRef: string,
    redirectStatus?: string,
  ): Promise<PricingCheckoutStatusResult> {
    const normalized = txRef.trim();
    const row = await this.checkoutsRepository.findOne({
      where: { txRef: normalized },
    });
    if (!row) {
      throw new BadRequestException('Checkout session not found.');
    }

    await this.applyRedirectStatus(row, redirectStatus);

    const afterRedirect = await this.checkoutsRepository.findOne({
      where: { txRef: normalized },
    });
    if (!afterRedirect) {
      throw new BadRequestException('Checkout session not found.');
    }

    if (
      afterRedirect.status === PricingCheckoutStatus.PENDING &&
      this.flutterwave.isConfigured()
    ) {
      await this.syncFromFlutterwave(afterRedirect);
    }

    const refreshed = await this.checkoutsRepository.findOne({
      where: { txRef: normalized },
    });
    if (!refreshed) {
      throw new BadRequestException('Checkout session not found.');
    }

    return this.toStatusResult(refreshed);
  }

  verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const secret = this.flutterwave.webhookHash;
    if (!secret) {
      return;
    }

    const verifHash = this.headerValue(headers['verif-hash']);
    if (verifHash && this.safeCompare(verifHash, secret)) {
      return;
    }

    throw new UnauthorizedException('Invalid Flutterwave webhook signature.');
  }

  async handleWebhook(payload: FlutterwaveV3WebhookPayload): Promise<void> {
    const txRef = payload.data?.tx_ref?.trim();
    if (!txRef) {
      return;
    }

    const row = await this.checkoutsRepository.findOne({ where: { txRef } });
    if (!row) {
      this.logger.warn(`Webhook for unknown pricing tx_ref=${txRef}`);
      return;
    }

    await this.syncFromFlutterwave(row);
  }

  private async syncFromFlutterwave(row: PricingCheckout): Promise<void> {
    const verified = await this.flutterwave.verifyByTxRef(row.txRef);
    if (!verified) {
      return;
    }

    const expectedAmount = row.amountNgn;
    const paidAmount = Number(verified.amount ?? verified.charged_amount ?? 0);
    if (paidAmount > 0 && paidAmount < expectedAmount) {
      this.logger.warn(
        `Amount mismatch for ${row.txRef}: expected ${expectedAmount}, got ${paidAmount}`,
      );
    }

    const fwStatus = (verified.status ?? '').toLowerCase();
    let nextStatus = row.status;
    if (fwStatus === 'successful') {
      nextStatus = PricingCheckoutStatus.SUCCESSFUL;
    } else if (fwStatus === 'failed') {
      nextStatus = PricingCheckoutStatus.FAILED;
    } else if (fwStatus === 'cancelled') {
      nextStatus = PricingCheckoutStatus.CANCELLED;
    }

    if (nextStatus === row.status && row.flutterwaveTransactionId) {
      return;
    }

    await this.checkoutsRepository.update(
      { id: row.id },
      {
        status: nextStatus,
        flutterwaveTransactionId:
          verified.id != null ? String(verified.id) : row.flutterwaveTransactionId,
        flutterwaveFlwRef: verified.flw_ref ?? row.flutterwaveFlwRef,
        paidAt:
          nextStatus === PricingCheckoutStatus.SUCCESSFUL
            ? row.paidAt ?? new Date()
            : row.paidAt,
      },
    );

    const updated = await this.checkoutsRepository.findOne({ where: { id: row.id } });
    if (updated) {
      this.emitAdminPaymentUpdate(updated);
    }

    if (nextStatus === PricingCheckoutStatus.SUCCESSFUL) {
      this.logger.log(
        `Pricing checkout paid: ${row.txRef} plan=${row.planId} amount=${row.amountNgn} NGN`,
      );
    }
  }

  private async applyRedirectStatus(
    row: PricingCheckout,
    redirectStatus?: string,
  ): Promise<void> {
    if (!redirectStatus?.trim() || row.status !== PricingCheckoutStatus.PENDING) {
      return;
    }
    const normalized = redirectStatus.trim().toLowerCase();
    let next: PricingCheckoutStatus | null = null;
    if (normalized === 'cancelled' || normalized === 'canceled') {
      next = PricingCheckoutStatus.CANCELLED;
    } else if (normalized === 'failed') {
      next = PricingCheckoutStatus.FAILED;
    }
    if (!next) {
      return;
    }
    await this.checkoutsRepository.update({ id: row.id }, { status: next });
    const updated = await this.checkoutsRepository.findOne({ where: { id: row.id } });
    if (updated) {
      this.emitAdminPaymentUpdate(updated);
    }
  }

  private emitAdminPaymentUpdate(row: PricingCheckout): void {
    this.adminRealtime.notifySubscriptionPaymentChanged({
      id: row.id,
      txRef: row.txRef,
      status: row.status,
      planName: row.planName,
      customerEmail: row.customerEmail,
      amountNgn: row.amountNgn,
    });
  }

  private buildTxRef(planId: string): string {
    const suffix = randomBytes(6).toString('hex');
    return `rp-${planId}-${Date.now()}-${suffix}`;
  }

  private publicWebUrl(): string {
    const explicit = this.config.get<string>('PUBLIC_WEB_URL')?.trim();
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }
    const cors = this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim();
    if (cors) {
      return cors.replace(/\/+$/, '');
    }
    return 'http://localhost:3000';
  }

  private toStatusResult(row: PricingCheckout): PricingCheckoutStatusResult {
    return {
      txRef: row.txRef,
      status: row.status,
      planId: row.planId,
      planName: row.planName,
      amountNgn: row.amountNgn,
      currency: row.currency,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    };
  }

  private headerValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
      return value[0]?.trim() ?? '';
    }
    return value?.trim() ?? '';
  }

  private safeCompare(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }
}
