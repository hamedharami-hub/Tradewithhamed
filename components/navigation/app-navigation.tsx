'use client';

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Brain,
  BarChart3,
  FlaskConical,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { useTheme } from '@/context/theme-context';

export type WorkspaceKey = 'trade' | 'ai' | 'analytics' | 'system';

export interface WorkspaceItem {
  id: WorkspaceKey;
  labelFa: string;
  shortLabelFa: string;
  labelEn: string;
  descriptionFa: string;
  icon: React.ElementType;
  shortcut: string;
  badge?: string;
  badgeColor?: string;
}

interface AppNavigationProps {
  activeWorkspace: WorkspaceKey;
  onSelectWorkspace: (workspace: WorkspaceKey) => void;
  hasActiveCandidate?: boolean;
  outboxPendingCount?: number;
  unreadAlertsCount?: number;
  viewMode?: 'auto' | 'mobile' | 'windows';
}

export const AppNavigation: React.FC<AppNavigationProps> = ({
  activeWorkspace,
  onSelectWorkspace,
  hasActiveCandidate = false,
  outboxPendingCount = 0,
  unreadAlertsCount = 0,
  viewMode = 'auto',
}) => {
  const { actualTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // تعریف ۴ حوزه کاری یکپارچه سامانه
  const workspaces: WorkspaceItem[] = [
    {
      id: 'trade',
      labelFa: 'میز معامله و دیده‌بان',
      shortLabelFa: 'معامله',
      labelEn: 'Trade Terminal',
      descriptionFa: 'چارت زنده، ترید ۱-کلیکی و ستاپ',
      icon: LineChart,
      shortcut: '1',
      badge: hasActiveCandidate ? 'ستاپ فعال' : undefined,
      badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    },
    {
      id: 'ai',
      labelFa: 'هاب هوش مصنوعی و استراتژی',
      shortLabelFa: 'هوش مصنوعی',
      labelEn: 'AI & Strategy Hub',
      descriptionFa: 'شورای ایجنت‌ها، کتابچه RAG و مدل آفلاین',
      icon: Brain,
      shortcut: '2',
      badge: unreadAlertsCount > 0 ? `${unreadAlertsCount} سیگنال` : 'S0 فعال',
      badgeColor: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30',
    },
    {
      id: 'analytics',
      labelFa: 'آزمایشگاه بک‌تست، تحلیل و ژورنال',
      shortLabelFa: 'بک‌تست و ژورنال',
      labelEn: 'Backtest & Journal Lab',
      descriptionFa: 'بک‌تست چندسبکه، ژورنال W5، مونت‌کارلو و محافظ W4',
      icon: BarChart3,
      shortcut: '3',
      badge: 'بک‌تست + W5',
      badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    },
    {
      id: 'system',
      labelFa: 'مرکز کنترل، امنیت و سلامت',
      shortLabelFa: 'کنترل و امنیت',
      labelEn: 'System Control',
      descriptionFa: 'صندوق سفارشات، تک‌مجری و تست‌ها',
      icon: ShieldCheck,
      shortcut: '4',
      badge: outboxPendingCount > 0 ? `${outboxPendingCount} در صف` : 'تست‌ها OK',
      badgeColor:
        outboxPendingCount > 0
          ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
          : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    },
  ];

  // پشتیبانی از کلیدهای میانبر در دسکتاپ (Alt + 1..4 یا Ctrl + 1..4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.altKey) && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault();
          onSelectWorkspace('trade');
        } else if (e.key === '2') {
          e.preventDefault();
          onSelectWorkspace('ai');
        } else if (e.key === '3') {
          e.preventDefault();
          onSelectWorkspace('analytics');
        } else if (e.key === '4') {
          e.preventDefault();
          onSelectWorkspace('system');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectWorkspace]);

  const forceMobile = viewMode === 'mobile';
  const forceWindows = viewMode === 'windows';

  return (
    <>
      {/* سایدبار عمودی مخصوص ویندوز / دسکتاپ (پنهان در موبایل مگر اینکه حالت ویندوز اجباری باشد) */}
      <aside
        className={`${
          forceMobile ? 'hidden' : forceWindows ? 'flex' : 'hidden md:flex'
        } shrink-0 flex-col transition-all duration-300 ${
          isCollapsed ? 'w-16' : 'w-64'
        } bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] min-h-[calc(100vh-48px)] sticky top-12 z-30`}
        dir="rtl"
      >
        <div className="p-3 flex items-center justify-between border-b border-[var(--border-subtle)]">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-cyan-500 tracking-wider">محیط‌های کاری</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                v4.0
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-raised)] transition-colors mx-auto"
            title={isCollapsed ? 'باز کردن منو' : 'جمع کردن منو'}
          >
            {isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1.5 overflow-y-auto">
          {workspaces.map((ws) => {
            const Icon = ws.icon;
            const isActive = activeWorkspace === ws.id;

            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => onSelectWorkspace(ws.id)}
                className={`w-full group relative flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-all text-right ${
                  isActive
                    ? 'bg-[var(--bg-surface-raised)] text-cyan-500 shadow-sm border border-[var(--border-strong)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-raised)]/60'
                }`}
                title={`${ws.labelFa} (Ctrl+${ws.shortcut})`}
              >
                <div
                  className={`p-2 rounded-lg transition-transform ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-500 scale-105'
                      : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                </div>

                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs truncate">{ws.labelFa}</span>
                      <kbd className="hidden lg:inline text-[9px] font-mono px-1 py-0.2 rounded bg-[var(--bg-canvas)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                        {ws.shortcut}
                      </kbd>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{ws.descriptionFa}</p>
                  </div>
                )}

                {/* نشان بج اختصاصی */}
                {ws.badge && !isCollapsed && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${ws.badgeColor || ''}`}>
                    {ws.badge}
                  </span>
                )}

                {/* نشانگر فعال عمودی */}
                {isActive && (
                  <span className="absolute right-0 top-2 bottom-2 w-1 bg-cyan-500 rounded-l" />
                )}
              </button>
            );
          })}
        </nav>

        {/* پاورقی سایدبار */}
        {!isCollapsed && (
          <div className="p-3 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] space-y-1">
            <div className="flex items-center justify-between font-mono">
              <span>طراحی ویندوز</span>
              <span className="text-cyan-500 font-bold">Snapdragon X+</span>
            </div>
            <p className="text-[9px] opacity-70">کلیدهای میانبر: Ctrl + 1..5</p>
          </div>
        )}
      </aside>

      {/* نوار ناوبری پایینی شناور مخصوص موبایل و تاشو (Pixel 9 Pro Fold) */}
      <div
        className={`${
          forceWindows ? 'hidden' : forceMobile ? 'flex' : 'flex md:hidden'
        } fixed bottom-0 left-0 right-0 z-40 px-3 py-2 bg-[var(--bg-surface)]/95 border-t border-[var(--border-subtle)] backdrop-blur-md shadow-lg justify-around items-center`}
        dir="rtl"
      >
        {workspaces.map((ws) => {
          const Icon = ws.icon;
          const isActive = activeWorkspace === ws.id;

          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => onSelectWorkspace(ws.id)}
              className={`relative flex flex-col items-center justify-center min-h-[48px] min-w-[56px] px-2 py-1 rounded-xl transition-all ${
                isActive
                  ? 'text-cyan-500 font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isActive ? 'bg-cyan-500/10 text-cyan-500 scale-110' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{ws.shortLabelFa}</span>

              {/* نقطه نشانگر فعال */}
              {isActive && (
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-0.5 animate-pulse" />
              )}

              {/* نشان بج کوچک برای موبایل */}
              {ws.badge && (
                <span className="absolute top-1 right-3 w-2 h-2 rounded-full bg-cyan-500 ring-2 ring-[var(--bg-surface)]" />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};
