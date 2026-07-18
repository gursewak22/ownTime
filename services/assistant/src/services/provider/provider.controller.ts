import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SetProviderDto } from './dto/set-provider.dto';
import { ProviderService } from './provider.service';

@Controller('assistant/provider')
export class ProviderController {
  constructor(private readonly provider: ProviderService) {}

  @Get()
  status(@CurrentUser() userId: string) {
    return this.provider.status(userId);
  }

  @Put()
  set(@CurrentUser() userId: string, @Body() dto: SetProviderDto) {
    return this.provider.set(userId, dto);
  }

  @Delete()
  async remove(@CurrentUser() userId: string) {
    await this.provider.remove(userId);
    return { ok: true };
  }
}
