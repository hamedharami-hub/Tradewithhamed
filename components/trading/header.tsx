'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Activity,
  RefreshCw,
  Smartphone,
  Laptop,
  AlertTriangle,
  Bot,
  Lock,
  Radio,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Waves,
  Flame,
  Minimize2,
  Bell,
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

  const getBadgeColor = () => {
    switch (dataMode) {
      case 'LIVE':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'REPLAYED':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      case 'SIMULATED':
        return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30';
      case 'STALE':
      case 'UNKNOWN':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/30';
      default:
        return 'bg-[var(--bg-surface-raised)] text-[var(--text-secondary)] border-[var(--border-subtle)]';
    }
  };

  const handleEnvClick = (env: TradingEnvironment) => {
    if (env === 'BROKER_LIVE') {
      setShowLiveBlockedModal(true);
      return;
    }
    if (onChangeEnvironment) {
      onChangeEnvironment(env);
    }
  };

  return (
    <header className="w-full bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 py-2.5 sticky top-0 z-40 shadow-xs transition-colors" dir="rtl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* نشان برند و ابزارهای سریع */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-bold text-[var(--text-primary)]">آزمایشگاه معاملاتی حامد</h1>
                <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-canvas)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                  v4.0
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] hidden sm:block">سامانه شخصی تحلیل و معامله با هوش مصنوعی آفلاین مرورگر WebLLM</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* انتخاب‌گر قالب روز و شب (Theme Toggle) */}
            <ThemeToggle />

            {/* دکمه انتخاب حالت طراحی: ویندوز دسکتاپ یا موبایل */}
            {onChangeViewMode && (
              <div className="flex items-center gap-0.5 bg-[var(--bg-canvas)] p-0.5 rounded-xl border border-[var(--border-subtle)] text-[11px]">
                <button
                  type="button"
                  onClick={() => onChangeViewMode('windows')}
                  className={`px-2.5 py-1.5 min-h-[36px] rounded-lg flex items-center gap-1 transition-colors ${
                    currentViewMode === 'windows'
                      ? 'bg-cyan-500/10 text-cyan-500 font-bold border border-cyan-500/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="نمایش حالت اختصاصی ویندوز (Snapdragon X Plus)"
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ویندوز</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeViewMode('mobile')}
                  className={`px-2.5 py-1.5 min-h-[36px] rounded-lg flex items-center gap-1 transition-colors ${
                    currentViewMode === 'mobile'
                      ? 'bg-amber-500/10 text-amber-500 font-bold border border-amber-500/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="نمایش حالت اختصاصی موبایل (Pixel 9 Pro Fold)"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">موبایل</span>
                </button>
              </div>
            )}

            {/* دکمه باز کردن مرکز مدل هوش مصنوعی */}
            {onOpenAIModal && (
              <button
                type="button"
                onClick={onOpenAIModal}
                className="px-2.5 py-1.5 min-h-[36px] rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-500 border border-cyan-500/30 flex items-center gap-1.5 transition-colors text-[11px]"
                title="مدیریت و دانلود مدل‌های آفلاین مرورگر"
              >
                <Bot className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">مدل:</span>
                <span className="font-bold font-mono text-[10px]">{activeModelName || 'Qwen/S0'}</span>
              </button>
            )}

            {/* نشانگر هوشمند رژیم بازار (Market Regime Badge) */}
            {marketRegime && (
              <div
                className={`px-2.5 py-1.5 min-h-[36px] rounded-xl border flex items-center gap-1.5 transition-all text-[11px] cursor-help ${
                  marketRegime.regime === 'TRENDING_BULLISH'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                    : marketRegime.regime === 'TRENDING_BEARISH'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                    : marketRegime.regime === 'CHOPPY_RANGING'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                    : marketRegime.regime === 'HIGH_VOL_NEWS'
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-500 animate-pulse'
                    : 'bg-sky-500/10 border-sky-500/30 text-sky-500'
                }`}
                title={`${marketRegime.headlineFa}\n${marketRegime.summaryFa}\nسبک‌های پیشنهادی: ${marketRegime.recommendedStyles.join(', ')}`}
              >
                {marketRegime.regime === 'TRENDING_BULLISH' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                {marketRegime.regime === 'TRENDING_BEARISH' && <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                {marketRegime.regime === 'CHOPPY_RANGING' && <Waves className="w-3.5 h-3.5 text-amber-500" />}
                {marketRegime.regime === 'HIGH_VOL_NEWS' && <Flame className="w-3.5 h-3.5 text-purple-500" />}
                {marketRegime.regime === 'COMPRESSION' && <Minimize2 className="w-3.5 h-3.5 text-sky-500" />}
                <span className="font-bold hidden sm:inline">{marketRegime.headlineFa}</span>
                <span className="font-mono text-[10px] opacity-80">({marketRegime.confidence}%)</span>
              </div>
            )}

            {/* دکمه باز کردن هشدارهای هوشمند */}
            {onOpenAlertModal && (
              <button
                type="button"
                onClick={onOpenAlertModal}
                className="p-2 min-h-[36px] min-w-[36px] justify-center rounded-xl bg-[var(--bg-canvas)] hover:bg-cyan-500/10 text-cyan-500 border border-[var(--border-subtle)] flex items-center gap-1.5 transition-colors text-[11px] relative"
                title="دیدبان هشدارهای معاملاتی هوشمند و تنظیمات صدا"
              >
                <Bell className="w-4 h-4" />
                {unreadAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-cyan-500 text-slate-900 text-[9px] font-mono font-black px-1.5 py-0.2 rounded-full shadow-sm">
                    {unreadAlertsCount}
                  </span>
                )}
              </button>
            )}

            {/* دکمه نصب PWA */}
            <PWAInstallButton />

            {/* نشان پایش سلامت سرور */}
            <SystemHealthBadge />
          </div>
        </div>

        {/* بخش انتخاب ۴ محیط اختصاصی پلن نسخه ۴.۰ حامد */}
        <div className="flex flex-wrap items-center gap-1 bg-[var(--bg-canvas)] p-1 rounded-xl border border-[var(--border-subtle)] text-[11px] overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => handleEnvClick('PAPER_REPLAY')}
            className={`px-2.5 py-1.5 min-h-[34px] rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap ${
              currentEnvironment === 'PAPER_REPLAY'
                ? 'bg-amber-500/15 text-amber-500 font-bold border border-amber-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="بک‌تست و بازپخش تاریخی با ساعت مجازی و شبیه‌ساز محلی"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Paper Replay</span>
          </button>

          <button
            type="button"
            onClick={() => handleEnvClick('PAPER_LIVE')}
            className={`px-2.5 py-1.5 min-h-[34px] rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap ${
              currentEnvironment === 'PAPER_LIVE'
                ? 'bg-cyan-500/15 text-cyan-500 font-bold border border-cyan-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="قیمت زنده با شبیه‌ساز محلی (بدون دسترسی به ثبت سفارش بروکر)"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Paper Live</span>
          </button>

          <button
            type="button"
            onClick={() => handleEnvClick('BROKER_DEMO')}
            className={`px-2.5 py-1.5 min-h-[34px] rounded-lg flex items-center gap-1 transition-colors whitespace-nowrap ${
              currentEnvironment === 'BROKER_DEMO'
                ? 'bg-emerald-500/15 text-emerald-500 font-bold border border-emerald-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
            title="حساب دمو cTrader با تایید صریح دستی حامد"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>cTrader Demo</span>
          </button>

          <button
            type="button"
            onClick={() => handleEnvClick('BROKER_LIVE')}
            className="px-2.5 py-1.5 min-h-[34px] rounded-lg flex items-center gap-1 text-[var(--text-muted)] hover:text-rose-500 transition-colors opacity-70 whitespace-nowrap"
            title="حساب واقعی Live (پیش‌فرض مسدود تا تایید مالک)"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Live (مسدود)</span>
          </button>
        </div>

        {/* اطلاعات حساب و وضعیت داده */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between md:justify-end text-xs">
          {/* نشان وضعیت محیط جاری */}
          {currentEnvironment === 'PAPER_LIVE' ? (
            <div className="px-2.5 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-500 text-[10px] font-mono font-bold flex items-center gap-1">
              <Activity className="w-3 h-3 animate-pulse" />
              <span>LIVE + SIMULATED</span>
            </div>
          ) : currentEnvironment === 'PAPER_REPLAY' ? (
            <div className="px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 text-[10px] font-mono font-bold flex items-center gap-1">
              <span>VIRTUAL REPLAY</span>
            </div>
          ) : (
            <div className={`px-2.5 py-1 rounded-full border text-[11px] font-medium flex items-center gap-1.5 ${getBadgeColor()}`}>
              <Activity className="w-3 h-3 animate-pulse" />
              <span>وضعیت:</span>
              <span dir="ltr" className="font-mono">{dataMode}</span>
            </div>
          )}

          {/* هشدار قفل سراسری در صورت وجود وضعیت UNKNOWN */}
          {isBlocked && (
            <div className="px-2.5 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-500 flex items-center gap-1 animate-pulse text-[11px]">
              <AlertTriangle className="w-3 h-3" />
              <span>قفل ایمنی بازتطبیق</span>
            </div>
          )}

          {/* موجودی و اکوئیتی حساب */}
          <div className="flex items-center gap-3 bg-[var(--bg-canvas)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)]">
            <div className="text-right">
              <div className="text-[10px] text-[var(--text-muted)]">
                {currentEnvironment === 'BROKER_DEMO' ? 'حساب دمو:' : 'حساب فرضی:'}{' '}
                <span dir="ltr" className="font-mono">{accountMaskedId}</span>
              </div>
              <div dir="ltr" className="text-xs font-mono font-bold text-[var(--text-primary)]">
                ${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                title="به‌روزرسانی داده‌ها"
                className="p-1 hover:bg-[var(--bg-surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* مودال ایمنی و شفاف‌سازی عدم فعال‌سازی حساب واقعی (BROKER_LIVE Gating) */}
      {showLiveBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" dir="rtl">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] max-w-md w-full rounded-2xl p-5 space-y-4 text-right shadow-2xl">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[var(--text-primary)]">مسیر حساب واقعی (BROKER_LIVE)</h3>
                <span className="text-[10px] text-amber-500 font-mono">STATUS: BLOCKED BY POLICY</span>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              طبق بخش ۲۲ پلن نسخه ۴.۰ حامد، ساختار کد و روت‌های امنیتی حساب واقعی در سورس‌کد پیاده‌سازی شده اما پرچم سروری آن به صورت پیش‌فرض کاملاً غیرفعال (<code className="text-rose-500 bg-rose-500/10 px-1 py-0.5 rounded">LIVE_ACTIVATION_BLOCKER</code>) است.
            </p>

            <div className="p-3 bg-[var(--bg-canvas)] rounded-xl border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] space-y-1.5">
              <div className="font-bold text-[var(--text-primary)]">شروط فعال‌سازی پول واقعی:</div>
              <div>۱. پذیرش صریح و کتبی حامد در سامانه</div>
              <div>۲. گذر موفق از تمام آزمون‌های محافظتی دمو و گیت W4</div>
              <div>۳. عدم وجود هرگونه خطای بازتطبیق یا قطعی شبکه</div>
            </div>

            <button
              type="button"
              onClick={() => setShowLiveBlockedModal(false)}
              className="w-full py-2.5 bg-zinc-800 dark:bg-zinc-700 hover:bg-zinc-700 dark:hover:bg-zinc-600 text-white rounded-xl font-bold text-xs transition-colors"
            >
              متوجه شدم (بازگشت به حساب دمو)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
