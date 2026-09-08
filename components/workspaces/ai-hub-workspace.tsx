'use client';

import React, { useState } from 'react';
import {
  Brain,
  BookOpen,
  Layers,
  Bot,
  Sliders,
  Sparkles,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { RAGPlaybookWorkbench } from '@/components/trading/rag-playbook-workbench';
import { MultiTimeframeSyncView } from '@/components/trading/multi-timeframe-sync-view';
import { MultiAgentConfiguration } from '@/lib/contracts/multi-agent-system';
import { SymbolId, Candle } from '@/lib/contracts/market';
import { MultiTimeframeLevel } from '@/lib/contracts/monte-carlo';

interface AIHubWorkspaceProps {
  symbol: SymbolId;
  candles: Candle[];
  macroLevels: MultiTimeframeLevel[];
  syncedCrosshairPrice: number | null;
  setSyncedCrosshairPrice: (price: number | null) => void;
  multiAgentConfig: MultiAgentConfiguration;
  onOpenMultiAgentModal: () => void;
  onOpenAIModal: () => void;
  selectedModelName: string;
}

export const AIHubWorkspace: React.FC<AIHubWorkspaceProps> = ({
  symbol,
  candles,
  macroLevels,
  multiAgentConfig,
  onOpenMultiAgentModal,
  onOpenAIModal,
  selectedModelName,
}) => {
  const [activeSection, setActiveSection] = useState<'playbook' | 'mtf' | 'agents'>('playbook');
  const currentPrice = candles[candles.length - 1]?.close || 2050;

  return (
    <div className="space-y-4" dir="rtl">
      {/* هدر بخش هوش مصنوعی با دکمه‌های ناوبری داخلی سبک Segmented Control */}
      <div className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-subtle)] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-500/10 text-cyan-500 rounded-xl border border-cyan-500/20">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">هاب هوش مصنوعی و استراتژی‌ها</h2>
            <p className="text-xs text-[var(--text-muted)]">
              شورای ایجنت‌های ۴‌گانه، بازیابی معنایی محلی (RAG) و پردازش بدون سرور با WebLLM
            </p>
          </div>
        </div>

        {/* دکمه‌های انتخاب زیربخش هاب هوش مصنوعی */}
        <div className="flex items-center gap-1 bg-[var(--bg-canvas)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs w-full md:w-auto">
          <button
            type="button"
            onClick={() => setActiveSection('playbook')}
            className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeSection === 'playbook'
                ? 'bg-cyan-500/15 text-cyan-500 font-bold border border-cyan-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>کتابچه RAG</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('mtf')}
            className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeSection === 'mtf'
                ? 'bg-cyan-500/15 text-cyan-500 font-bold border border-cyan-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>ماتریس چندتایم‌فریمی</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('agents')}
            className={`flex-1 md:flex-none px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeSection === 'agents'
                ? 'bg-cyan-500/15 text-cyan-500 font-bold border border-cyan-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>شورای ایجنت‌ها</span>
          </button>
        </div>
      </div>

      {/* بخش فعال انتخاب‌شده */}
      {activeSection === 'playbook' && (
        <div className="space-y-4">
          <RAGPlaybookWorkbench />
        </div>
      )}

      {activeSection === 'mtf' && (
        <div className="space-y-4">
          <MultiTimeframeSyncView
            symbol={symbol}
            currentPrice={currentPrice}
            macroLevels={macroLevels}
          />
        </div>
      )}

      {activeSection === 'agents' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-surface)] p-6 rounded-2xl border border-[var(--border-subtle)] space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-500" />
                  شورای ۴ ایجنت هوشمند اختصاصی حامد
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  ارزیابی چندجانبه هر ستاپ معاملاتی بر مبنای ۴ سبک معامله با حدنصاب رأی‌گیری
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenAIModal}
                  className="px-3 py-1.5 rounded-xl bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] text-xs flex items-center gap-1.5 transition-colors text-[var(--text-secondary)]"
                >
                  <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                  <span>مدل آفلاین:</span>
                  <span className="font-mono font-bold text-cyan-500">{selectedModelName}</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenMultiAgentModal}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-900 font-bold text-xs flex items-center gap-1.5 hover:bg-cyan-400 transition-colors shadow-sm"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>پیکربندی اوزان شورا</span>
                </button>
              </div>
            </div>

            {/* کارت‌های نمایش ۴ ایجنت */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  id: 'trend_following',
                  nameFa: 'ایجنت تعقیب روند',
                  styleEn: 'Trend Following',
                  descFa: 'تشخیص ساختار BOS، سوگیری جهت‌دار و همگرایی میانگین‌های متحرک',
                  color: 'border-emerald-500/40 text-emerald-500 bg-emerald-500/5',
                },
                {
                  id: 'mean_reversion',
                  nameFa: 'ایجنت بازگشت به میانگین',
                  styleEn: 'Mean Reversion',
                  descFa: 'سنجش بیش‌خرید/بیش‌فروش، دایورجنس‌ها و انحرافات مقطعی از ارزش منصفانه',
                  color: 'border-amber-500/40 text-amber-500 bg-amber-500/5',
                },
                {
                  id: 'breakout',
                  nameFa: 'ایجنت شکست و شتاب',
                  styleEn: 'Breakout Hunter',
                  descFa: 'رصد انباشت نقدینگی، شکست الگوها و ورود پس از جذب سفارشات متوقف',
                  color: 'border-purple-500/40 text-purple-500 bg-purple-500/5',
                },
                {
                  id: 'range_trading',
                  nameFa: 'ایجنت معامله در رِنج',
                  styleEn: 'Range Bound',
                  descFa: 'معامله در سقف و کف کانال‌های متراکم در فازهای فاقد روند',
                  color: 'border-cyan-500/40 text-cyan-500 bg-cyan-500/5',
                },
              ].map((agent) => (
                <div
                  key={agent.id}
                  className={`p-4 rounded-xl border ${agent.color} space-y-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[var(--text-primary)]">{agent.nameFa}</span>
                    <CheckCircle2 className="w-4 h-4 opacity-70" />
                  </div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)]">{agent.styleEn}</div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{agent.descFa}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
