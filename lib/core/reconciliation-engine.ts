// lib/core/reconciliation-engine.ts
// موتور بازتطبیق و مدیریت سوانح شبکه (Reconciliation & Incident Engine) در بسته W3
// متضمن اصل ایمنی Fail-Closed: در صورت بروز خطای مبهم، کلیه ارسال‌های جدید مسدود می‌شوند.

import { LiveShadowOrder, ReconciliationIncident } from '../contracts/w3-ems';

export class ReconciliationEngine {
  private incidents: Map<string, ReconciliationIncident> = new Map();
  private ackTimeoutMs: number;

  constructor(ackTimeoutMs: number = 3000) {
    this.ackTimeoutMs = ackTimeoutMs;
  }

  /**
   * بررسی اینکه آیا سفارش در وضعیت SUBMITTING دچار تایم‌اوت شده است
   */
  public isOrderTimedOut(order: LiveShadowOrder, now: number): boolean {
    if (order.state === 'SUBMITTING' && order.submittedAt) {
      return (now - order.submittedAt) > this.ackTimeoutMs;
    }
    return false;
  }

  /**
   * ثبت سانحه و ارتقای سفارش به وضعیت نیازمند بازتطبیق اجباری
   */
  public registerIncident(
    order: LiveShadowOrder,
    reason: ReconciliationIncident['reason'],
    notes: string,
    timestamp: number
  ): ReconciliationIncident {
    const incidentId = `INC-${order.intentId}-${timestamp}`;
    const incident: ReconciliationIncident = {
      incidentId,
      intentId: order.intentId,
      symbol: order.symbol,
      reason,
      detectedTimestamp: timestamp,
      status: 'PENDING',
      notes,
    };

    this.incidents.set(incidentId, incident);
    order.state = 'UNKNOWN_RECONCILE_REQUIRED';
    return incident;
  }

  /**
   * اصل Fail-Closed: آیا اجازه ثبت سفارش جدید وجود دارد؟
   * اگر حتی ۱ سانحه حل‌نشده وجود داشته باشد، سیستم قفل می‌شود.
   */
  public canSubmitNewOrder(): { allowed: boolean; reason?: string } {
    const pendingIncidents = Array.from(this.incidents.values()).filter(i => i.status === 'PENDING');
    if (pendingIncidents.length > 0) {
      return {
        allowed: false,
        reason: `سیستم در حالت ایمنی Fail-Closed قفل شده است: ${pendingIncidents.length} سفارش در وضعیت مبهم بازتطبیق (UNKNOWN_RECONCILE_REQUIRED) قرار دارند. قبل از ثبت سفارش جدید، بازتطبیق اجباری الزامی است.`,
      };
    }
    return { allowed: true };
  }

  /**
   * بازتطبیق خودکار با اسنپ‌شات وضعیت سفارشات در بروکر
   */
  public reconcileWithBrokerState(
    orders: LiveShadowOrder[],
    brokerSnapshot: Array<{
      brokerOrderId: string;
      intentId?: string;
      status: 'FILLED' | 'CANCELLED' | 'PENDING' | 'REJECTED';
      fillPrice?: number;
    }>,
    now: number
  ): { reconciledCount: number; remainingUnknown: number } {
    let reconciledCount = 0;

    for (const order of orders) {
      if (order.state !== 'UNKNOWN_RECONCILE_REQUIRED') continue;

      const brokerMatch = brokerSnapshot.find(
        b => (b.intentId && b.intentId === order.intentId) || (order.brokerOrderId && b.brokerOrderId === order.brokerOrderId)
      );

      if (brokerMatch) {
        if (brokerMatch.status === 'FILLED') {
          order.state = 'RECONCILED';
          order.filledAt = now;
          order.reconciledAt = now;
          order.brokerOrderId = brokerMatch.brokerOrderId;
          this.resolvePendingIncidentForIntent(order.intentId, 'BROKER_CONFIRMED_FILLED', now, 'تطبیق موفق با وضعیت FILLED در بروکر');
          reconciledCount++;
        } else if (brokerMatch.status === 'CANCELLED' || brokerMatch.status === 'REJECTED') {
          order.state = 'CANCELLED';
          order.reconciledAt = now;
          this.resolvePendingIncidentForIntent(order.intentId, 'BROKER_CONFIRMED_CANCELLED', now, 'تطبیق با وضعیت لغو/رد در بروکر');
          reconciledCount++;
        }
      } else {
        // سفارش در بروکر یافت نشد؛ احتمالاً به شبکه نرسیده بود
        order.state = 'CANCELLED';
        order.reconciledAt = now;
        this.resolvePendingIncidentForIntent(order.intentId, 'BROKER_CONFIRMED_CANCELLED', now, 'سفارش در لیست بروکر یافت نشد و با امنیت لغو ثبت شد');
        reconciledCount++;
      }
    }

    const remainingUnknown = orders.filter(o => o.state === 'UNKNOWN_RECONCILE_REQUIRED').length;
    return { reconciledCount, remainingUnknown };
  }

  /**
   * رفع دستی سانحه توسط کاربر
   */
  public manualOverride(
    incidentId: string,
    orders: LiveShadowOrder[],
    forcedState: 'CANCELLED' | 'RECONCILED',
    now: number,
    notes: string
  ): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.status = 'RESOLVED';
    incident.resolvedTimestamp = now;
    incident.resolutionType = 'MANUAL_OVERRIDE';
    incident.notes += ` [تایید دستی: ${notes}]`;

    const order = orders.find(o => o.intentId === incident.intentId);
    if (order) {
      order.state = forcedState;
      order.reconciledAt = now;
    }

    return true;
  }

  private resolvePendingIncidentForIntent(
    intentId: string,
    resolutionType: ReconciliationIncident['resolutionType'],
    now: number,
    notes: string
  ): void {
    for (const inc of this.incidents.values()) {
      if (inc.intentId === intentId && inc.status === 'PENDING') {
        inc.status = 'RESOLVED';
        inc.resolvedTimestamp = now;
        inc.resolutionType = resolutionType;
        inc.notes += ` [${notes}]`;
      }
    }
  }

  public getPendingIncidents(): ReconciliationIncident[] {
    return Array.from(this.incidents.values()).filter(i => i.status === 'PENDING');
  }

  public getAllIncidents(): ReconciliationIncident[] {
    return Array.from(this.incidents.values()).sort((a, b) => b.detectedTimestamp - a.detectedTimestamp);
  }

  public clear(): void {
    this.incidents.clear();
  }
}
