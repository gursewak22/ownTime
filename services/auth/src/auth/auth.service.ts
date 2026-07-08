import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';

export type SessionResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string | null; name: string | null; picture: string | null };
};

/**
 * After a refresh token is consumed it stays usable this long, so a lost
 * response or a second tab holding the stale token still recovers. Reuse of a
 * consumed token *after* this window is treated as theft (ADR 0005).
 */
const ROTATION_GRACE_MS = 60_000;

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async loginWithGoogle(idToken: string): Promise<SessionResponse> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException('Google login is not configured (GOOGLE_CLIENT_ID)');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google ID token');
    }
    if (!payload?.sub) throw new UnauthorizedException('Invalid Google ID token');

    // Only trust the email if Google says it is verified — otherwise it must
    // never be used to key or link an account (ADR 0005). googleSub stays the
    // identity key regardless.
    const email = payload.email_verified ? (payload.email ?? null) : null;

    const user = await this.prisma.user.upsert({
      where: { googleSub: payload.sub },
      create: { googleSub: payload.sub, email, name: payload.name ?? null, picture: payload.picture ?? null },
      update: { email, name: payload.name ?? null, picture: payload.picture ?? null },
    });

    return this.issueSession(user.id);
  }

  async refresh(refreshToken: string): Promise<SessionResponse> {
    const tokenHash = this.hash(refreshToken);
    const now = new Date();

    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!row || row.expiresAt < now) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (row.rotatedAt) {
      // Already consumed. Inside the grace window this is a benign replay
      // (lost response / second tab) — issue a fresh token in the same family.
      if (now.getTime() - row.rotatedAt.getTime() <= ROTATION_GRACE_MS) {
        return this.issueSession(row.userId, row.familyId);
      }
      // Outside the window a consumed token should never reappear: treat it as
      // a stolen token and revoke the whole family, logging every session out.
      await this.prisma.refreshToken.deleteMany({ where: { familyId: row.familyId } });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Fresh token: consume it, then mint its successor in the same family.
    await this.prisma.refreshToken.update({ where: { tokenHash }, data: { rotatedAt: now } });
    return this.issueSession(row.userId, row.familyId);
  }

  /** Logout revokes the entire token family, not just the presented token. */
  async logout(refreshToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      select: { familyId: true },
    });
    if (row) {
      await this.prisma.refreshToken.deleteMany({ where: { familyId: row.familyId } });
    }
  }

  private async issueSession(userId: string, familyId?: string): Promise<SessionResponse> {
    const accessToken = await this.jwt.signAsync({ sub: userId });

    const refreshToken = randomBytes(32).toString('base64url');
    const ttlDays = Number(this.config.get('AUTH_REFRESH_TOKEN_TTL_DAYS') ?? 30);
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(refreshToken),
        familyId: familyId ?? randomBytes(16).toString('hex'),
        userId,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    // Opportunistic sweep so abandoned/consumed rows can't grow forever.
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, picture: true },
    });

    return { accessToken, refreshToken, user };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
