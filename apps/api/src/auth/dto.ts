import { IsArray, IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  /** Register v2 — optional email OTP code. If provided, server verifies + marks emailVerified=true. */
  @IsOptional()
  @IsString()
  @Length(6, 6)
  emailOtp?: string;

  /** Register v2 — optional user-chosen public handle. If omitted, server auto-generates. */
  @IsOptional()
  @IsString()
  @Length(3, 24)
  username?: string;

  /** Register v2 — optional interests (Category enum values) to seed homepage personalisation. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];
}

/**
 * Founder ruling 2026-06-19 Q1=A: dual identifier — accept either `email` OR
 * `identifier` (which may be email OR phone). `email` retained for backwards
 * compatibility; new clients should use `identifier`.
 */
export class LoginDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class SendOtpDto {
  @IsString()
  phone!: string;

  @IsIn(['REGISTER_PHONE', 'CHANGE_PHONE'])
  purpose!: 'REGISTER_PHONE' | 'CHANGE_PHONE';
}

export class VerifyOtpDto {
  @IsString()
  phone!: string;

  @IsString()
  @MinLength(6)
  code!: string;

  @IsIn(['REGISTER_PHONE', 'CHANGE_PHONE'])
  purpose!: 'REGISTER_PHONE' | 'CHANGE_PHONE';
}

/** Register v2 — send 6-digit code to email address. Dev mode uses fixed 888888. */
export class SendEmailOtpDto {
  @IsEmail()
  email!: string;

  @IsIn(['REGISTER_EMAIL', 'VERIFY_EMAIL'])
  purpose!: 'REGISTER_EMAIL' | 'VERIFY_EMAIL';
}

/** Verify email OTP outside register flow (VERIFY_EMAIL only — for existing users). */
export class VerifyEmailOtpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  code!: string;

  @IsIn(['VERIFY_EMAIL'])
  purpose!: 'VERIFY_EMAIL';
}
