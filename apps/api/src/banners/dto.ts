import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Repo-split P1c. These two routes took `@Body() dto: any`, which is the one
 * shape the ValidationPipe cannot help with at all — `any` has no metatype, so
 * the pipe skips it entirely and the body went to Prisma unchecked. That is
 * what `PrismaInputFilter` was catching after the fact.
 *
 * `startsAt` / `endsAt` are ISO strings, nullable: a banner with no end date is
 * a legitimate state (runs until someone turns it off), not a missing value.
 */
const SEVERITY = ['INFO', 'WARNING', 'CRITICAL'] as const;
const AUDIENCE = ['ALL', 'BUYERS', 'SELLERS', 'AUTHENTICATORS'] as const;

export class CreateBannerDto {
  @ApiProperty()
  @IsString()
  message!: string;

  @ApiProperty()
  @IsIn(SEVERITY as unknown as string[])
  severity!: (typeof SEVERITY)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(AUDIENCE as unknown as string[])
  audience?: (typeof AUDIENCE)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dismissible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

/** Every field optional — the admin UI PATCHes one field at a time. */
export class UpdateBannerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(SEVERITY as unknown as string[])
  severity?: (typeof SEVERITY)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(AUDIENCE as unknown as string[])
  audience?: (typeof AUDIENCE)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dismissible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
