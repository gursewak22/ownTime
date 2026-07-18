import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { open, seal } from '../../common/crypto/secret-box';

export type ProviderStatus = {
  configured: boolean;
  hint: string | null;
  baseUrl: string | null;
  model: string | null;
};

/** Decrypted settings for internal use (the agent loop). Never expose over HTTP. */
export type ProviderSettings = {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
};

export type SetProviderInput = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

@Injectable()
export class ProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    const secret = this.config.get<string>('ASSISTANT_KEY_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('ASSISTANT_KEY_SECRET is not configured');
    }
    return secret;
  }

  private static hint(apiKey: string): string {
    return `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`;
  }

  async status(userId: string): Promise<ProviderStatus> {
    const row = await this.prisma.providerConfig.findUnique({ where: { userId } });
    return {
      configured: row !== null && (row.ciphertext !== null || row.baseUrl !== null),
      hint: row?.hint ?? null,
      baseUrl: row?.baseUrl ?? null,
      model: row?.model ?? null,
    };
  }

  async set(userId: string, input: SetProviderInput): Promise<ProviderStatus> {
    const existing = await this.prisma.providerConfig.findUnique({ where: { userId } });

    // apiKey omitted = keep the stored key; baseUrl/model omitted = cleared
    // (the form always submits its full state).
    const ciphertext =
      input.apiKey !== undefined ? seal(input.apiKey, this.secret()) : existing?.ciphertext ?? null;
    const hint =
      input.apiKey !== undefined ? ProviderService.hint(input.apiKey) : existing?.hint ?? null;
    const baseUrl = input.baseUrl?.replace(/\/+$/, '') ?? null;
    const model = input.model ?? null;

    if (ciphertext === null && baseUrl === null) {
      throw new BadRequestException(
        'Provide an API key (hosted Anthropic) or a base URL (local/proxied endpoint).',
      );
    }

    await this.prisma.providerConfig.upsert({
      where: { userId },
      create: { userId, ciphertext, hint, baseUrl, model },
      update: { ciphertext, hint, baseUrl, model },
    });
    return {
      configured: true,
      hint,
      baseUrl,
      model,
    };
  }

  async remove(userId: string): Promise<void> {
    await this.prisma.providerConfig.deleteMany({ where: { userId } });
  }

  async settings(userId: string): Promise<ProviderSettings | null> {
    const row = await this.prisma.providerConfig.findUnique({ where: { userId } });
    if (!row || (row.ciphertext === null && row.baseUrl === null)) return null;
    return {
      apiKey: row.ciphertext === null ? null : open(row.ciphertext, this.secret()),
      baseUrl: row.baseUrl,
      model: row.model,
    };
  }
}
