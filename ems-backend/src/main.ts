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
  const defaultCorsOrigins = [
    'http://localhost:3010',
    'http://127.0.0.1:3010',
    'https://tms.sjsangath.com',
  ];
  // Environment values extend the safe defaults instead of replacing them.
  // This keeps the production frontend working if CORS_ORIGINS is set without
  // including the production URL.
  const corsOrigins = [
    ...new Set([
      ...defaultCorsOrigins,
      ...(process.env.CORS_ORIGINS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ]),
  ];

  const isPrivateNetworkFrontend = (origin: string) => {
    try {
      const url = new URL(origin);
      const { hostname, port, protocol } = url;

      return (
        protocol === 'http:' &&
        port === '3010' &&
        (hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          /^10\./.test(hostname) ||
          /^192\.168\./.test(hostname) ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname))
      );
    } catch {
      return false;
    }
  };

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin) || isPrivateNetworkFrontend(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 5010, '0.0.0.0');
}

void bootstrap();
