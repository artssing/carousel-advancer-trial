import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(6)
  password!: string;
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
