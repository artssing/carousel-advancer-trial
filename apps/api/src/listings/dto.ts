import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Category, ConditionGrade, DeliveryMethod } from '@prisma/client';

export class CreateListingDto {
  @IsEnum(Category)
  category!: Category;

  /** Founder ruling 2026-06-30: 新 listing 必填成色。舊 listing 可以 null。 */
  @IsEnum(ConditionGrade)
  condition!: ConditionGrade;

  /** Optional brand / sub-category. Either a canonical enum key (e.g. "LV")
   *  from brandsForCategory(), or free-text fallback (max 40 chars). */
  @IsOptional()
  @IsString()
  brand?: string;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  description!: string;

  @IsInt()
  @Min(1)
  priceHKD!: number;

  /** Founder ruling 2026-06-21: 圖片或影片其中一個必須有；由 service layer
      enforce「圖 OR 片」邏輯，DTO 唔再 require 最少一張圖。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: '最多只可上載 5 張商品圖片' })
  @IsString({ each: true })
  images?: string[];

  /** Optional video data URL (≤15MB, ≤15s — client-validated, server caps at 50MB JSON). */
  @IsOptional()
  @IsString()
  videoUrl?: string;

  /** Frame extract from videoUrl, client-side at t=1s. */
  @IsOptional()
  @IsString()
  videoPosterUrl?: string;

  /** OQ-1=B: video can be cover. When true, browse uses videoPosterUrl. */
  @IsOptional()
  @IsBoolean()
  videoIsCover?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: '請至少揀一種交收方式' })
  @IsEnum(DeliveryMethod, { each: true })
  allowedDeliveryMethods?: DeliveryMethod[];

  @IsOptional()
  @IsString()
  sellerDistrict?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sellerMeetupLocations?: string[];
}

/** Edit DTO — every field optional, server merges with existing */
export class UpdateListingDto {
  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @IsOptional()
  @IsEnum(ConditionGrade)
  condition?: ConditionGrade;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  priceHKD?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: '最多只可上載 5 張商品圖片' })
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string | null;

  @IsOptional()
  @IsString()
  videoPosterUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  videoIsCover?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: '請至少揀一種交收方式' })
  @IsEnum(DeliveryMethod, { each: true })
  allowedDeliveryMethods?: DeliveryMethod[];

  @IsOptional()
  @IsString()
  sellerDistrict?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sellerMeetupLocations?: string[];
}
