import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScribeNote } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

/** List/update responses carry no doc/strokes — those can be hundreds of KB. */
const NOTE_SUMMARY = { id: true, title: true, pdfName: true, updatedAt: true } as const;

/** Full note minus the raw PDF bytes — those only ever leave via getPdf(). */
const NOTE_DETAIL = {
  ...NOTE_SUMMARY,
  doc: true,
  strokes: true,
  comments: true,
  createdAt: true,
} as const;

export type ScribeNoteSummary = Pick<ScribeNote, 'id' | 'title' | 'pdfName' | 'updatedAt'>;
export type ScribeNoteDetail = ScribeNoteSummary &
  Pick<ScribeNote, 'doc' | 'strokes' | 'comments' | 'createdAt'>;

const MAX_PDF_BYTES = 20 * 1024 * 1024;

@Injectable()
export class ScribeService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUser(userId: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
  }

  async list(userId: string): Promise<ScribeNoteSummary[]> {
    return this.prisma.scribeNote.findMany({
      where: { userId },
      select: NOTE_SUMMARY,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateNoteDto): Promise<ScribeNoteDetail> {
    await this.ensureUser(userId);
    return this.prisma.scribeNote.create({
      data: {
        userId,
        title: dto.title ?? 'Untitled note',
        doc: { type: 'doc', content: [{ type: 'paragraph' }] },
        strokes: [],
        comments: [],
      },
      select: NOTE_DETAIL,
    });
  }

  async get(userId: string, id: string): Promise<ScribeNoteDetail> {
    const note = await this.prisma.scribeNote.findFirst({
      where: { id, userId },
      select: NOTE_DETAIL,
    });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async update(userId: string, id: string, dto: UpdateNoteDto): Promise<ScribeNoteSummary> {
    await this.get(userId, id);
    return this.prisma.scribeNote.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.doc !== undefined && { doc: dto.doc }),
        ...(dto.strokes !== undefined && { strokes: dto.strokes }),
        ...(dto.comments !== undefined && { comments: dto.comments }),
      },
      select: NOTE_SUMMARY,
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.scribeNote.delete({ where: { id } });
  }

  async attachPdf(
    userId: string,
    id: string,
    name: string,
    data: Buffer,
  ): Promise<ScribeNoteSummary> {
    if (data.length > MAX_PDF_BYTES) {
      throw new BadRequestException('PDF is too large (20 MB max)');
    }
    // Magic-byte check: don't trust the client's content type.
    if (!data.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
      throw new BadRequestException('File is not a PDF');
    }
    await this.get(userId, id);
    return this.prisma.scribeNote.update({
      where: { id },
      data: { pdf: data, pdfName: name },
      select: NOTE_SUMMARY,
    });
  }

  async getPdf(userId: string, id: string): Promise<{ name: string; data: Buffer }> {
    const note = await this.prisma.scribeNote.findFirst({
      where: { id, userId },
      select: { pdf: true, pdfName: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (!note.pdf) throw new NotFoundException('Note has no PDF');
    return { name: note.pdfName ?? 'document.pdf', data: Buffer.from(note.pdf) };
  }

  async removePdf(userId: string, id: string): Promise<ScribeNoteSummary> {
    await this.get(userId, id);
    return this.prisma.scribeNote.update({
      where: { id },
      data: { pdf: null, pdfName: null },
      select: NOTE_SUMMARY,
    });
  }
}
