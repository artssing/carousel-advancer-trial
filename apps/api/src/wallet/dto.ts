import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  PAYOUT_MAX_HKD,
  PAYOUT_MIN_HKD,
  type PayoutMethodTypeKey,
} from '@certifine/domain';

/**
 * Wallet DTOs (founder ruling 2026-08-02).
 *
 * The global ValidationPipe in main.ts has always been on with whitelist +
 * forbidNonWhitelisted. Wallet escaped it by typing `@Body()` with an inline
 * object literal — those types vanish at runtime, so the pipe saw a bare
 * `Object` and skipped validation entirely. The unvalidated value then went
 * straight into a Prisma unique lookup, which threw, which surfaced as a 500.
 *
 * That mattered more than tidiness: a 500 cannot be told apart from a real
 * crash, so "you asked wrong" and "we broke" looked identical during triage.
 */

const PAYOUT_METHOD_TYPES: PayoutMethodTypeKey[] = [
  'FPS_PHONE',
  'FPS_EMAIL',
  'FPS_ID',
  'BANK_LOCAL',
];

/**
 * Accept a numeric string and coerce it (founder 2026-08-02: "識轉，假設真係傳
 * string 都要識轉同 handle exception case").
 *
 * Deliberately strict about WHAT it will coerce: only a string of digits, or a
 * number. `[100]`, `{}`, `true`, `"12abc"` and `Infinity` all become NaN, which
 * @IsInt then rejects with a 400 — previously `Number([100])` was 100 and an
 * array sailed through into a real PayoutIntent.
 */
function toIntegerAmount({ value }: { value: unknown }): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) return parseInt(value, 10);
  return NaN;
}

export class InitiateAddMethodDto {
  @IsIn(PAYOUT_METHOD_TYPES)
  type!: PayoutMethodTypeKey;

  @IsString()
  @Length(1, 64)
  accountIdentifier!: string;

  /**
   * Was completely unvalidated. A non-string here burned the user's OTP and
   * then threw inside createMethod — the user did everything right and got a
   * 500 with a dead intent.
   */
  @IsString()
  @Length(1, 100)
  accountName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  bankCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** Shared by both confirm routes — same shape, same rules. */
export class ConfirmIntentDto {
  @IsString()
  @Length(1, 40)
  intentId!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class InitiatePayoutDto {
  @IsString()
  @Length(1, 40)
  payoutMethodId!: string;

  @Transform(toIntegerAmount)
  @IsInt()
  @Min(PAYOUT_MIN_HKD)
  @Max(PAYOUT_MAX_HKD)
  amountHKD!: number;
}
