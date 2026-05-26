import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Category } from '@prisma/client';

export class CreateListingDto {
  @IsEnum(Category)
  category!: Category;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  description!: string;

  @IsInt()
  @Min(1)
  priceHKD!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
