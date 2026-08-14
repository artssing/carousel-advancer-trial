import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Admin DTOs (repo-split P1c).
 *
 * These routes took inline `@Body() body: { … }` object types, which produce
 * no named schema — so the whole ops surface was absent from the generated
 * contract, and the pipe never validated any of it.
 *
 * Two consequences worth being explicit about:
 *
 *  1. The global ValidationPipe runs `whitelist` + `forbidNonWhitelisted`, but
 *     only engages when the parameter is a class. These routes now reject
 *     unknown properties. Each was checked against what the admin portal
 *     sends.
 *  2. `reason` is required on most of them and always was — it is the audit
 *     trail for an action taken against a real person's account. Previously
 *     nothing enforced that; a request omitting it recorded an empty string.
 */

/** Action against a user/listing/order that must be justified in the log. */
export class ReasonDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class OptionalReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class KycStatusDto {
  @ApiProperty({ enum: ['PENDING', 'VERIFIED', 'REJECTED'] })
  @IsIn(['PENDING', 'VERIFIED', 'REJECTED'])
  status!: 'PENDING' | 'VERIFIED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}

export class BooleanValueDto {
  @ApiProperty()
  @IsBoolean()
  value!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BodyTextDto {
  @ApiProperty()
  @IsString()
  body!: string;
}

export class RenameDto {
  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty()
  @IsString()
  reason!: string;
}

/**
 * Platform-config write. `value` is genuinely polymorphic — the config table
 * holds numbers, booleans and strings — so this one stays `any` rather than
 * pretending to a type it does not have. The service validates per key.
 */
export class ConfigValueDto {
  @ApiProperty()
  value!: any;
}

export class DisputeResolutionDto {
  @ApiProperty({ enum: ['REFUND_BUYER', 'RELEASE_SELLER'] })
  @IsIn(['REFUND_BUYER', 'RELEASE_SELLER'])
  resolution!: 'REFUND_BUYER' | 'RELEASE_SELLER';

  @ApiProperty()
  @IsString()
  note!: string;
}

export class PayoutStatusDto {
  @ApiProperty()
  @IsString()
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  failureReason?: string;
}

export class ReasonWithMoreInfoDto {
  @ApiProperty()
  @IsString()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  needsMoreInfo?: boolean;
}

export class ListingStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'REMOVED'] })
  @IsIn(['ACTIVE', 'SUSPENDED', 'REMOVED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
