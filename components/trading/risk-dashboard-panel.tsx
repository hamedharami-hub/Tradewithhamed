'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, RefreshCw, ShieldAlert, TrendingDown, WalletCards } from 'lucide-react';

interface RiskDashboardSnapshot {
  generatedAt: number;
  execution: {
    pendingOutbox: number;
    reconciliationRequired: number;
    killNewEntriesActive: boolean;
    brokerOnline: boolean;
  };
  journal: {
    openPositions: number;
    closedTrades: number;
    netProfit: number;
    winRatePercent: number;
    maxDrawdownPercent: number;
    expectancyR: number;
  };
  security: {
    rateLimitedRequests: number;
    trackedClients: number;
  };
  riskFlags: string[];
}

interface DashboardResponse {
  ok?: boolean;
  data?: RiskDashboardSnapshot;
  error?: { message?: string };
  success?: boolean;
}

const numberFormat = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });

export function RiskDashboardPanel() {
  const [snapshot, setSnapshot] = useState<RiskDashboardSnapshot | null>(null);
  const [message, setMessage] = useState('در حال دریافت snapshot ریسک...');
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/risk-dashboard', { cache: 'no-store' });
      const payload = await response.json() as DashboardResponse;
      if (!response.ok || !payload.data) {
        setMessage(payload.error?.message || 'برای مشاهده داشبورد، نشست اپراتور را باز کنید.');
        setSnapshot(null);
        return;
      }
      setSnapshot(payload.data);
      setMessage('آخرین snapshot با موفقیت دریافت شد.');
    } catch {
      setMessage('ارتباط با داشبورد ریسک برقرار نشد.');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0);
    const interval = window.setInterval(() => void loadDashboard(), 15000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-4" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)]">داشبورد ریسک لحظه‌ای</h3>
            <p className="text-[11px] text-[var(--text-muted)]">ترکیب وضعیت اجرا، ژورنال، امنیت و هشدارهای عملیاتی</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 inline-block ml-1 ${loading ? 'animate-spin' : ''}`} />
          بروزرسانی
        </button>
      </header>

      {!snapshot ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-300 px-3 py-3 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Metric icon={<Activity className="w-4 h-4" />} label="پوزیشن باز" value={numberFormat.format(snapshot.journal.openPositions)} />
            <Metric icon={<WalletCards className="w-4 h-4" />} label="در صف اجرا" value={numberFormat.format(snapshot.execution.pendingOutbox)} />
            <Metric icon={<TrendingDown className="w-4 h-4" />} label="Drawdown" value={`${numberFormat.format(snapshot.journal.maxDrawdownPercent)}٪`} tone={snapshot.journal.maxDrawdownPercent >= 5 ? 'danger' : 'normal'} />
            <Metric icon={<BarChart3 className="w-4 h-4" />} label="Expectancy" value={`${numberFormat.format(snapshot.journal.expectancyR)}R`} tone={snapshot.journal.expectancyR < 0 ? 'danger' : 'normal'} />
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <StatusChip label="Broker" active={snapshot.execution.brokerOnline} activeText="آنلاین" inactiveText="آفلاین" />
            <StatusChip label="Kill switch" active={!snapshot.execution.killNewEntriesActive} activeText="غیرفعال" inactiveText="فعال" dangerWhenInactive />
            <StatusChip label="Reconciliation" active={snapshot.execution.reconciliationRequired === 0} activeText="پاک" inactiveText={`${snapshot.execution.reconciliationRequired} مورد`} dangerWhenInactive />
            <StatusChip label="Win rate" active={snapshot.journal.winRatePercent >= 50} activeText={`${numberFormat.format(snapshot.journal.winRatePercent)}٪`} inactiveText={`${numberFormat.format(snapshot.journal.winRatePercent)}٪`} />
          </div>
          {snapshot.riskFlags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {snapshot.riskFlags.map(flag => (
                <span key={flag} className="px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-[10px] font-mono">
                  {flag}
                </span>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[var(--text-muted)]">{message} زمان snapshot: {new Date(snapshot.generatedAt).toLocaleTimeString('fa-IR')}</p>
        </>
      )}
    </section>
  );
}

function Metric({ icon, label, value, tone = 'normal' }: { icon: React.ReactNode; label: string; value: string; tone?: 'normal' | 'danger' }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)] text-[10px]">{icon}{label}</div>
      <div className={`mt-1 text-sm font-bold ${tone === 'danger' ? 'text-rose-500' : 'text-[var(--text-primary)]'}`}>{value}</div>
    </div>
  );
}

function StatusChip({ label, active, activeText, inactiveText, dangerWhenInactive = false }: { label: string; active: boolean; activeText: string; inactiveText: string; dangerWhenInactive?: boolean }) {
  const danger = !active && dangerWhenInactive;
  return (
    <span className={`px-2 py-1 rounded-md border ${danger ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
      {label}: {active ? activeText : inactiveText}
    </span>
  );
}
