import { ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { AuthedRequest } from '../../auth/auth.guard';

/**
 * Resolves the authenticated user's id, set on the request by the global
 * AuthGuard (verified Bearer token, or the x-user-id dev fallback).
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  const userId = req.user?.userId;
  if (!userId) {
    // Unreachable on guarded routes; defends @Public() handlers that misuse this decorator.
    throw new UnauthorizedException('Not authenticated');
  }
  return userId;
});
