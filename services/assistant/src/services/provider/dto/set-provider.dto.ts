import { IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

export class SetProviderDto {
  // Omitted = keep the currently stored key (the UI never sees it back, so it
  // can't re-send it). Only sanity-check the shape so obvious paste mistakes
  // fail fast.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  @Matches(/^sk-/, { message: 'apiKey must be an API key (starts with sk-)' })
  apiKey?: string;

  // Anthropic-format endpoint override, e.g. http://localhost:11434 (Ollama)
  // or a LiteLLM proxy. Omitted/empty = Anthropic's hosted API.
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model?: string;
}
