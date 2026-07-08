import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from './common/auth/auth.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { ScribeModule } from './services/scribe/scribe.module';
import { TodoModule } from './services/todo/todo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TodoModule,
    ScribeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
