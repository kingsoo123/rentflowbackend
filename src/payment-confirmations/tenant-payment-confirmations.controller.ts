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
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-payload';
import { UserRole } from '../users/user-role.enum';
import { CloudinaryService } from '../uploads/cloudinary.service';
import {
  imageUploadMulterOptions,
  type MemoryUploadedFile,
} from '../uploads/multer-memory';
import { SubmitPaymentConfirmationDto } from './dto/submit-payment-confirmation.dto';
import { TenantPaymentConfirmationsService } from './tenant-payment-confirmations.service';

@Controller('tenants/payment-confirmations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantPaymentConfirmationsController {
  constructor(
    private readonly tenantPaymentConfirmationsService: TenantPaymentConfirmationsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get('collection-account')
  collectionAccount(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantPaymentConfirmationsService.getCollectionAccountForTenant(req.user.sub);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', imageUploadMulterOptions))
  async upload(@UploadedFile() file: MemoryUploadedFile | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing file field "file"');
    }
    const uploaded = await this.cloudinaryService.uploadImageBuffer(
      file.buffer,
      'payment-receipts',
      { filenameHint: file.originalname, mimeType: file.mimetype },
    );
    return { path: uploaded.path, url: uploaded.url };
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
