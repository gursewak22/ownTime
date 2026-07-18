import { Module } from '@nestjs/common';
import { ProviderModule } from '../provider/provider.module';
import { AgentService } from './agent.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { TodoClient } from './todo-client';

@Module({
  imports: [ProviderModule],
  controllers: [ChatController],
  providers: [ChatService, AgentService, TodoClient],
})
export class ChatModule {}
