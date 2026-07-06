import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { ensureDataSourceInitialized } from './database/data-source';

async function bootstrap() {
  await ensureDataSourceInitialized();
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: process.env.REQUEST_BODY_LIMIT || '100mb' }));
  app.use(
    urlencoded({
      extended: true,
      limit: process.env.REQUEST_BODY_LIMIT || '100mb',
    }),
  );
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3010')
      .split(',')
      .map((value) => value.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 5010);
}

void bootstrap();
