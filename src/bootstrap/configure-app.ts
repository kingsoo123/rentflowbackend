import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  const maintenanceUploadsDir = join(process.cwd(), 'uploads', 'maintenance');
  if (!existsSync(maintenanceUploadsDir)) {
    mkdirSync(maintenanceUploadsDir, { recursive: true });
  }
  const httpApp = app.getHttpAdapter().getInstance() as express.Application;
  httpApp.use('/api/uploads/maintenance', express.static(maintenanceUploadsDir));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const corsOrigin = configService.get<string | string[] | boolean>(
    'corsOrigin',
  );
  app.enableCors({ origin: corsOrigin ?? true });
}
