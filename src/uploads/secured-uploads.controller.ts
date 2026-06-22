import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { SecuredUploadsService } from './secured-uploads.service';

type AuthedRequest = Request & { user: JwtAccessPayload };

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class SecuredUploadsController {
  constructor(private readonly securedUploadsService: SecuredUploadsService) {}

  @Get('payment-receipts/:filename')
  async paymentReceipt(
    @Req() req: AuthedRequest,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, contentType } = await this.securedUploadsService.openPaymentReceipt(
      req.user,
      filename,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }

  @Get('maintenance/:filename')
  async maintenanceAttachment(
    @Req() req: AuthedRequest,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, contentType } = await this.securedUploadsService.openMaintenanceAttachment(
      req.user,
      filename,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }
}
