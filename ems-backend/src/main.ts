import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import {
  ensureDataSourceInitialized,
  ensurePerformanceIndexes,
} from './database/data-source';

async function bootstrap() {
  await ensureDataSourceInitialized();
  await ensurePerformanceIndexes();
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: process.env.REQUEST_BODY_LIMIT || '100mb' }));
  app.use(
    urlencoded({
      extended: true,
      limit: process.env.REQUEST_BODY_LIMIT || '100mb',
    }),
  );
  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    'http://localhost:3010,http://127.0.0.1:3010,https://tms.sjsangath.com'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 5010);
}

void bootstrap();
