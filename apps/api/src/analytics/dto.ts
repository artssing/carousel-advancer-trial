import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import type { AnalyticsEventEnvelope } from '@certifine/domain';

/**
 * Repo-split P1c. Deliberately validates only the ENVELOPE shape: the per-event
 * payload is checked against the registry whitelist in the service, and this
 * endpoint must never throw at a client — the ingest route swallows errors so a
 * tagging mistake cannot break a user's flow.
 */
export class IngestEventsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  events!: AnalyticsEventEnvelope[];
}
