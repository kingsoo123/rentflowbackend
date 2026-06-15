import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { configureApp } from './bootstrap/configure-app';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  configureApp(app);

  const configService = app.get(ConfigService);
  const preferredPort = configService.get<number>('port') ?? 3002;
  const logger = new Logger('Bootstrap');
  const maxAttempts = 20;
  let port = preferredPort;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await app.listen(port);
      if (port !== preferredPort) {
        logger.warn(
          `Port ${preferredPort} is in use; listening on ${port}. Point clients at http://localhost:${port} (e.g. NEXT_PUBLIC_API_URL) or set PORT=${port} in .env.`,
        );
      }
      return;
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'EADDRINUSE' && attempt < maxAttempts - 1) {
        port += 1;
        continue;
      }
      throw e;
    }
  }
}
bootstrap();
