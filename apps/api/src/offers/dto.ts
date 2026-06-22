import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  conversationId!: string;

  @IsInt()
  @Min(1)
  priceHKD!: number;
}

export class CounterOfferDto {
  @IsInt()
  @Min(1)
  priceHKD!: number;
}
