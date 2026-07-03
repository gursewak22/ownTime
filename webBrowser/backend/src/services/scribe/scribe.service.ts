import { Injectable, NotFoundException } from '@nestjs/common';
import { ScribeNote } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

/** List/update responses carry no doc/strokes — those can be hundreds of KB. */
const NOTE_SUMMARY = { id: true, title: true, updatedAt: true } as const;

export type ScribeNoteSummary = Pick<ScribeNote, 'id' | 'title' | 'updatedAt'>;

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

  async create(userId: string, dto: CreateNoteDto): Promise<ScribeNote> {
    await this.ensureUser(userId);
    return this.prisma.scribeNote.create({
      data: {
        userId,
        title: dto.title ?? 'Untitled note',
        doc: { type: 'doc', content: [{ type: 'paragraph' }] },
        strokes: [],
      },
    });
  }

  async get(userId: string, id: string): Promise<ScribeNote> {
    const note = await this.prisma.scribeNote.findFirst({ where: { id, userId } });
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
      },
      select: NOTE_SUMMARY,
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.scribeNote.delete({ where: { id } });
  }
}
