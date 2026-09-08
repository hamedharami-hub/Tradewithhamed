'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Zap,
  Lock,
  Activity,
} from 'lucide-react';
import { LiveShadowWorkbench } from '@/components/trading/live-shadow-workbench';
import { SecurityDRPanel } from '@/components/trading/security-dr-panel';
import { TestRunnerPanel } from '@/components/trading/test-runner-panel';
import { OutboxExecutionCard } from '@/components/trading/outbox-execution-card';
import { TransactionalOutboxRecord } from '@/lib/contracts/execution';

interface SystemWorkspaceProps {
  outboxRecords: TransactionalOutboxRecord[];
  isBlocked: boolean;
  blockingReason?: string;
  onReconcileOrder: (id: string) => Promise<void> | void;
  onRefreshOutbox: () => void;
  onOpenExportModal: () => void;
}

export const SystemWorkspace: React.FC<SystemWorkspaceProps> = ({
  outboxRecords,
  isBlocked,
  blockingReason,
  onReconcileOrder,
  onRefreshOutbox,
  onOpenExportModal,
}) => {
  const [activeSection, setActiveSection] = useState<'execution' | 'security' | 'diagnostics'>('execution');

  const handleReconcile = async (id: string) => {
    await onReconcileOrder(id);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* هدر مرکز کنترل، امنیت و سلامت سیستم */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-subtle)] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">مرکز کنترل، امنیت و تاب‌آوری سیستم</h2>
            <p className="text-xs text-[var(--text-muted)]">
              صندوق تراکنش‌های cTrader، مدیریت تک‌مجری، کلید توقف اضطراری، پایش DR و ۱۳۱ آزمون تشخیصی
            </p>
          </div>
        </div>

        {/* دکمه‌های انتخاب زیربخش */}
        <div className="flex items-center gap-1 bg-[var(--bg-canvas)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs w-full md:w-auto">
          <button
            type="button"
            onClick={() => setActiveSection('execution')}
            className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeSection === 'execution'
                ? 'bg-emerald-500/15 text-emerald-500 font-bold border border-emerald-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>مجری و صندوق Outbox</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('security')}
            className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeSection === 'security'
                ? 'bg-emerald-500/15 text-emerald-500 font-bold border border-emerald-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>امنیت، DR و پشتیبان</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('diagnostics')}
            className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeSection === 'diagnostics'
                ? 'bg-emerald-500/15 text-emerald-500 font-bold border border-emerald-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>۱۳۱ تست و سلامت سنج</span>
          </button>
        </div>
      </div>

      {/* بخش فعال انتخاب‌شده */}
      {activeSection === 'execution' && (
        <div className="space-y-4">
          <LiveShadowWorkbench />
          <div className="mt-4">
            <OutboxExecutionCard
              records={outboxRecords}
              isBlocked={isBlocked}
              blockingReason={blockingReason}
              onReconcile={handleReconcile}
              onRefreshOutbox={onRefreshOutbox}
            />
          </div>
        </div>
      )}

      {activeSection === 'security' && (
        <div className="space-y-4">
          <SecurityDRPanel />
        </div>
      )}

      {activeSection === 'diagnostics' && (
        <div className="space-y-4">
          <TestRunnerPanel />
        </div>
      )}
    </div>
  );
};
