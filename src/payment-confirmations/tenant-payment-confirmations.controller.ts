import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { SubmitPaymentConfirmationDto } from './dto/submit-payment-confirmation.dto';
import { TenantPaymentConfirmationsService } from './tenant-payment-confirmations.service';

function resolvePublicBaseUrl(req: Request): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (fromEnv) {
    return fromEnv;
  }
  const xfProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof xfProto === 'string' ? xfProto.split(',')[0]?.trim() || 'http' : 'http';
  const host = req.get('host') ?? 'localhost:3002';
  return `${proto}://${host}`;
}

@Controller('tenants/payment-confirmations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantPaymentConfirmationsController {
  constructor(
    private readonly tenantPaymentConfirmationsService: TenantPaymentConfirmationsService,
  ) {}

  @Get('collection-account')
  collectionAccount(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantPaymentConfirmationsService.getCollectionAccountForTenant(req.user.sub);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'payment-receipts');
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const raw = extname(file.originalname).toLowerCase();
          const ext = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(raw) ? raw : '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new Error('Only image files are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@Req() req: Request, @UploadedFile() file: { filename: string } | undefined) {
    if (!file) {
      throw new BadRequestException('Missing file field "file"');
    }
    const path = `/api/uploads/payment-receipts/${file.filename}`;
    const base = resolvePublicBaseUrl(req);
    return { path, url: `${base}${path}` };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Req() req: Request & { user: JwtAccessPayload },
    @Body() dto: SubmitPaymentConfirmationDto,
  ) {
    return this.tenantPaymentConfirmationsService.submitForTenant(req.user.sub, dto);
  }

  @Get('history')
  paymentHistory(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantPaymentConfirmationsService.listPaymentHistoryForTenant(req.user.sub);
  }

  @Get(':id/receipt')
  async downloadReceipt(
    @Req() req: Request & { user: JwtAccessPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.tenantPaymentConfirmationsService.buildReceiptPdfForTenant(
      req.user.sub,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payment-receipt-${id}.pdf"`);
    res.send(buf);
  }
}
