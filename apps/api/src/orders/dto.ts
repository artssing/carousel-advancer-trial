import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeliveryMethod, PaymentMethod } from '@prisma/client';

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  listingId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authenticatorId?: string;

  @ApiProperty({ enum: DeliveryMethod })
  @IsEnum(DeliveryMethod)
  deliveryMethod!: DeliveryMethod;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meetupLocation?: string;  // legacy; prefer meetupBranchId / meetupFreeText

  /** MEETUP_AUTH / MEETUP_3WAY — required: chosen branch FK */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meetupBranchId?: string;

  /** MEETUP_DIRECT — required: buyer-typed free-text location */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meetupFreeText?: string;

  /** Optional — if buyer is checking out from an ACCEPTED price-negotiation Offer */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offerId?: string;
}

export class VerdictDto {
  @ApiProperty({ enum: ['PASSED', 'FAILED', 'INCONCLUSIVE'] })
  @IsEnum(['PASSED', 'FAILED', 'INCONCLUSIVE'])
  verdict!: 'PASSED' | 'FAILED' | 'INCONCLUSIVE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddEvidenceDto {
  @ApiProperty()
  @IsString()
  mediaUrl!: string;

  @ApiProperty()
  @IsString()
  mimeType!: string;

  @ApiProperty()
  @IsInt()
  sizeBytes!: number;

  @ApiProperty({ enum: ['VIDEO', 'IMAGE'] })
  @IsEnum(['VIDEO', 'IMAGE'])
  kind!: 'VIDEO' | 'IMAGE';
}

export class PhotosDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  photos!: string[];
}

export class DisputeDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class SoftReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Seller re-photo request payload: preset rejection tags (multi-select) + optional comment */
export class RePhotoRequestDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  presets?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ReviewDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
