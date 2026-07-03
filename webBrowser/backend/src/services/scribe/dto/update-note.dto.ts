import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';

// doc/strokes are opaque JSON blobs the backend stores verbatim. Both are
// declared as Prisma.InputJsonValue (design type Object) on purpose: with the
// global ValidationPipe's enableImplicitConversion, an Array-typed property
// gets each item coerced to the design type, which destroys the objects.
// @IsObject / @IsArray still enforce the outer shape at runtime.

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  /** TipTap document JSON. */
  @IsOptional()
  @IsObject()
  doc?: Prisma.InputJsonValue;

  /** Doodle strokes array. */
  @IsOptional()
  @IsArray()
  strokes?: Prisma.InputJsonValue;
}
