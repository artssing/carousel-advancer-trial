import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeHKPhone, isPhoneIdentifier } from '@authentik/utils';
import type { LoginDto, RegisterDto } from './dto';

/**
 * Mock OTP code (Founder ruling 2026-06-19 Q6=A): fixed 888888 in non-prod.
 * Real SMS provider integration is backlog.
 */
const MOCK_OTP_CODE = '888888';
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_PHONE_RATE_LIMIT = { count: 3, windowMs: 10 * 60 * 1000 };  // 3 sends per 10 min per phone
const OTP_IP_RATE_LIMIT    = { count: 10, windowMs: 60 * 60 * 1000 };  // 10 sends per 1 hr per IP

/**
 * SSO state tokens — short-lived JWTs that thread state across the OAuth
 * round-trip without requiring server-side sessions.
 *
 *   `oauth-state` (5 min)  signed before redirecting to Google
 *   `link-pending` (10 min) issued when we found an existing user with the same
 *                           verified email; user must explicitly confirm linking
 *   `complete-pending` (10 min) issued for brand-new SSO users; they must
 *                              finish the "完善資料" page before getting an
 *                              actual login token
 */
type StateClaim = { kind: 'oauth-state'; nonce: string; iat: number };
type LinkPendingClaim = {
  kind: 'link-pending';
  existingUserId: string;
  provider: 'google';
  providerUserId: string;
  email: string;
};
type CompletePendingClaim = {
  kind: 'complete-pending';
  provider: 'google';
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  suggestedName: string;
  suggestedAvatar?: string | null;
};

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ── Email + password ──────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        passwordHash,
      },
    });
    return this.issueToken(user.id, user.email);
  }

  async login(dto: LoginDto) {
    // Founder ruling 2026-06-19 Q1=A: dual identifier (email OR phone).
    // Resolve which identifier was provided. Phone gets normalised via SSOT helper.
    const rawId = dto.identifier ?? dto.email;
    if (!rawId) throw new UnauthorizedException('Invalid credentials');
    let user: any = null;
    if (isPhoneIdentifier(rawId)) {
      const phone = normalizeHKPhone(rawId);
      if (phone) {
        user = await this.prisma.user.findUnique({ where: { phone } });
      }
    } else {
      user = await this.prisma.user.findUnique({ where: { email: rawId } });
    }
    if (!user) {
      // Dummy bcrypt compare to keep timing constant — prevents enumeration via
      // measuring response time difference between "user exists" vs "doesn't".
      await bcrypt.compare(dto.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinval');
      throw new UnauthorizedException('Invalid credentials');
    }
    // Suspended (admin action) → blocked regardless of password.
    // Founder ruling 2026-06-11 Q1=B: in-flight PAID escrow stays frozen
    // naturally because this user can't ack / release.
    if (user.suspendedAt) {
      throw new ForbiddenException(
        `帳戶已被暫停${user.suspendedReason ? `：${user.suspendedReason}` : ''}。如有疑問請聯絡 support@authentik.hk`,
      );
    }
    // SSO-only user (passwordHash null) — guide them to use Google.
    if (!user.passwordHash) {
      throw new UnauthorizedException('呢個帳戶用緊 Google 登入，請撳 "Continue with Google"');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueToken(user.id, user.email);
  }

  // ── Google OAuth ──────────────────────────────────────────────────────
  /**
   * Step 1: build the URL we redirect the user to (Google consent screen).
   * State is a short-lived JWT — verified on callback.
   */
  googleStartUrl(redirectAfter?: string): string {
    this.assertGoogleConfigured();
    const state = this.jwt.sign(
      { kind: 'oauth-state', nonce: randomString(16), redirectAfter: redirectAfter ?? '' } as any,
      { expiresIn: '5m' },
    );
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Step 2: Google calls back here with `code`. We:
   *   1. Verify state JWT
   *   2. Exchange code → id_token
   *   3. Look up OAuthAccount (provider+sub) → existing linked user
   *   4. Else look up User by email
   *      - Found + verified email → return `link-pending` token
   *      - Not found → return `complete-pending` token
   */
  async googleCallback(code: string, state: string): Promise<
    | { result: 'login'; accessToken: string; redirectAfter?: string }
    | { result: 'link-pending'; linkToken: string; email: string; existingDisplayName: string }
    | { result: 'complete-pending'; completeToken: string; suggestedName: string; suggestedAvatar?: string | null; email: string }
  > {
    this.assertGoogleConfigured();

    // 1. Verify state
    let stateClaim: any;
    try {
      stateClaim = this.jwt.verify(state);
    } catch {
      throw new ForbiddenException('OAuth state invalid or expired');
    }
    if (stateClaim?.kind !== 'oauth-state') {
      throw new ForbiddenException('OAuth state malformed');
    }
    const redirectAfter: string | undefined = stateClaim.redirectAfter || undefined;

    // 2. Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new BadRequestException(`Google token exchange failed: ${await tokenRes.text()}`);
    }
    const { id_token } = (await tokenRes.json()) as { id_token: string };

    // 3. Verify id_token + extract claims
    const client = this.getGoogleClient();
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID!,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      throw new BadRequestException('Google id_token missing fields');
    }
    const { sub: providerUserId, email, email_verified, name, picture } = payload;

    // 4. Find existing OAuthAccount → direct login
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'google', providerUserId } },
      include: { user: true },
    });
    if (existing) {
      if (existing.user.suspendedAt) {
        throw new ForbiddenException(
          `帳戶已被暫停${existing.user.suspendedReason ? `：${existing.user.suspendedReason}` : ''}`,
        );
      }
      return {
        result: 'login',
        accessToken: this.issueToken(existing.user.id, existing.user.email).accessToken,
        redirectAfter,
      };
    }

    // 5. Find by email
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      if (byEmail.suspendedAt) {
        throw new ForbiddenException('帳戶已被暫停，無法連接 Google');
      }
      if (!email_verified) {
        // Don't auto-link unverified email → user must use password login
        throw new ForbiddenException('Google 帳戶電郵未驗証，請用電郵 + 密碼登入');
      }
      // Issue link-pending token — user confirms on UI
      const linkToken = this.jwt.sign(
        {
          kind: 'link-pending',
          existingUserId: byEmail.id,
          provider: 'google',
          providerUserId,
          email,
        } as LinkPendingClaim,
        { expiresIn: '10m' },
      );
      return {
        result: 'link-pending',
        linkToken,
        email,
        existingDisplayName: byEmail.displayName,
      };
    }

    // 6. Brand new user — issue complete-pending token
    const completeToken = this.jwt.sign(
      {
        kind: 'complete-pending',
        provider: 'google',
        providerUserId,
        email,
        emailVerified: !!email_verified,
        suggestedName: name ?? email.split('@')[0],
        suggestedAvatar: picture ?? null,
      } as CompletePendingClaim,
      { expiresIn: '10m' },
    );
    return {
      result: 'complete-pending',
      completeToken,
      suggestedName: name ?? email.split('@')[0]!,
      suggestedAvatar: picture ?? null,
      email,
    };
  }

  /** User clicked "確認連接" on link-confirm page. */
  async confirmLink(linkToken: string): Promise<{ accessToken: string }> {
    let claim: any;
    try {
      claim = this.jwt.verify(linkToken);
    } catch {
      throw new ForbiddenException('Link token invalid or expired');
    }
    if (claim?.kind !== 'link-pending') {
      throw new ForbiddenException('Token malformed');
    }
    const c = claim as LinkPendingClaim;
    const user = await this.prisma.user.findUnique({ where: { id: c.existingUserId } });
    if (!user) throw new BadRequestException('Existing user not found');
    if (user.email !== c.email) {
      throw new ForbiddenException('Email mismatch');
    }
    await this.prisma.oAuthAccount.create({
      data: { userId: user.id, provider: c.provider, providerUserId: c.providerUserId },
    });
    // Mark emailVerified since Google attested it (defensive — likely already false → true)
    if (!user.emailVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }
    return this.issueToken(user.id, user.email);
  }

  /** User submitted "完善資料" form (displayName confirmed). */
  async completeProfile(
    completeToken: string,
    displayName: string,
    useSuggestedAvatar: boolean,
  ): Promise<{ accessToken: string }> {
    let claim: any;
    try {
      claim = this.jwt.verify(completeToken);
    } catch {
      throw new ForbiddenException('Complete token invalid or expired');
    }
    if (claim?.kind !== 'complete-pending') {
      throw new ForbiddenException('Token malformed');
    }
    const c = claim as CompletePendingClaim;
    const cleanName = displayName.trim();
    if (!cleanName) throw new BadRequestException('顯示名稱不可為空');

    // Race: email may have been claimed by someone else in the 10-min window
    const collision = await this.prisma.user.findUnique({ where: { email: c.email } });
    if (collision) {
      throw new ConflictException('呢個電郵剛被註冊咗，請重新登入');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: c.email,
          displayName: cleanName,
          emailVerified: c.emailVerified,
          avatarUrl: useSuggestedAvatar && c.suggestedAvatar ? c.suggestedAvatar : null,
          // passwordHash null — SSO-only user
        },
      });
      await tx.oAuthAccount.create({
        data: { userId: user.id, provider: c.provider, providerUserId: c.providerUserId },
      });
      return this.issueToken(user.id, user.email);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private getGoogleClient(): OAuth2Client {
    if (!this.googleClient) {
      this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    }
    return this.googleClient;
  }

  private assertGoogleConfigured() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      throw new BadRequestException(
        'Google SSO 未配置 — 請設 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI 喺 .env',
      );
    }
  }

  private issueToken(userId: string, email: string) {
    const accessToken = this.jwt.sign({ sub: userId, email });
    return { accessToken };
  }

  // ── Phone OTP ─────────────────────────────────────────────────────────
  /**
   * Send OTP for phone verification (REGISTER_PHONE or CHANGE_PHONE).
   * Founder ruling 2026-06-19 Q6=A: dev mode uses fixed code 888888,
   * console.logs instead of sending real SMS.
   *
   * Account-enumeration safe (Q3=A): always returns 200 regardless of whether
   * phone is already attached to a user — caller cannot distinguish.
   */
  async sendOtp(phoneInput: string, purpose: 'REGISTER_PHONE' | 'CHANGE_PHONE', ipAddress: string | undefined, userId: string | undefined) {
    const phone = normalizeHKPhone(phoneInput);
    if (!phone) {
      throw new BadRequestException('手機號碼格式不正確（必須係香港 8 位手機號碼）');
    }
    // Rate limit per phone
    const phoneCount = await this.prisma.otpRequest.count({
      where: { phone, createdAt: { gte: new Date(Date.now() - OTP_PHONE_RATE_LIMIT.windowMs) } },
    });
    if (phoneCount >= OTP_PHONE_RATE_LIMIT.count) {
      throw new BadRequestException('傳送次數已達上限，請喺 10 分鐘後再試');
    }
    // Rate limit per IP
    if (ipAddress) {
      const ipCount = await this.prisma.otpRequest.count({
        where: { ipAddress, createdAt: { gte: new Date(Date.now() - OTP_IP_RATE_LIMIT.windowMs) } },
      });
      if (ipCount >= OTP_IP_RATE_LIMIT.count) {
        throw new BadRequestException('傳送次數已達上限，請稍後再試');
      }
    }
    // 24h cooldown if CHANGE_PHONE and user just changed
    if (purpose === 'CHANGE_PHONE' && userId) {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (u?.phoneChangedAt && Date.now() - u.phoneChangedAt.getTime() < 24 * 60 * 60 * 1000) {
        throw new BadRequestException('手機號碼喺 24 小時內已更換過，請稍後再試');
      }
    }

    const code = MOCK_OTP_CODE; // Q6=A fixed mock
    const codeHash = await bcrypt.hash(code, 8);
    await this.prisma.otpRequest.create({
      data: {
        phone,
        codeHash,
        purpose,
        userId: userId ?? null,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        attemptsLeft: OTP_MAX_ATTEMPTS,
        ipAddress: ipAddress ?? null,
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[MOCK SMS] phone=${phone} purpose=${purpose} code=${code} (dev mode — Q6=A)`);
    return { expiresInSeconds: Math.floor(OTP_TTL_MS / 1000) };
  }

  /**
   * Verify OTP code. On success:
   *  - REGISTER_PHONE: attach phone to the calling user (must be authenticated).
   *    If phone already attached to another user → 409 (Q3=A reject, no detail).
   *  - CHANGE_PHONE: same as above + update phoneChangedAt for 24h cooldown.
   */
  async verifyOtp(phoneInput: string, code: string, purpose: 'REGISTER_PHONE' | 'CHANGE_PHONE', userId: string) {
    const phone = normalizeHKPhone(phoneInput);
    if (!phone) throw new BadRequestException('手機號碼格式不正確');

    const otp = await this.prisma.otpRequest.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('驗証碼已過期，請重新發送');
    if (otp.attemptsLeft <= 0) throw new BadRequestException('嘗試次數已用盡，請重新發送驗証碼');

    const ok = await bcrypt.compare(code, otp.codeHash);
    if (!ok) {
      await this.prisma.otpRequest.update({
        where: { id: otp.id },
        data: { attemptsLeft: { decrement: 1 } },
      });
      throw new BadRequestException('驗証碼錯誤');
    }
    // Consume + atomic phone assignment (Q3=A: reject if phone taken by someone else)
    return this.prisma.$transaction(async (tx) => {
      await tx.otpRequest.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      // Check conflict: phone already on another user
      const conflict = await tx.user.findUnique({ where: { phone } });
      if (conflict && conflict.id !== userId) {
        throw new ConflictException('此手機號碼已連結另一個帳戶');
      }
      const updates: any = {
        phone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      };
      if (purpose === 'CHANGE_PHONE') updates.phoneChangedAt = new Date();
      await tx.user.update({ where: { id: userId }, data: updates });
      return { phone, phoneVerified: true };
    });
  }
}

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
