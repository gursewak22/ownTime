import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { ScribeService } from './scribe.service';

@Controller('scribe/notes')
export class ScribeController {
  constructor(private readonly notes: ScribeService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.notes.list(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateNoteDto) {
    return this.notes.create(userId, dto);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.notes.get(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.notes.delete(userId, id);
  }
}
