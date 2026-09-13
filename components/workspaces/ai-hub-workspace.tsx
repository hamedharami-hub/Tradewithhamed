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
import {
  MultiAgentConfiguration,
  AGENT_ROLES_INFO,
  AGENT_ENGINE_OPTIONS,
  TRADING_STYLES,
  AgentRole,
} from '@/lib/contracts/multi-agent-system';
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
          <div className="bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border-subtle)] space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-500" />
                  شورای ۴ ایجنت هوشمند هماهنگ (Alpha Council Pipeline)
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  خط‌لوله ۴ ایجنت تخصصی برای پایش، تحلیل، نقد ریسک و داوری نهایی بر پایه سبک معاملاتی اسمارت‌مانی
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onOpenAIModal}
                  className="px-3 py-1.5 rounded-xl bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] text-xs flex items-center gap-1.5 transition-colors text-[var(--text-secondary)]"
                >
                  <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                  <span>مدل عصبی فعال:</span>
                  <span className="font-mono font-bold text-cyan-500">{selectedModelName}</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenMultiAgentModal}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-500 text-slate-900 font-bold text-xs flex items-center gap-1.5 hover:bg-cyan-400 transition-colors shadow-sm"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>اتاق فرمان ۴ ایجنت</span>
                </button>
              </div>
            </div>

            {/* نشانگر سبک معاملاتی فعال شورا */}
            {(() => {
              const activeStyle = TRADING_STYLES.find(s => s.id === multiAgentConfig.activeTradingStyle) || TRADING_STYLES[0];
              return (
                <div className="p-3 bg-cyan-950/20 border border-cyan-800/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1c222e] border border-[#2d3545] text-cyan-300">
                      {activeStyle.badgeFa}
                    </span>
                    <span className="font-bold text-zinc-100">{activeStyle.nameFa}</span>
                    <span className="text-zinc-400 text-[11px] hidden md:inline">— {activeStyle.descriptionFa}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px] shrink-0">
                    <span>حداقل R:R مصوب:</span>
                    <strong className="text-amber-400">1:{activeStyle.minimumRR}</strong>
                  </div>
                </div>
              );
            })()}

            {/* کارت‌های زنده و هماهنگ ۴ ایجنت خط‌لوله */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {(['SCANNER', 'ANALYST', 'CRITIC', 'JUDGE'] as AgentRole[]).map((role, idx) => {
                const info = AGENT_ROLES_INFO[role];
                const engineId =
                  role === 'SCANNER' ? multiAgentConfig.scannerEngineId :
                  role === 'ANALYST' ? multiAgentConfig.analystEngineId :
                  role === 'CRITIC' ? multiAgentConfig.criticEngineId :
                  multiAgentConfig.judgeEngineId;
                const engine =
                  AGENT_ENGINE_OPTIONS.find(e => e.id === engineId) ||
                  AGENT_ENGINE_OPTIONS.find(e => e.role === role)!;
                const isNeural = engine.type === 'NEURAL_WEBGPU';

                return (
                  <div
                    key={role}
                    onClick={onOpenMultiAgentModal}
                    className="p-4 rounded-xl border border-[#262c3a] bg-[#161a22] hover:border-cyan-600/70 transition-all cursor-pointer space-y-2.5 shadow-sm group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#1c222e] border border-[#2f3747] text-cyan-400 font-mono text-[11px] flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-xs text-zinc-100">{info.nameFa}</span>
                      </div>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        isNeural
                          ? 'bg-purple-950/60 border-purple-800/60 text-purple-300'
                          : 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                      }`}>
                        {isNeural ? 'WebGPU عصبی' : 'محاسباتی قطعی'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#0e1117] border border-[#202634] space-y-1">
                      <div className="text-[10px] text-zinc-400">موتور فعال:</div>
                      <div className="text-xs font-bold text-cyan-300 truncate" title={engine.nameFa}>
                        {engine.nameFa}
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                      {info.missionFa}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-[#1f2533]">
                      <span>تأخیر: <strong className="text-cyan-400 font-mono">~{engine.latencyMs}ms</strong></span>
                      <span className="text-cyan-400 group-hover:underline flex items-center gap-0.5">
                        تنظیم موتور ⚙️
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
