import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from './common/auth/auth.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { ChatModule } from './services/chat/chat.module';
import { ProviderModule } from './services/provider/provider.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ProviderModule,
    ChatModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
