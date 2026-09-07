'use client';

import React, { useState } from 'react';
import { TransactionalOutboxRecord } from '@/lib/contracts/execution';
import { Database, AlertTriangle, CheckCircle, RefreshCcw, ShieldCheck, ArrowRightLeft } from 'lucide-react';

interface OutboxExecutionCardProps {
  records: TransactionalOutboxRecord[];
  isBlocked: boolean;
  blockingReason?: string;
  onReconcile: (intentId: string) => Promise<void>;
  onRefreshOutbox: () => void;
}

export const OutboxExecutionCard: React.FC<OutboxExecutionCardProps> = ({
  records,
  isBlocked,
  blockingReason,
  onReconcile,
  onRefreshOutbox,
}) => {
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  const handleReconcile = async (intentId: string) => {
    setReconcilingId(intentId);
    try {
      await onReconcile(intentId);
    } finally {
      setReconcilingId(null);
    }
  };

  const getStatusBadge = (state: string) => {
    switch (state) {
      case 'SUBMITTING':
        return <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">SUBMITTING</span>;
      case 'ACKNOWLEDGED':
        return <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">ACKNOWLEDGED</span>;
      case 'UNKNOWN_RECONCILE_REQUIRED':
        return (
          <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono font-bold animate-pulse">
            UNKNOWN_RECONCILE_REQUIRED
          </span>
        );
      case 'RECONCILED':
        return <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 font-mono">RECONCILED</span>;
      case 'REJECTED_BY_BROKER':
        return <span className="px-2 py-0.5 rounded bg-zinc-800 text-rose-400 border border-rose-900 font-mono">REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{state}</span>;
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      {/* سربرگ صندوق تراکنشی */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-zinc-100">صندوق تراکنشی خروجی (Transactional Outbox)</h2>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            {records.length} رکورد
          </span>
        </div>
        <button
          onClick={onRefreshOutbox}
          title="تازه‌سازی صف"
          className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors text-xs flex items-center gap-1"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          <span>تازه‌سازی</span>
        </button>
      </div>

      {/* بنر هشدار قفل بازتطبیق اجباری */}
      {isBlocked && (
        <div className="p-3 bg-rose-950/70 border border-rose-800/80 rounded-lg flex items-start gap-2 text-xs text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold">قفل ایمنی بازتطبیق فعال است (Fail-Closed)</div>
            <div className="text-[11px] text-rose-300/90 mt-0.5">{blockingReason}</div>
          </div>
        </div>
      )}

      {/* لیست رکوردهای صندوق تراکنشی */}
      {records.length === 0 ? (
        <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
          صندوق خروجی خالی است. سفارشی ارسال نشده است.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {records.map(record => (
            <div
              key={record.intentId}
              className={`p-3 rounded-lg border text-xs flex flex-col gap-2 transition-colors ${
                record.state === 'UNKNOWN_RECONCILE_REQUIRED'
                  ? 'bg-rose-950/30 border-rose-900/60'
                  : 'bg-zinc-950 border-zinc-800/90'
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-zinc-200">{record.symbol}</span>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      record.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {record.direction} {record.volumeLots} Lot
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">@{record.limitPrice}</span>
                </div>
                <div>{getStatusBadge(record.state)}</div>
              </div>

              {/* شناسه‌های علیت و رهگیری */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] font-mono text-zinc-400 bg-zinc-900/60 p-2 rounded border border-zinc-800/50">
                <div className="truncate" title={record.correlationId}>
                  <span className="text-zinc-500">Correlation:</span> {record.correlationId}
                </div>
                <div className="truncate" title={record.causationId}>
                  <span className="text-zinc-500">Causation:</span> {record.causationId}
                </div>
                {record.brokerOrderId && (
                  <div className="text-emerald-400 font-bold">
                    <span className="text-zinc-500 font-normal">Broker Order ID:</span> {record.brokerOrderId}
                  </div>
                )}
                <div className="text-zinc-400">
                  <span className="text-zinc-500">SL/TP بروکر:</span>{' '}
                  {record.isBrokerStopLossConfirmed ? 'تأیید شد ✓' : 'در انتظار'}
                </div>
              </div>

              {/* پیام خطای بروکر در صورت وجود */}
              {record.brokerError && (
                <div className="text-[11px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/40">
                  {record.brokerError}
                </div>
              )}

              {/* دکمه بازتطبیق فوری در صورت بروز UNKNOWN_RECONCILE_REQUIRED */}
              {record.state === 'UNKNOWN_RECONCILE_REQUIRED' && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleReconcile(record.intentId)}
                    disabled={reconcilingId === record.intentId}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                  >
                    {reconcilingId === record.intentId ? (
                      <>
                        <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>در حال استعلام از بروکر...</span>
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>انجام بازتطبیق اجباری (Reconcile)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
