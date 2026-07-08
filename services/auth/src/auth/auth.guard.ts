import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

export type AuthedRequest = Request & { user?: { userId: string } };

/**
 * Global guard (APP_GUARD): every route requires a Bearer access token unless
 * marked @Public(). Runs before interceptors/pipes/param decorators, so
 * req.user is always set by the time @CurrentUser() reads it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    const header = req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string }>(header.slice(7));
        req.user = { userId: payload.sub };
        return true;
      } catch {
        throw new UnauthorizedException('Invalid or expired access token');
      }
    }

    // Dev fallback: the pre-auth x-user-id seam. Double-gated so a copied
    // .env alone can never open the spoofing hole in production.
    if (
      this.config.get('AUTH_ALLOW_DEV_HEADER') === 'true' &&
      process.env.NODE_ENV !== 'production'
    ) {
      const devId = req.header('x-user-id')?.trim();
      if (devId) {
        req.user = { userId: devId };
        return true;
      }
    }

    throw new UnauthorizedException('Missing credentials');
  }
}
