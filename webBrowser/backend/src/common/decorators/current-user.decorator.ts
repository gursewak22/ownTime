import { BadRequestException, ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

const USER_ID_HEADER = 'x-user-id';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const raw = req.header(USER_ID_HEADER);
  const userId = typeof raw === 'string' ? raw.trim() : '';
  if (!userId) {
    throw new BadRequestException(`Missing ${USER_ID_HEADER} header`);
  }
  return userId;
});
