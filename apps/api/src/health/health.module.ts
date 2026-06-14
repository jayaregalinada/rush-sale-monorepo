import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DepHealth, HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DepHealth],
})
export class HealthModule {}
