import { ApiProperty } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import type { AnalyticsEventEnvelope } from '@certifine/domain';

/**
 * Ingest envelope (repo-split P1c).
 *
 * `@Allow()` and nothing else, on purpose. This route is fire-and-forget
 * telemetry: the controller catches everything so a mis-tagged event can never
 * surface in a user's checkout. `@IsArray()` moved that failure INTO the
 * ValidationPipe, which runs before the controller — a malformed envelope
 * started returning 400 and the catch never ran (QA AN-03, 2026-08-14).
 *
 * `@Allow()` is the class-validator escape hatch for exactly this: the global
 * pipe's `whitelist` keeps only properties carrying a decorator, so the field
 * needs one to survive at all, but this one asserts nothing. A route-level
 * `@UsePipes` cannot help here — method pipes run IN ADDITION to the global
 * one, they do not replace it.
 *
 * Whether the payload is usable is decided by `isAnalyticsEventName` in the
 * service, which is where the registry whitelist lives.
 */
export class IngestEventsDto {
  @ApiProperty({ type: [Object] })
  @Allow()
  events!: AnalyticsEventEnvelope[];
}
