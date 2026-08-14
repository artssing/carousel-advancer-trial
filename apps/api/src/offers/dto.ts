import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateOfferDto {
  @ApiProperty()
  @IsString()
  conversationId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  priceHKD!: number;
}

export class CounterOfferDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  priceHKD!: number;
}
