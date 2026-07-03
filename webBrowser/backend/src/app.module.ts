import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { PreferencesModule } from './preferences/preferences.module';
import { ScribeModule } from './services/scribe/scribe.module';
import { TodoModule } from './services/todo/todo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PreferencesModule,
    TodoModule,
    ScribeModule,
  ],
})
export class AppModule {}
