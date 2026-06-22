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
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.3, { message: '收費百分比唔可以超過 30%' })
  feeRatePct?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeMinHKD?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @IsOptional()
  @IsString()
  locationAddress?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  businessHours?: string;

  @IsOptional()
  @IsBoolean()
  acceptsMeetup?: boolean;
}
