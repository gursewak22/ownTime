import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  @Post(':id/pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  attachPdf(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded (field name: file)');
    return this.notes.attachPdf(userId, id, file.originalname, file.buffer);
  }

  @Get(':id/pdf')
  @Header('Cache-Control', 'no-store')
  async getPdf(@CurrentUser() userId: string, @Param('id') id: string) {
    const { name, data } = await this.notes.getPdf(userId, id);
    return new StreamableFile(data, {
      type: 'application/pdf',
      disposition: `inline; filename="${encodeURIComponent(name)}"`,
    });
  }

  @Delete(':id/pdf')
  removePdf(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.notes.removePdf(userId, id);
  }
}
