import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module';
import { resolveNestHttpPrefix } from './config/http-prefix';
import { rewriteBareApiPath } from './rewrite-bare-api-path';
import { RedisIoAdapter } from './realtime/redis.adapter';

async function bootstrap() {
  const expressApp = express();
  expressApp.use(rewriteBareApiPath);
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter);
  const httpPrefix = resolveNestHttpPrefix();
  if (httpPrefix) {
    app.setGlobalPrefix(httpPrefix);
  }
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
