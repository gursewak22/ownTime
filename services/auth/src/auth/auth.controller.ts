import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, SessionResponse } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { JWT_KEYS, JwtKeys } from './jwt-keys';
import { Public } from './public.decorator';
import { Inject } from '@nestjs/common';

/** The refresh token rides in this HttpOnly cookie, scoped to the auth routes. */
const REFRESH_COOKIE = 'owntime_rt';

/** What the client actually receives — the refresh token stays server↔cookie only. */
type PublicSession = { accessToken: string; user: SessionResponse['user'] };

// @Public() is applied per method, not on the class, so a future authed
// endpoint (e.g. GET /auth/me) can't accidentally ship unauthenticated.
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    @Inject(JWT_KEYS) private readonly keys: JwtKeys,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('google')
  async loginWithGoogle(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicSession> {
    return this.setSession(res, await this.auth.loginWithGoogle(dto.idToken));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicSession> {
    this.assertSameOrigin(req);
    const token = this.readRefreshCookie(req);
    if (!token) throw new UnauthorizedException('Missing refresh token');
    return this.setSession(res, await this.auth.refresh(token));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertSameOrigin(req);
    const token = this.readRefreshCookie(req);
    if (token) await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  /** Public keys so a separately deployed service can verify our access tokens. */
  @Public()
  @Get('.well-known/jwks.json')
  jwks(): { keys: JwtKeys['jwk'][] } {
    return { keys: [this.keys.jwk] };
  }

  // --- helpers -------------------------------------------------------------

  private setSession(res: Response, session: SessionResponse): PublicSession {
    const ttlDays = Number(this.config.get('AUTH_REFRESH_TOKEN_TTL_DAYS') ?? 30);
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      // Defaults to secure in production; AUTH_COOKIE_SECURE=false opts out for
      // TLS-less private deployments (e.g. LAN-only, before a real cert).
      secure:
        (this.config.get<string>('AUTH_COOKIE_SECURE') ??
          String(process.env.NODE_ENV === 'production')) === 'true',
      sameSite: 'strict',
      path: '/auth',
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private readRefreshCookie(req: Request): string | undefined {
    return (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
  }

  /**
   * CSRF defense-in-depth for the two cookie-bearing routes: SameSite=Strict
   * already blocks cross-site sends; this rejects any request whose Origin is
   * present and not in the allowlist. Same-origin requests may omit Origin.
   */
  private assertSameOrigin(req: Request): void {
    const origin = req.headers.origin;
    if (!origin) return;
    const allowed = (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim());
    if (!allowed.includes(origin)) throw new ForbiddenException('Cross-origin request rejected');
  }
}
