import { Body, Controller, Get, Ip, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, CurrentUserData } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  LoginDto, RegisterDto, SendOtpDto, VerifyOtpDto,
  SendEmailOtpDto, VerifyEmailOtpDto,
} from './dto';

const CONSUMER_URL = process.env.NEXT_PUBLIC_CONSUMER_URL ?? 'http://localhost:3008';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // ── Google SSO ──────────────────────────────────────────────────────
  /** Kick off OAuth — browser redirect to Google consent screen. */
  @Get('google')
  googleStart(@Query('redirect') redirect: string | undefined, @Res() res: Response) {
    const url = this.auth.googleStartUrl(redirect);
    return res.redirect(url);
  }

  /**
   * Google callback — 302-redirects back to consumer with the appropriate
   * outcome encoded in URL hash/query.
   *
   *   login            → /login#token=...
   *   link-pending     → /auth/link-confirm?token=&email=&displayName=
   *   complete-pending → /auth/complete-profile?token=&suggestedName=&email=&avatar=
   *   error            → /login?ssoError=
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(`${CONSUMER_URL}/login?ssoError=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${CONSUMER_URL}/login?ssoError=missing_code_or_state`);
    }
    try {
      const out = await this.auth.googleCallback(code, state);
      if (out.result === 'login') {
        const dest = out.redirectAfter && out.redirectAfter.startsWith('/') ? out.redirectAfter : '/';
        return res.redirect(`${CONSUMER_URL}/login#token=${out.accessToken}&next=${encodeURIComponent(dest)}`);
      }
      if (out.result === 'link-pending') {
        const qs = new URLSearchParams({
          token: out.linkToken,
          email: out.email,
          displayName: out.existingDisplayName,
        });
        return res.redirect(`${CONSUMER_URL}/auth/link-confirm?${qs.toString()}`);
      }
      // complete-pending
      const qs = new URLSearchParams({
        token: out.completeToken,
        suggestedName: out.suggestedName,
        email: out.email,
      });
      if (out.suggestedAvatar) qs.set('avatar', out.suggestedAvatar);
      return res.redirect(`${CONSUMER_URL}/auth/complete-profile?${qs.toString()}`);
    } catch (e: any) {
      return res.redirect(`${CONSUMER_URL}/login?ssoError=${encodeURIComponent(e?.message ?? 'unknown')}`);
    }
  }

  /** Consumer link-confirm page POSTs here after user clicks 確認連接. */
  @Post('google/link-confirm')
  confirmLink(@Body() body: { linkToken: string }) {
    return this.auth.confirmLink(body.linkToken);
  }

  // ── Phone OTP (Founder ruling 2026-06-19) ───────────────────────────
  /**
   * Send phone OTP. Body: { phone, purpose }. Returns 200 regardless of whether
   * phone already exists (Q3=A: no account enumeration). Rate-limited per
   * phone (3/10min) and per IP (10/hr).
   */
  @Post('phone/send-otp')
  sendPhoneOtp(@Body() dto: SendOtpDto, @Ip() ip: string, @Req() req: Request) {
    // CHANGE_PHONE requires authenticated user — extract from optional Bearer
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const claim: any = (this.auth as any).jwt.verify(authHeader.slice(7));
        userId = claim?.sub;
      } catch {}
    }
    return this.auth.sendOtp(dto.phone, dto.purpose, ip, userId);
  }

  /** Verify phone OTP. Requires authenticated user (attaches phone to caller). */
  @Post('phone/verify-otp')
  @UseGuards(JwtAuthGuard)
  verifyPhoneOtp(@Body() dto: VerifyOtpDto, @CurrentUser() user: CurrentUserData) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.purpose, user.userId);
  }

  // ── Email OTP (Register v2 — 2026-07-05) ────────────────────────────
  /** Send email OTP. Anonymous for REGISTER_EMAIL; consumes bearer if present. */
  @Post('email/send-otp')
  sendEmailOtp(@Body() dto: SendEmailOtpDto, @Ip() ip: string, @Req() req: Request) {
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const claim: any = (this.auth as any).jwt.verify(authHeader.slice(7));
        userId = claim?.sub;
      } catch {}
    }
    return this.auth.sendEmailOtp(dto.email, dto.purpose, ip, userId);
  }

  /**
   * Verify email OTP (VERIFY_EMAIL flow only — for authenticated users re-attesting).
   * REGISTER_EMAIL flow consumes OTP inline via `register()` — do NOT expose here.
   */
  @Post('email/verify-otp')
  @UseGuards(JwtAuthGuard)
  verifyEmailOtp(@Body() dto: VerifyEmailOtpDto, @CurrentUser() user: CurrentUserData) {
    return this.auth.verifyEmailOtp(dto.email, dto.code, user.userId);
  }

  // ── Username availability (Register v2 — 2026-07-05) ────────────────
  /**
   * Public availability check for `/@username` handle. Returns { available, reason? }.
   * Rate-limited by absence-of-token — real limit is IP-based upstream (nginx / cloudflare).
   */
  @Get('username/check')
  checkUsername(@Query('username') username: string) {
    return this.auth.checkUsername(username ?? '');
  }

  /** Consumer complete-profile page POSTs here after user finishes 完善資料. */
  @Post('google/complete-profile')
  completeProfile(
    @Body() body: { completeToken: string; displayName: string; useSuggestedAvatar: boolean },
  ) {
    return this.auth.completeProfile(
      body.completeToken,
      body.displayName,
      !!body.useSuggestedAvatar,
    );
  }
}
