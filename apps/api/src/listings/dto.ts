import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ enum: Category })
  @IsEnum(Category)
  category!: Category;

  /** Founder ruling 2026-06-30: 新 listing 必填成色。舊 listing 可以 null。 */
  @ApiProperty({ enum: ConditionGrade })
  @IsEnum(ConditionGrade)
  condition!: ConditionGrade;

  /** Optional brand / sub-category. Either a canonical enum key (e.g. "LV")
   *  from brandsForCategory(), or free-text fallback (max 40 chars). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  priceHKD!: number;

  /** Founder ruling 2026-06-21: 圖片或影片其中一個必須有；由 service layer
      enforce「圖 OR 片」邏輯，DTO 唔再 require 最少一張圖。 */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: '最多只可上載 5 張商品圖片' })
  @IsString({ each: true })
  images?: string[];

  /** Optional video data URL (≤15MB, ≤15s — client-validated, server caps at 50MB JSON). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoUrl?: string;

  /** Frame extract from videoUrl, client-side at t=1s. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoPosterUrl?: string;

  /** OQ-1=B: video can be cover. When true, browse uses videoPosterUrl. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  videoIsCover?: boolean;

  @ApiPropertyOptional({ enum: DeliveryMethod, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: '請至少揀一種交收方式' })
  @IsEnum(DeliveryMethod, { each: true })
  allowedDeliveryMethods?: DeliveryMethod[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sellerDistrict?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sellerMeetupLocations?: string[];
}

/** Edit DTO — every field optional, server merges with existing */
export class UpdateListingDto {
  @ApiPropertyOptional({ enum: Category })
  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @ApiPropertyOptional({ enum: ConditionGrade })
  @IsOptional()
  @IsEnum(ConditionGrade)
  condition?: ConditionGrade;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  priceHKD?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: '最多只可上載 5 張商品圖片' })
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoPosterUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  videoIsCover?: boolean;

  @ApiPropertyOptional({ enum: DeliveryMethod, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: '請至少揀一種交收方式' })
  @IsEnum(DeliveryMethod, { each: true })
  allowedDeliveryMethods?: DeliveryMethod[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sellerDistrict?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sellerMeetupLocations?: string[];
}
