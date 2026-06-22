import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DeliveryMethod, PaymentMethod } from '@prisma/client';

export class CreateOrderDto {
  @IsString()
  listingId!: string;

  @IsOptional()
  @IsString()
  authenticatorId?: string;

  @IsEnum(DeliveryMethod)
  deliveryMethod!: DeliveryMethod;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  meetupLocation?: string;  // legacy; prefer meetupBranchId / meetupFreeText

  /** MEETUP_AUTH / MEETUP_3WAY — required: chosen branch FK */
  @IsOptional()
  @IsString()
  meetupBranchId?: string;

  /** MEETUP_DIRECT — required: buyer-typed free-text location */
  @IsOptional()
  @IsString()
  meetupFreeText?: string;

  /** Optional — if buyer is checking out from an ACCEPTED price-negotiation Offer */
  @IsOptional()
  @IsString()
  offerId?: string;
}

export class VerdictDto {
  @IsEnum(['PASSED', 'FAILED', 'INCONCLUSIVE'])
  verdict!: 'PASSED' | 'FAILED' | 'INCONCLUSIVE';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PhotosDto {
  @IsArray()
  @IsString({ each: true })
  photos!: string[];
}

export class DisputeDto {
  @IsString()
  reason!: string;
}

export class SoftReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Seller re-photo request payload: preset rejection tags (multi-select) + optional comment */
export class RePhotoRequestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  presets?: string[];

  @IsOptional()
  @IsString()
  comment?: string;
}

export class ReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
