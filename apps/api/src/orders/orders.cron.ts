import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * Lightweight cron.
 *  - 15-min sweeps: SELLER_ACK_PENDING > 7d auto-cancel; SHIP T+3 auto-complete.
 *  - 5-min sweep: payment-deadline expiry（30 分鐘窗口用 15 分鐘粒度誤差太大 —
 *    founder 2026-07-20）→ AWAITING_PAYMENT 過期轉 PAYMENT_EXPIRED + 釋放 listing。
 */
@Injectable()
export class OrdersCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersCron.name);
  private timer?: NodeJS.Timeout;
  private fastTimer?: NodeJS.Timeout;
  private readonly intervalMs = 15 * 60 * 1000; // 15 min
  private readonly fastIntervalMs = 5 * 60 * 1000; // 5 min — payment expiry only

  constructor(private readonly orders: OrdersService) {}

  onModuleInit() {
    this.run().catch((e) => this.logger.error('Initial sweep failed', e));
    this.timer = setInterval(() => {
      this.run().catch((e) => this.logger.error('Sweep failed', e));
    }, this.intervalMs);
    this.fastTimer = setInterval(() => {
      this.runFast().catch((e) => this.logger.error('Payment-expiry sweep failed', e));
    }, this.fastIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.fastTimer) clearInterval(this.fastTimer);
  }

  private async run() {
    const result = await this.orders.sweepSellerAckTimeout();
    if (result.swept > 0) {
      this.logger.log(`Auto-canceled ${result.swept} stale SELLER_ACK_PENDING orders (7d timeout)`);
    }
    // Ack v2: SHIPPED_TO_BUYER past autoCompleteAt → COMPLETED + payout eligible
    const auto = await this.orders.sweepShipAutoComplete();
    if (auto.swept > 0) {
      this.logger.log(`Auto-completed ${auto.swept} SHIPPED_TO_BUYER orders (T+3 elapsed)`);
    }
    await this.runFast();
  }

  private async runFast() {
    const exp = await this.orders.sweepPaymentExpired();
    if (exp.swept > 0) {
      this.logger.log(`Expired ${exp.swept} unpaid orders (30-min payment deadline)`);
    }
  }
}
