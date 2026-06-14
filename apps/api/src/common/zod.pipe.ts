import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Validate a request payload against a Zod schema; 400 with readable issues on failure. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => ({ path: i.path, message: i.message })));
    }
    return r.data;
  }
}
