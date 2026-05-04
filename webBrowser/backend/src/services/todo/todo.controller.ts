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
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateTodoDto } from './dto/create-todo.dto';
import { ListTodosQuery } from './dto/list-todos.query';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodoService } from './todo.service';

@Controller('todos')
export class TodoController {
  constructor(private readonly todos: TodoService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query() query: ListTodosQuery) {
    return this.todos.list(userId, query.done);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateTodoDto) {
    return this.todos.create(userId, dto);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.todos.get(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.todos.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.todos.delete(userId, id);
  }
}
