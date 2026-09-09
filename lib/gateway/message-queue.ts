import { CTraderJsonMessage, GatewayCommandResult } from './contracts';

interface PendingMessage {
  message: CTraderJsonMessage;
  resolve: (result: GatewayCommandResult) => void;
}

export class GatewayMessageQueue {
  private readonly queue: PendingMessage[] = [];
  private processing = false;
  private lastSentAt = 0;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 25) {
    this.minIntervalMs = minIntervalMs;
  }

  public enqueue(message: CTraderJsonMessage, send: (message: CTraderJsonMessage) => void): Promise<GatewayCommandResult> {
    return new Promise(resolve => {
      this.queue.push({ message, resolve });
      void this.drain(send);
    });
  }

  public rejectAll(reason: string): void {
    while (this.queue.length > 0) {
      this.queue.shift()?.resolve({ accepted: false, clientMsgId: '', error: reason });
    }
  }

  public get size(): number { return this.queue.length; }

  private async drain(send: (message: CTraderJsonMessage) => void): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const pending = this.queue.shift();
        if (!pending) break;
        const waitMs = Math.max(0, this.minIntervalMs - (Date.now() - this.lastSentAt));
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
        try {
          send(pending.message);
          this.lastSentAt = Date.now();
          pending.resolve({ accepted: true, clientMsgId: pending.message.clientMsgId || '' });
        } catch (error) {
          pending.resolve({ accepted: false, clientMsgId: pending.message.clientMsgId || '', error: error instanceof Error ? error.message : 'ارسال پیام ناموفق بود.' });
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
