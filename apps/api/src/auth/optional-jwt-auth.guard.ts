import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT guard that does NOT throw when no token / bad token is provided.
 * req.user is populated when a valid Bearer token is present, else undefined.
 *
 * Use on public-but-personalised endpoints (e.g. /listings/:id where viewing
 * a RESERVED listing reveals more data to the buyer/seller than to a stranger).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context) as any;
  }

  override handleRequest(_err: any, user: any) {
    // Swallow auth errors; return user if present, else undefined.
    return user ?? undefined;
  }
}
