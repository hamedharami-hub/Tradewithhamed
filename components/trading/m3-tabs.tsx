// components/trading/m3-tabs.tsx
'use client';

import React from 'react';
import {
  LineChart,
  BookOpen,
  ShieldAlert,
  ShieldCheck,
  FlaskConical,
  Sparkles,
  Zap,
  Brain,
} from 'lucide-react';

export type ActiveTabKey = 'chart' | 'research' | 'execution' | 'guardian' | 'journal' | 'playbook' | 'security' | 'tests';

interface M3TabsProps {
  activeTab: ActiveTabKey;
  onSelectTab: (tab: ActiveTabKey) => void;
  hasActiveCandidate?: boolean;
  outboxPendingCount?: number;
}

export const M3Tabs: React.FC<M3TabsProps> = ({
  activeTab,
  onSelectTab,
  hasActiveCandidate = false,
  outboxPendingCount = 0,
}) => {
  const tabs = [
    {
      key: 'chart' as ActiveTabKey,
      labelFa: 'میز مطالعه و تحلیل',
      labelEn: 'Chart & Study',
      icon: LineChart,
      badge: hasActiveCandidate ? 'ستاپ فعال' : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    },
    {
      key: 'research' as ActiveTabKey,
      labelFa: 'پژوهش و بک‌تست W2',
      labelEn: 'Research & Backtest',
      icon: FlaskConical,
      badge: 'رویدادمحور',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    },
    {
      key: 'execution' as ActiveTabKey,
      labelFa: 'اجرا و بازتطبیق W3',
      labelEn: 'Live Shadow & EMS',
      icon: Zap,
      badge: 'سایه زنده',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    },
    {
      key: 'guardian' as ActiveTabKey,
      labelFa: 'محافظ ریسک و سبد W4',
      labelEn: 'Risk Guardian & PMS',
      icon: ShieldCheck,
      badge: 'هوشیار',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    },
    {
      key: 'journal' as ActiveTabKey,
      labelFa: 'ژورنال و ممیزی W5',
      labelEn: 'Journal & Analytics W5',
      icon: BookOpen,
      badge: 'W5 فعال',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    },
    {
      key: 'playbook' as ActiveTabKey,
      labelFa: 'کتابچه استراتژی و RAG',
      labelEn: 'S0 Playbook & RAG',
      icon: Brain,
      badge: 'RAG محلی',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    },
    {
      key: 'security' as ActiveTabKey,
      labelFa: 'صندوق امنیت cTrader',
      labelEn: 'Outbox & Security',
      icon: ShieldAlert,
      badge: outboxPendingCount > 0 ? `${outboxPendingCount} در صف` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
    {
      key: 'tests' as ActiveTabKey,
      labelFa: 'پایش سلامت سیستم',
      labelEn: 'Diagnostics & Tests',
      icon: Sparkles,
      badge: 'خودکار',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    },
  ];

  return (
    <nav
      aria-label="بخش‌های اصلی برنامه"
      className="w-full bg-[#161a22] border border-[#272d3b] rounded-2xl p-1.5 shadow-sm"
      dir="rtl"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-0.5 md:grid md:grid-cols-8 md:overflow-x-visible">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelectTab(tab.key)}
              className={`relative shrink-0 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all font-sans text-xs md:text-sm font-medium whitespace-nowrap ${
                isActive
                  ? 'bg-[#222938] text-cyan-300 shadow-sm border border-cyan-500/40 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1f29] border border-transparent'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-transform ${
                  isActive ? 'text-cyan-400 scale-110' : 'text-zinc-400'
                }`}
              />
              <span className="truncate">{tab.labelFa}</span>

              {tab.badge && (
                <span
                  className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono border ${tab.badgeColor}`}
                >
                  {tab.badge}
                </span>
              )}

              {/* خط نشانگر اکتیو متریال ۳ */}
              {isActive && (
                <span className="absolute -bottom-1 w-1/3 h-0.5 bg-cyan-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
