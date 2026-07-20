import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListTodosQuery {
  @IsOptional()
  // Read the raw query value from `obj`: with enableImplicitConversion the
  // `value` argument has already been coerced (Boolean('false') === true).
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    if (raw === 'true' || raw === true) return true;
    if (raw === 'false' || raw === false) return false;
    return raw;
  })
  @IsBoolean()
  done?: boolean;
}
