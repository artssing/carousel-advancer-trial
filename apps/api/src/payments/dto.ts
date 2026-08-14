import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** Repo-split P1c — these took inline object types and never reached the pipe. */
const METHODS = ['CARD', 'ALIPAY_HK', 'WECHAT_HK', 'FPS', 'APPLE_PAY'] as const;
export type PaymentMethodKey = (typeof METHODS)[number];

export class ConfirmMockDto {
  @ApiProperty()
  @IsString()
  paymentId!: string;

  /** Mock gateway only — picks which scripted outcome to return. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  testCard?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsIn(METHODS as unknown as string[])
  method?: PaymentMethodKey;
}

export class LogMethodDto {
  @ApiProperty({ type: String })
  @IsIn(METHODS as unknown as string[])
  method!: PaymentMethodKey;
}
