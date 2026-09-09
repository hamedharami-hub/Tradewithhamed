import { OrderSubmissionRequest } from '@/lib/contracts/execution';
import { CTraderDemoGateway } from '@/lib/gateway/ctrader-gateway';
import { CTraderOMS } from './ctrader-oms';
import { AutoReconciliationService } from './auto-reconciliation-service';
import { NormalizedExecutionEvent } from '@/lib/execution/ctrader-execution';

const globalForBridge = globalThis as unknown as { demoExecutionBridgeRegistered?: boolean };
const SYMBOL_IDS: Record<string, number> = { XAUUSD: 1, EURUSD: 2 };

export function registerDemoExecutionBridge(): void {
  if (globalForBridge.demoExecutionBridgeRegistered) return;
  const gateway = CTraderDemoGateway.getInstance();
  AutoReconciliationService.getInstance().attach(gateway);
  gateway.onConnectionChange(connected => CTraderOMS.setBrokerConnection(connected));
  gateway.onExecutionEvent(event => {
    const applied = CTraderOMS.applyExecutionEvent(event);
    if (!applied.applied && !event.isServerEvent) {
      console.warn('[DemoExecutionBridge] execution event did not match an OMS outbox record', event.clientOrderId, event.brokerOrderId);
    }
  });
  CTraderOMS.registerBrokerOrderHandler(async (request: OrderSubmissionRequest) => {
    if (request.environment !== 'BROKER_DEMO') throw new Error('BROKER_ENVIRONMENT_REQUIRED: فقط BROKER_DEMO از Gateway واقعی استفاده می‌کند.');
    const accountId = Number(process.env.CTRADER_ACCOUNT_ID);
    const symbolId = SYMBOL_IDS[request.symbol];
    if (!Number.isInteger(accountId) || !symbolId) throw new Error('BROKER_CONFIG_INVALID: account یا symbol برای Demo معتبر نیست.');
    const clientOrderId = request.intentId.slice(0, 50);
    const commandResult = await gateway.submitDemoLimitOrder({
      intentId: request.intentId,
      clientOrderId,
      accountId,
      symbolId,
      direction: request.direction,
      volumeLots: request.volumeLots,
      limitPrice: request.limitPrice,
      stopLossPrice: request.stopLossPrice,
      takeProfitPrice: request.takeProfitPrice,
    });
    if (!commandResult.accepted) throw new Error(commandResult.error || 'BROKER_ORDER_SEND_FAILED: سفارش به Gateway ارسال نشد.');
    let event: NormalizedExecutionEvent;
    try {
      event = await gateway.waitForExecution(clientOrderId);
    } catch (error) {
      setTimeout(() => { void AutoReconciliationService.getInstance().request('ORDER_TIMEOUT'); }, 0);
      throw error;
    }
    return {
      brokerOrderId: event.brokerOrderId || `CLIENT-${clientOrderId}`,
      stopLossConfirmed: event.stopLossConfirmed,
      takeProfitConfirmed: event.takeProfitConfirmed,
      state: event.state,
      brokerError: event.errorCode,
    };
  });
  globalForBridge.demoExecutionBridgeRegistered = true;
}
