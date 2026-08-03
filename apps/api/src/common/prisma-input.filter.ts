import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Turns "the client sent something Prisma could not use" into a 400 instead of
 * a 500 (founder ruling 2026-08-02: 「如果呢個係 bug，就寫個 common method 一次過處理」).
 *
 * Why this exists: 34 of the API's 63 `@Body()` params are typed with inline
 * object literals, which vanish at runtime, so the global ValidationPipe skips
 * them. An `undefined` id then reaches a Prisma unique lookup and throws
 * `PrismaClientValidationError` — surfacing as a 500. A 500 is indistinguishable
 * from a real crash, so bad input and a genuine defect looked the same during
 * triage. Fixing that one class of confusion per-route would mean writing ~34
 * DTO classes; this catches the whole class at once.
 *
 * What it deliberately does NOT do: blanket-map every Prisma error to 400. Only
 * `PrismaClientValidationError` (malformed query = bad input) and P2023
 * (malformed id) are downgraded. Everything else keeps its 500, because
 * disguising real server faults as client errors is the same disease pointing
 * the other way.
 *
 * Every downgrade is still logged at error level with a correlation id, so a
 * genuine bug that happens to look like bad input is not silently swallowed —
 * the client gets a generic message, the log keeps the detail.
 *
 * This is a safety net, NOT a substitute for DTOs. Money paths get real
 * class-validator DTOs (see wallet/dto.ts); the net only stops the bleeding
 * everywhere else.
 */
@Catch(Prisma.PrismaClientValidationError, Prisma.PrismaClientKnownRequestError)
export class PrismaInputFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaInputFilter.name);

  catch(
    exception: Prisma.PrismaClientValidationError | Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ method?: string; url?: string }>();
    const correlationId = randomUUID().slice(0, 8);

    const isBadInput =
      exception instanceof Prisma.PrismaClientValidationError ||
      exception.code === 'P2023'; // malformed id (e.g. a non-cuid where a cuid is required)

    if (!isBadInput) throw exception; // genuine server fault — keep the 500

    this.logger.error(
      `[${correlationId}] ${req?.method} ${req?.url} — rejected as bad input: ${exception.message
        .split('\n')
        .slice(-3)
        .join(' ')
        .trim()}`,
    );

    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      // Shape matches NestJS's own validation errors — both clients already
      // parse `message` (string or array), so nothing downstream changes.
      message: '提交嘅資料格式有誤，請檢查後再試',
      correlationId,
    });
  }
}
