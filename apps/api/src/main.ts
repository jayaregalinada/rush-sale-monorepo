import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/load-env';

/** Bind on all interfaces so the API is reachable from inside the docker network. */
const LISTEN_HOST = '0.0.0.0';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.enableCors();
  app.enableShutdownHooks();

  await app.listen(env.PORT, LISTEN_HOST);
  app.get(Logger).log(`API listening on :${env.PORT}`);
}

void bootstrap();
