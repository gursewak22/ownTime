import { Module } from '@nestjs/common';
import { ScribeController } from './scribe.controller';
import { ScribeService } from './scribe.service';

@Module({
  controllers: [ScribeController],
  providers: [ScribeService],
  exports: [ScribeService],
})
export class ScribeModule {}
