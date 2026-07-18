import { Body, Controller, Delete, Get, Post, Req } from '@nestjs/common';
import { AuthedRequest } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatService } from './chat.service';
import { ForwardedAuth } from './todo-client';

// The agent acts on the tools service *as the user*: whichever credential this
// request arrived with (Bearer token, or the dev x-user-id header) is forwarded
// verbatim. The assistant service holds no credentials of its own (ADR 0006).
function forwardedAuth(req: AuthedRequest): ForwardedAuth {
  const auth: ForwardedAuth = {};
  const bearer = req.header('authorization');
  if (bearer) auth.authorization = bearer;
  const devId = req.header('x-user-id');
  if (devId) auth['x-user-id'] = devId;
  return auth;
}

@Controller('assistant/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  history(@CurrentUser() userId: string) {
    return this.chat.history(userId);
  }

  @Post()
  send(
    @CurrentUser() userId: string,
    @Body() dto: SendMessageDto,
    @Req() req: AuthedRequest,
  ) {
    return this.chat.send(userId, dto.message, forwardedAuth(req));
  }

  @Delete()
  async clear(@CurrentUser() userId: string) {
    await this.chat.clear(userId);
    return { ok: true };
  }
}
