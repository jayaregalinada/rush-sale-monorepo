import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadEnv } from './config/load-env';

/** Bind on all interfaces so the API is reachable from inside the docker network. */
const LISTEN_HOST = '0.0.0.0';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // No CORS: the SPA is served same-origin and reaches the API through the /api proxy
  // (nginx in containers, Vite in dev), so the browser never makes a cross-origin call.
  // Enabling wide-open CORS would only add needless surface. Non-browser clients (curl,
  // server-to-server) ignore CORS entirely, so they are unaffected.
  app.enableShutdownHooks();

  await app.listen(env.PORT, LISTEN_HOST);
  app.get(Logger).log(`API listening on :${env.PORT}`);
}

void bootstrap();
