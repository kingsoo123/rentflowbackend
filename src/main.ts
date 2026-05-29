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
  const port = configService.get<number>('port') ?? 3001;
  await app.listen(port);
}
bootstrap();
