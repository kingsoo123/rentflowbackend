import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
import { SubmitMaintenanceRequestDto } from './dto/submit-maintenance-request.dto';
import { TenantMaintenanceRequestsService } from './tenant-maintenance-requests.service';

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

@Controller('tenants/maintenance-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TENANT)
export class TenantMaintenanceRequestsController {
  constructor(
    private readonly tenantMaintenanceRequestsService: TenantMaintenanceRequestsService,
  ) {}

  @Get()
  list(@Req() req: Request & { user: JwtAccessPayload }) {
    return this.tenantMaintenanceRequestsService.listForTenant(req.user.sub);
  }

  /**
   * Multipart upload for maintenance photos. Serves files from `/api/uploads/maintenance/*`.
   * Returns `path` (for clients that build URLs from their API base) and `url` (absolute, for validators).
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'maintenance');
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
      limits: { fileSize: 5 * 1024 * 1024 },
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
    const path = `/api/uploads/maintenance/${file.filename}`;
    const base = resolvePublicBaseUrl(req);
    return { path, url: `${base}${path}` };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request & { user: JwtAccessPayload },
    @Body() dto: SubmitMaintenanceRequestDto,
  ) {
    return this.tenantMaintenanceRequestsService.createForTenant(
      req.user.sub,
      dto,
    );
  }
}
