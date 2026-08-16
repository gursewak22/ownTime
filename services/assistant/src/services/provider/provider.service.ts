import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { open, seal } from '../../common/crypto/secret-box';

export type ServerDefault = { baseUrl: string; model: string };

export type ProviderStatus = {
  /** True when the assistant can run: a stored user config or the server default. */
  configured: boolean;
  hint: string | null;
  /** The user's stored endpoint/model only — the server default is reported separately. */
  baseUrl: string | null;
  model: string | null;
  serverDefault: ServerDefault | null;
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

  /** Env-level fallback (ADR 0007 addendum): a local Ollama endpoint used for
   * users with no stored config. Both values must be set to activate it. */
  serverDefault(): ServerDefault | null {
    const baseUrl = this.config
      .get<string>('ASSISTANT_DEFAULT_BASE_URL')
      ?.trim()
      .replace(/\/+$/, '');
    const model = this.config.get<string>('ASSISTANT_DEFAULT_MODEL')?.trim();
    return baseUrl && model ? { baseUrl, model } : null;
  }

  async status(userId: string): Promise<ProviderStatus> {
    const row = await this.prisma.providerConfig.findUnique({ where: { userId } });
    const serverDefault = this.serverDefault();
    const userConfigured = row !== null && (row.ciphertext !== null || row.baseUrl !== null);
    return {
      configured: userConfigured || serverDefault !== null,
      hint: row?.hint ?? null,
      baseUrl: row?.baseUrl ?? null,
      model: row?.model ?? null,
      serverDefault,
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
      serverDefault: this.serverDefault(),
    };
  }

  async remove(userId: string): Promise<void> {
    await this.prisma.providerConfig.deleteMany({ where: { userId } });
  }

  async settings(userId: string): Promise<ProviderSettings | null> {
    const row = await this.prisma.providerConfig.findUnique({ where: { userId } });
    if (!row || (row.ciphertext === null && row.baseUrl === null)) {
      const fallback = this.serverDefault();
      return fallback ? { apiKey: null, ...fallback } : null;
    }
    return {
      apiKey: row.ciphertext === null ? null : open(row.ciphertext, this.secret()),
      baseUrl: row.baseUrl,
      model: row.model,
    };
  }
}
