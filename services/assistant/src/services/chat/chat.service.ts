import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma, ChatMessage } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProviderService } from '../provider/provider.service';
import { AgentService } from './agent.service';
import { ForwardedAuth } from './todo-client';

const HISTORY_LIMIT = 200;
// Only the recent tail of the conversation is replayed to the model; the full
// history stays in the DB for the UI.
const CONTEXT_TURNS = 30;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ProviderService,
    private readonly agent: AgentService,
  ) {}

  history(userId: string): Promise<ChatMessage[]> {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: HISTORY_LIMIT,
    });
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.chatMessage.deleteMany({ where: { userId } });
  }

  async send(
    userId: string,
    message: string,
    auth: ForwardedAuth,
  ): Promise<{ messages: ChatMessage[] }> {
    const provider = await this.provider.settings(userId);
    if (!provider) {
      throw new BadRequestException(
        'No model configured — this server has no default local model, so add an API key or a local endpoint in the assistant settings.',
      );
    }

    const history = (await this.history(userId)).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let result;
    try {
      result = await this.agent.run({
        provider,
        auth,
        history: history.slice(-CONTEXT_TURNS),
        message,
      });
    } catch (error) {
      const endpoint = provider.baseUrl ?? 'Anthropic';
      if (error instanceof Anthropic.AuthenticationError) {
        throw new BadRequestException(
          `${endpoint} rejected your API key — check it in the assistant settings.`,
        );
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new BadGatewayException(`${endpoint} rate limit hit — try again in a minute.`);
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new BadGatewayException(
          provider.baseUrl
            ? `Couldn't reach the model endpoint at ${provider.baseUrl} — is it running?`
            : "Couldn't reach the Anthropic API — check your connection.",
        );
      }
      if (error instanceof Anthropic.APIError) {
        // error.error is the parsed response body: {type:'error', error:{type, message}}.
        // Surface the provider's human-readable message, not the raw JSON dump.
        const body = error.error as { error?: { message?: string } } | undefined;
        throw new BadGatewayException(`${endpoint}: ${body?.error?.message ?? error.message}`);
      }
      throw error;
    }

    // Persist the exchange only after a successful run so a failed send can
    // simply be retried by the user.
    const userMessage = await this.prisma.chatMessage.create({
      data: { userId, role: 'user', content: message },
    });
    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        userId,
        role: 'assistant',
        content: result.text,
        actions: result.actions as Prisma.InputJsonValue,
      },
    });

    return { messages: [userMessage, assistantMessage] };
  }
}
