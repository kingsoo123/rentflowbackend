import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);

  const httpAdapter = app.getHttpAdapter();
  const expressInstance = httpAdapter.getInstance() as {
    set?: (setting: string, value: unknown) => void;
  };
  expressInstance.set?.('trust proxy', 1);

  app.setGlobalPrefix('api');

  const maintenanceUploadsDir = join(process.cwd(), 'uploads', 'maintenance');
  if (!existsSync(maintenanceUploadsDir)) {
    mkdirSync(maintenanceUploadsDir, { recursive: true });
  }
  const paymentReceiptsDir = join(process.cwd(), 'uploads', 'payment-receipts');
  if (!existsSync(paymentReceiptsDir)) {
    mkdirSync(paymentReceiptsDir, { recursive: true });
  }

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
