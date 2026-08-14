import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  displayName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password!: string;

  /** Register v2 — optional email OTP code. If provided, server verifies + marks emailVerified=true. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(6, 6)
  emailOtp?: string;

  /** Register v2 — optional user-chosen public handle. If omitted, server auto-generates. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 24)
  username?: string;

  /** Register v2 — optional interests (Category enum values) to seed homepage personalisation. */
  @ApiPropertyOptional({ type: [String] })
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
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password!: string;
}

export class SendOtpDto {
  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty({ enum: ['REGISTER_PHONE', 'CHANGE_PHONE'] })
  @IsIn(['REGISTER_PHONE', 'CHANGE_PHONE'])
  purpose!: 'REGISTER_PHONE' | 'CHANGE_PHONE';
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  code!: string;

  @ApiProperty({ enum: ['REGISTER_PHONE', 'CHANGE_PHONE'] })
  @IsIn(['REGISTER_PHONE', 'CHANGE_PHONE'])
  purpose!: 'REGISTER_PHONE' | 'CHANGE_PHONE';
}

/** Register v2 — send 6-digit code to email address. Dev mode uses fixed 888888. */
export class SendEmailOtpDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ['REGISTER_EMAIL', 'VERIFY_EMAIL'] })
  @IsIn(['REGISTER_EMAIL', 'VERIFY_EMAIL'])
  purpose!: 'REGISTER_EMAIL' | 'VERIFY_EMAIL';
}

/** Verify email OTP outside register flow (VERIFY_EMAIL only — for existing users). */
export class VerifyEmailOtpDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  code!: string;

  @ApiProperty()
  @IsIn(['VERIFY_EMAIL'])
  purpose!: 'VERIFY_EMAIL';
}

/** Repo-split P1c — previously inline object types on the controller. */
export class ConfirmLinkDto {
  @ApiProperty()
  @IsString()
  linkToken!: string;
}

export class CompleteProfileDto {
  @ApiProperty()
  @IsString()
  completeToken!: string;

  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty()
  @IsBoolean()
  useSuggestedAvatar!: boolean;
}
