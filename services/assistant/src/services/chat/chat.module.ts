import { Module } from '@nestjs/common';
import { ProviderModule } from '../provider/provider.module';
import { AgentService } from './agent.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { TodoClient } from './todo-client';
import { ScribeClient } from './scribe-client';

@Module({
  imports: [ProviderModule],
  controllers: [ChatController],
  providers: [ChatService, AgentService, TodoClient, ScribeClient],
})
export class ChatModule {}
