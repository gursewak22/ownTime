import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Todo } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@Injectable()
export class TodoService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUser(userId: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
  }

  async list(userId: string, done?: boolean): Promise<Todo[]> {
    const where: Prisma.TodoWhereInput = { userId };
    if (typeof done === 'boolean') where.done = done;
    return this.prisma.todo.findMany({
      where,
      orderBy: [{ done: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateTodoDto): Promise<Todo> {
    await this.ensureUser(userId);
    return this.prisma.todo.create({
      data: {
        userId,
        title: dto.title,
        notes: dto.notes,
        dueAt: dto.dueAt,
      },
    });
  }

  async get(userId: string, id: string): Promise<Todo> {
    const todo = await this.prisma.todo.findFirst({ where: { id, userId } });
    if (!todo) throw new NotFoundException('Todo not found');
    return todo;
  }

  async update(userId: string, id: string, dto: UpdateTodoDto): Promise<Todo> {
    await this.get(userId, id);
    return this.prisma.todo.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.done !== undefined && { done: dto.done }),
        ...(dto.dueAt !== undefined && { dueAt: dto.dueAt }),
      },
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.todo.delete({ where: { id } });
  }
}
