import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DepHealth } from './dep-health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DepHealth],
})
export class HealthModule {}
