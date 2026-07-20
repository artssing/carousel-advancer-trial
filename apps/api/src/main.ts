import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { json, raw, urlencoded } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable Nest's default body parser so we can raise the size limit.
  // Listings embed images as base64 data URLs in the JSON body, which blows
  // past Express's 100kb default and returns 413 Payload Too Large.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: false, bodyParser: false });
  // Local-disk storage driver (apps/api/src/storage) serves uploaded files
  // from here. Swapping STORAGE_DRIVER=s3 later makes this dir unused but
  // harmless to leave mounted.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  // 50MB ceiling — accommodates listing with images + video (base64).
  // Founder ruling Q3 2026-06-11: front-end enforces actual per-file caps (15MB
  // video, compressed images ~500KB each); backlog item to split video into
  // separate multipart endpoint so non-listing routes don't carry this overhead.
  // Stripe webhook needs the EXACT raw bytes for HMAC signature verification —
  // mount raw() on that route before json() eats the body.
  app.use('/api/webhooks/stripe', raw({ type: '*/*' }));
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  const origins = (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api');
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();
