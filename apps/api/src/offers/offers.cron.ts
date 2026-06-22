import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OffersService } from './offers.service';

/**
 * Lightweight cron — runs every 15 minutes (no @nestjs/schedule dep yet).
 * setInterval is fine for single-instance dev/staging. Production should
 * use @nestjs/schedule + a leader-election if multi-instance.
 */
@Injectable()
export class OffersCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OffersCron.name);
  private timer?: NodeJS.Timeout;
  private readonly intervalMs = 15 * 60 * 1000; // 15 min

  constructor(private readonly offers: OffersService) {}

  onModuleInit() {
    // Run once at startup to catch any stale state from downtime
    this.run().catch((e) => this.logger.error('Initial sweep failed', e));
    this.timer = setInterval(() => {
      this.run().catch((e) => this.logger.error('Sweep failed', e));
    }, this.intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    const expired = await this.offers.sweepExpiredOffers();
    const paymentExpired = await this.offers.sweepPaymentDeadlines();
    if (expired.swept > 0 || paymentExpired.swept > 0) {
      this.logger.log(`Swept offers — expired: ${expired.swept}, payment-deadline: ${paymentExpired.swept}`);
    }
  }
}
