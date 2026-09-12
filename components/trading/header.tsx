'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Activity,
  Smartphone,
  Laptop,
  AlertTriangle,
  Bot,
  Lock,
  Bell,
  Settings,
  X,
  Sliders,
} from 'lucide-react';
import { PWAInstallButton } from './pwa-install-button';
import { SystemHealthBadge } from './system-health-badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { MarketRegimeAnalysis } from '@/lib/contracts/regimes';

export type TradingEnvironment =
  | 'PAPER_REPLAY'
  | 'PAPER_LIVE'
  | 'BROKER_DEMO'
  | 'BROKER_LIVE';

interface HeaderProps {
  dataMode: 'LIVE' | 'DELAYED' | 'REPLAYED' | 'SIMULATED' | 'STALE' | 'UNKNOWN';
  accountMaskedId: string;
  equity: number;
  balance: number;
  onRefresh?: () => void;
  isBlocked?: boolean;
  currentViewMode?: 'auto' | 'mobile' | 'windows';
  onChangeViewMode?: (mode: 'auto' | 'mobile' | 'windows') => void;
  activeModelName?: string;
  onOpenAIModal?: () => void;
  currentEnvironment?: TradingEnvironment;
  onChangeEnvironment?: (env: TradingEnvironment) => void;
  marketRegime?: MarketRegimeAnalysis;
  onOpenAlertModal?: () => void;
  unreadAlertsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  dataMode,
  accountMaskedId,
  equity,
  balance,
  onRefresh,
  isBlocked,
  currentViewMode = 'auto',
  onChangeViewMode,
  activeModelName,
  onOpenAIModal,
  currentEnvironment = 'BROKER_DEMO',
  onChangeEnvironment,
  marketRegime,
  onOpenAlertModal,
  unreadAlertsCount = 0,
}) => {
  const [showLiveBlockedModal, setShowLiveBlockedModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // بستن پاپ‌اور تنظیمات با کلیک بیرون
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isSettingsOpen]);

  const handleEnvClick = (env: TradingEnvironment) => {
    if (env === 'BROKER_LIVE') {
      setShowLiveBlockedModal(true);
      return;
    }
    if (onChangeEnvironment) {
      onChangeEnvironment(env);
    }
  };

  const getEnvBadge = () => {
    switch (currentEnvironment) {
      case 'BROKER_DEMO':
        return { label: 'cTrader Demo', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'PAPER_LIVE':
        return { label: 'Paper Live', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' };
      case 'PAPER_REPLAY':
        return { label: 'Paper Replay', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'BROKER_LIVE':
        return { label: 'Live (مسدود)', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
      default:
        return { label: currentEnvironment, color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' };
    }
  };

  const envBadge = getEnvBadge();

  return (
    <header className="w-full bg-[#0a0d14]/90 backdrop-blur-md border-b border-[#1c2230] px-3 sm:px-5 h-12 sticky top-0 z-40 shadow-xs select-none transition-colors" dir="rtl">
      <div className="h-full flex items-center justify-between gap-3 max-w-[1920px] mx-auto">
        {/* ۱. لوگو و نشان وضعیت اتصال */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-bold text-zinc-100 tracking-tight">
                Tradewithhamed
              </span>
              <span className="text-[9px] font-mono text-zinc-500 bg-[#121622] px-1 py-0.2 rounded border border-[#21293c]">
                v4.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-[10px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline font-mono">ONLINE</span>
          </div>

          {isBlocked && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/50 border border-rose-500/40 text-[10px] text-rose-300 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              <span className="font-bold">قفل ایمنی</span>
            </div>
          )}
        </div>

        {/* ۲. آمار مالی آرامش‌بخش و متمرکز (Center Financial Pill) */}
        <div className="flex items-center gap-1.5 sm:gap-3 text-xs">
          <div className="flex items-center gap-1.5 sm:gap-3 bg-[#111622] px-2 sm:px-3 py-1 rounded-xl border border-[#202738]">
            <div className="flex items-center gap-1 font-mono">
              <span className="text-[10px] text-zinc-400 hidden sm:inline">موجودی:</span>
              <span className="font-bold text-zinc-200 text-[11px] sm:text-xs">
                ${balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </div>
            <span className="text-zinc-600">|</span>
            <div className="flex items-center gap-1 font-mono">
              <span className="text-[10px] text-zinc-400 hidden sm:inline">اکوئیتی:</span>
              <span className={`font-bold text-[11px] sm:text-xs ${equity >= balance ? 'text-emerald-400' : 'text-amber-400'}`}>
                ${equity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* نشان محیط جاری */}
          <div className={`hidden md:flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-mono ${envBadge.color}`}>
            <span>{envBadge.label}</span>
          </div>
        </div>

        {/* ۳. ابزارهای سریع و منوی تجمیع‌شده تنظیمات (Left Actions) */}
        <div className="flex items-center gap-1.5 shrink-0" ref={settingsRef}>
          {/* دکمه هشدارهای معاملاتی */}
          {onOpenAlertModal && (
            <button
              type="button"
              onClick={onOpenAlertModal}
              className="relative p-1.5 rounded-lg bg-[#111622] hover:bg-[#181f30] text-zinc-400 hover:text-cyan-400 border border-[#202738] transition-colors"
              title="دیده‌بان هشدارها"
              aria-label="دیده‌بان هشدارها"
            >
              <Bell className="w-4 h-4" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-500 text-slate-950 text-[9px] font-mono font-black rounded-full flex items-center justify-center shadow-xs">
                  {unreadAlertsCount}
                </span>
              )}
            </button>
          )}

          {/* کلید باز کردن منوی تنظیمات مدرن و خلوت */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              isSettingsOpen
                ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                : 'bg-[#111622] hover:bg-[#181f30] border-[#202738] text-zinc-300 hover:text-zinc-100'
            }`}
            title="تنظیمات سامانه و امکانات"
            aria-label="تنظیمات سامانه"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline text-[11px]">تنظیمات</span>
          </button>

          {/* پاپ‌اور جامع و تمیز تنظیمات (Progressive Disclosure) */}
          {isSettingsOpen && (
            <div className="absolute top-12 left-3 sm:left-4 z-50 w-72 sm:w-80 bg-[#121622]/95 backdrop-blur-xl border border-[#252e42] rounded-2xl p-4 shadow-2xl space-y-3.5 text-right font-sans">
              <div className="flex items-center justify-between border-b border-[#21283a] pb-2">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-zinc-100">تنظیمات و ابزارها</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-zinc-500 hover:text-zinc-200 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* بخش ۱: محیط معاملاتی */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-zinc-400 block">محیط معاملاتی پلن ۴.۰:</span>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleEnvClick('PAPER_REPLAY')}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      currentEnvironment === 'PAPER_REPLAY'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                        : 'bg-[#181d2c] border-[#263045] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Replay
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEnvClick('PAPER_LIVE')}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      currentEnvironment === 'PAPER_LIVE'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-[#181d2c] border-[#263045] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Paper Live
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEnvClick('BROKER_DEMO')}
                    className={`p-1.5 rounded-lg border text-center transition-all ${
                      currentEnvironment === 'BROKER_DEMO'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-[#181d2c] border-[#263045] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    cTrader Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEnvClick('BROKER_LIVE')}
                    className="p-1.5 rounded-lg border border-[#263045] bg-[#181d2c] text-zinc-500 hover:text-rose-400 text-center transition-all flex items-center justify-center gap-1"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Live (مسدود)</span>
                  </button>
                </div>
              </div>

              {/* بخش ۲: هوش مصنوعی و مدل */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-zinc-400 block">مدل هوش مصنوعی آفلاین مرورگر:</span>
                {onOpenAIModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      onOpenAIModal();
                    }}
                    className="w-full p-2 bg-[#181d2c] hover:bg-[#1e2538] border border-[#263045] rounded-xl flex items-center justify-between text-xs text-cyan-400 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      <span className="font-bold">{activeModelName || 'Qwen/S0'}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">تغییر مدل ◂</span>
                  </button>
                )}
              </div>

              {/* بخش ۳: حالت نمایش و قالب */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-zinc-400 block">قالب و نمایش:</span>
                <div className="flex items-center justify-between bg-[#181d2c] p-2 rounded-xl border border-[#263045]">
                  <span className="text-xs text-zinc-300">قالب روز / شب:</span>
                  <ThemeToggle />
                </div>
                {onChangeViewMode && (
                  <div className="flex items-center justify-between bg-[#181d2c] p-2 rounded-xl border border-[#263045]">
                    <span className="text-xs text-zinc-300">طرح صفحه:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onChangeViewMode('windows')}
                        className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 ${
                          currentViewMode === 'windows' ? 'bg-cyan-600 text-white font-bold' : 'text-zinc-400'
                        }`}
                      >
                        <Laptop className="w-3 h-3" />
                        <span>دسکتاپ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeViewMode('mobile')}
                        className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 ${
                          currentViewMode === 'mobile' ? 'bg-amber-600 text-white font-bold' : 'text-zinc-400'
                        }`}
                      >
                        <Smartphone className="w-3 h-3" />
                        <span>موبایل</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* بخش ۴: نشانگرهای سیستم و PWA */}
              <div className="pt-2 border-t border-[#21283a] flex items-center justify-between">
                <SystemHealthBadge />
                <PWAInstallButton />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* مودال ایمنی حساب واقعی (BROKER_LIVE Gating) */}
      {showLiveBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4" dir="rtl">
          <div className="bg-[#121622] border border-[#273045] max-w-md w-full rounded-2xl p-5 space-y-4 text-right shadow-2xl">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-100">مسیر حساب واقعی (BROKER_LIVE)</h3>
                <span className="text-[10px] text-amber-400 font-mono">STATUS: BLOCKED BY POLICY</span>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              طبق بخش ۲۲ پلن نسخه ۴.۰ حامد، اتصال به حساب واقعی تا زمان گذر کامل از فاز ارزیابی دمو غیرفعال است.
            </p>

            <button
              type="button"
              onClick={() => setShowLiveBlockedModal(false)}
              className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold text-xs transition-colors"
            >
              متوجه شدم (بازگشت به حساب دمو)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
