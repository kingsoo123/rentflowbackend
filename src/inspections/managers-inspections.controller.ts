import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
import {
  CompleteInspectionDto,
  CreateInspectionDto,
  UpdateInspectionDto,
} from './dto/inspection.dto';
import { InspectionsService } from './inspections.service';

type AuthedManagerRequest = Request & { user: JwtAccessPayload };

@Controller('managers/inspections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROPERTY_MANAGER)
export class ManagersInspectionsController {
  constructor(
    private readonly inspectionsService: InspectionsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  list(@Req() req: AuthedManagerRequest) {
    return this.inspectionsService.listForManager(req.user.sub);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.inspectionsService.getForManager(req.user.sub, id);
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
      'inspections',
      { filenameHint: file.originalname, mimeType: file.mimetype },
    );
    return { path: uploaded.path, url: uploaded.url };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthedManagerRequest, @Body() dto: CreateInspectionDto) {
    return this.inspectionsService.createForManager(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInspectionDto,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.inspectionsService.updateForManager(req.user.sub, id, dto);
  }

  @Post(':id/complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteInspectionDto,
    @Req() req: AuthedManagerRequest,
  ) {
    return this.inspectionsService.completeForManager(req.user.sub, id, dto);
  }
}
