import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // REST under /meals-rmg/api — SPA/static stay under /meals-rmg/ (no overlap with ServeStatic).
  app.setGlobalPrefix('meals-rmg/api');
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
