'use client';

import React, { useState } from 'react';
import {
  BarChart3,
  BookMarked,
  FlaskConical,
  ShieldAlert,
  Dice5,
} from 'lucide-react';
import { JournalWorkbenchW5 } from '@/components/trading/journal-workbench-w5';
import { ResearchWorkbench } from '@/components/trading/research-workbench';
import { RiskGuardianWorkbench } from '@/components/trading/risk-guardian-workbench';
import { Candle, SymbolId } from '@/lib/contracts/market';

interface AnalyticsWorkspaceProps {
  candles: Candle[];
  symbol: SymbolId;
  onOpenMonteCarlo: () => void;
  onOpenBacktest: () => void;
}

export const AnalyticsWorkspace: React.FC<AnalyticsWorkspaceProps> = ({
  candles,
  symbol,
  onOpenMonteCarlo,
  onOpenBacktest,
}) => {
  const [activeSection, setActiveSection] = useState<'journal' | 'research' | 'guardian'>('journal');

  return (
    <div className="space-y-4" dir="rtl">
      {/* هدر کارگاه تحلیل، ریسک و ژورنال با Segmented Control */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-subtle)] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl border border-amber-500/20">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">کارگاه تحلیلی، ریسک و ژورنال</h2>
            <p className="text-xs text-[var(--text-muted)]">
              ژورنال خودکار W5، شبیه‌سازی آماری، محافظ سبد معاملاتی و پژوهش تاریخی
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* دکمه‌های ناوبری ۳ بخش تحلیلی */}
          <div className="flex items-center gap-1 bg-[var(--bg-canvas)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs flex-1 md:flex-none">
            <button
              type="button"
              onClick={() => setActiveSection('journal')}
              className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeSection === 'journal'
                  ? 'bg-amber-500/15 text-amber-500 font-bold border border-amber-500/30'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <BookMarked className="w-4 h-4" />
              <span>ژورنال خودکار W5</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('research')}
              className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeSection === 'research'
                  ? 'bg-amber-500/15 text-amber-500 font-bold border border-amber-500/30'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              <span>پژوهش و بک‌تست</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('guardian')}
              className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeSection === 'guardian'
                  ? 'bg-amber-500/15 text-amber-500 font-bold border border-amber-500/30'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>محافظ ریسک W4</span>
            </button>
          </div>

          {/* ابزارهای تکمیلی: مونت‌کارلو و بک‌تست چندسبکه */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenMonteCarlo}
              className="px-3 py-2 rounded-xl bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="اجرای ۱۰۰۰ مسیر تصادفی مونت‌کارلو"
            >
              <Dice5 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مونت‌کارلو</span>
            </button>
          </div>
        </div>
      </div>

      {/* محتوای بخش فعال */}
      {activeSection === 'journal' && (
        <div className="space-y-4">
          <JournalWorkbenchW5 />
        </div>
      )}

      {activeSection === 'research' && (
        <div className="space-y-4">
          <ResearchWorkbench
            currentCandles={candles}
            symbol={symbol}
          />
        </div>
      )}

      {activeSection === 'guardian' && (
        <div className="space-y-4">
          <RiskGuardianWorkbench />
        </div>
      )}
    </div>
  );
};
