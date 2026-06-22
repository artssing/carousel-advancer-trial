import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * Lightweight cron — runs every 15 minutes.
 * Sweeps MEETUP_AUTH orders stuck in SELLER_ACK_PENDING > 7 days → auto-cancel + refund buyer.
 */
@Injectable()
export class OrdersCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersCron.name);
  private timer?: NodeJS.Timeout;
  private readonly intervalMs = 15 * 60 * 1000; // 15 min

  constructor(private readonly orders: OrdersService) {}

  onModuleInit() {
    this.run().catch((e) => this.logger.error('Initial sweep failed', e));
    this.timer = setInterval(() => {
      this.run().catch((e) => this.logger.error('Sweep failed', e));
    }, this.intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    const result = await this.orders.sweepSellerAckTimeout();
    if (result.swept > 0) {
      this.logger.log(`Auto-canceled ${result.swept} stale SELLER_ACK_PENDING orders (7d timeout)`);
    }
  }
}
