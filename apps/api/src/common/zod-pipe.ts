import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validate a request payload against a Zod schema; 400 with readable issues on failure. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly _schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this._schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      );
    }

    return result.data;
  }
}
