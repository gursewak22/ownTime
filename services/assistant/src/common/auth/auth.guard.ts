import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { IS_PUBLIC_KEY } from './public.decorator';

export type AuthedRequest = Request & { user?: { userId: string } };

/**
 * Global guard (APP_GUARD): every route requires a Bearer access token unless
 * marked @Public(). Unlike the auth service — which holds the RS256 keypair —
 * this service verifies tokens against the auth service's published JWKS
 * (ADR 0005/0006): fetched over the internal service network, cached by jose,
 * refetched on unknown `kid` so key rollover needs no redeploy here.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  private remoteJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks) {
      const url =
        this.config.get<string>('AUTH_JWKS_URL') ??
        'http://localhost:3001/auth/.well-known/jwks.json';
      this.jwks = createRemoteJWKSet(new URL(url), {
        cacheMaxAge: 10 * 60_000, // re-fetch at most every 10 minutes
        cooldownDuration: 30_000, // …but on unknown kid, retry no sooner than this
      });
    }
    return this.jwks;
  }

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
        const { payload } = await jwtVerify(header.slice(7), this.remoteJwks(), {
          algorithms: ['RS256'],
        });
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
          throw new Error('missing sub');
        }
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
