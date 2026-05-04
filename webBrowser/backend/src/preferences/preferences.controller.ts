import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PreferencesService } from './preferences.service';

@Controller('preferences/:service')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  list(@CurrentUser() userId: string, @Param('service') service: string) {
    return this.preferences.list(userId, service);
  }

  @Get(':key')
  async get(
    @CurrentUser() userId: string,
    @Param('service') service: string,
    @Param('key') key: string,
  ) {
    return { value: await this.preferences.get(userId, service, key) };
  }

  @Put(':key')
  async set(
    @CurrentUser() userId: string,
    @Param('service') service: string,
    @Param('key') key: string,
    @Body('value') value: unknown,
  ) {
    await this.preferences.set(userId, service, key, value as never);
    return { ok: true };
  }

  @Delete(':key')
  async delete(
    @CurrentUser() userId: string,
    @Param('service') service: string,
    @Param('key') key: string,
  ) {
    await this.preferences.delete(userId, service, key);
    return { ok: true };
  }
}
