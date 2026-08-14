import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// 鑑定師自己更新收費 + 公開檔案（PATCH /authenticators/me）
export class UpdateAuthenticatorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.3, { message: '收費百分比唔可以超過 30%' })
  feeRatePct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  feeMinHKD?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessHours?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptsMeetup?: boolean;
}
