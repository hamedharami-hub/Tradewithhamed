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
  Globe,
  Radio,
  FileSpreadsheet,
} from 'lucide-react';
import { PWAInstallButton } from './pwa-install-button';
import { SystemHealthBadge } from './system-health-badge';

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
}) => {
  const [showLiveBlockedModal, setShowLiveBlockedModal] = useState(false);

  const getBadgeColor = () => {
    switch (dataMode) {
      case 'LIVE':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 'REPLAYED':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      case 'SIMULATED':
        return 'bg-cyan-950 text-cyan-300 border-cyan-800';
      case 'STALE':
      case 'UNKNOWN':
        return 'bg-rose-950 text-rose-300 border-rose-800';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
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
    <header className="w-full bg-[#11141b] border-b border-[#222836] px-4 py-2.5 sticky top-0 z-40 shadow-sm" dir="rtl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* نشان برند و وضعیت سیستم */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-bold text-zinc-100">آزمایشگاه معاملاتی حامد</h1>
                <span className="text-[10px] font-mono text-zinc-400 bg-[#1a202d] px-1.5 py-0.5 rounded border border-[#263042]">
                  v4.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">سامانه شخصی تحلیل و معامله با هوش مصنوعی داخل مرورگر WebLLM</p>
            </div>
          </div>

          {/* دکمه انتخاب حالت طراحی: ویندوز دسکتاپ یا موبایل */}
          {onChangeViewMode && (
            <div className="flex items-center gap-0.5 bg-[#171b25] p-0.5 rounded-xl border border-[#262f3f] text-[11px]">
              <button
                type="button"
                onClick={() => onChangeViewMode('windows')}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${
                  currentViewMode === 'windows'
                    ? 'bg-[#152535] text-cyan-300 font-bold border border-cyan-800'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="نمایش حالت اختصاصی ویندوز (Snapdragon X Plus)"
              >
                <Laptop className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ویندوز</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeViewMode('mobile')}
                className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${
                  currentViewMode === 'mobile'
                    ? 'bg-[#2a2016] text-amber-300 font-bold border border-amber-800'
                    : 'text-zinc-400 hover:text-zinc-200'
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
              className="px-2.5 py-1 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800 flex items-center gap-1.5 transition-colors text-[11px]"
              title="مدیریت و دانلود مدل‌های آفلاین مرورگر"
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مرکز مدل:</span>
              <span className="font-bold font-mono text-[10px]">{activeModelName || 'Qwen/S0'}</span>
            </button>
          )}

          {/* دکمه نصب PWA */}
          <PWAInstallButton />

          {/* نشان پایش سلامت سرور */}
          <SystemHealthBadge />
        </div>

        {/* بخش انتخاب ۴ محیط اختصاصی پلن نسخه ۴.۰ حامد */}
        <div className="flex items-center gap-1.5 bg-[#161a24] p-1 rounded-xl border border-[#262e3e] text-[11px]">
          <button
            type="button"
            onClick={() => handleEnvClick('PAPER_REPLAY')}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${
              currentEnvironment === 'PAPER_REPLAY'
                ? 'bg-amber-950 text-amber-300 font-bold border border-amber-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="بک‌تست و بازپخش تاریخی با ساعت مجازی و شبیه‌ساز محلی"
          >
            <FileSpreadsheet className="w-3 h-3" />
            <span>Paper Replay</span>
          </button>

          <button
            type="button"
            onClick={() => handleEnvClick('PAPER_LIVE')}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${
              currentEnvironment === 'PAPER_LIVE'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="قیمت زنده با شبیه‌ساز محلی (بدون دسترسی به ثبت سفارش بروکر)"
          >
            <Radio className="w-3 h-3" />
            <span>Paper Live</span>
          </button>

          <button
            type="button"
            onClick={() => handleEnvClick('BROKER_DEMO')}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${
              currentEnvironment === 'BROKER_DEMO'
                ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="حساب دمو cTrader با تایید صریح دستی حامد"
          >
            <ShieldCheck className="w-3 h-3" />
            <span>cTrader Demo</span>
          </button>

          <button
            type="button"
            onClick={() => handleEnvClick('BROKER_LIVE')}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 text-zinc-500 hover:text-rose-400 transition-colors opacity-80`}
            title="حساب واقعی Live (پیش‌فرض مسدود تا تایید مالک)"
          >
            <Lock className="w-3 h-3" />
            <span>Live (مسدود)</span>
          </button>
        </div>

        {/* اطلاعات حساب و وضعیت داده */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end text-xs">
          {/* نشان وضعیت محیط جاری */}
          {currentEnvironment === 'PAPER_LIVE' ? (
            <div className="px-2.5 py-1 rounded-full border border-cyan-700 bg-cyan-950 text-cyan-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <Activity className="w-3 h-3 animate-pulse" />
              <span>LIVE DATA + SIMULATED FILLS</span>
            </div>
          ) : currentEnvironment === 'PAPER_REPLAY' ? (
            <div className="px-2.5 py-1 rounded-full border border-amber-700 bg-amber-950 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <span>VIRTUAL CLOCK / REPLAY</span>
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
            <div className="px-2.5 py-1 rounded-full border border-rose-800/80 bg-rose-950/80 text-rose-300 flex items-center gap-1 animate-pulse text-[11px]">
              <AlertTriangle className="w-3 h-3" />
              <span>قفل ایمنی بازتطبیق</span>
            </div>
          )}

          {/* موجودی و اکوئیتی حساب */}
          <div className="flex items-center gap-3 bg-[#161a24] px-3 py-1.5 rounded-xl border border-[#272f3e]">
            <div className="text-right">
              <div className="text-[10px] text-zinc-400">
                {currentEnvironment === 'BROKER_DEMO' ? 'حساب دمو:' : 'حساب فرضی:'}{' '}
                <span dir="ltr" className="font-mono">{accountMaskedId}</span>
              </div>
              <div dir="ltr" className="text-xs font-mono font-bold text-zinc-100">
                ${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                title="به‌روزرسانی داده‌ها"
                className="p-1 hover:bg-[#232a39] text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* مودال ایمنی و شفاف‌سازی عدم فعال‌سازی حساب واقعی (BROKER_LIVE Gating) */}
      {showLiveBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-[#141822] border border-[#2a3447] max-w-md w-full rounded-2xl p-5 space-y-4 text-right">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 bg-amber-950/80 border border-amber-800 rounded-xl">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-100">مسیر حساب واقعی (BROKER_LIVE)</h3>
                <span className="text-[10px] text-amber-300 font-mono">STATUS: BLOCKED BY POLICY</span>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              طبق بخش ۲۲ پلن نسخه ۴.۰ حامد حرمی‌پور، ساختار کد و روت‌های امنیتی حساب واقعی در سورس‌کد پیاده‌سازی شده اما پرچم سروری آن به صورت پیش‌فرض کاملاً غیرفعال (<code className="text-rose-300">LIVE_ACTIVATION_BLOCKER</code>) است.
            </p>

            <div className="p-3 bg-[#10131c] rounded-xl border border-[#222938] text-[11px] text-zinc-400 space-y-1.5">
              <div className="font-bold text-zinc-200">شروط فعال‌سازی پول واقعی:</div>
              <div>۱. پذیرش صریح و کتبی حامد در سامانه</div>
              <div>۲. گذر موفق از تمام آزمون‌های محافظتی دمو و گیت W4</div>
              <div>۳. عدم وجود هرگونه خطای بازتطبیق یا قطعی شبکه</div>
            </div>

            <button
              type="button"
              onClick={() => setShowLiveBlockedModal(false)}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-bold text-xs transition-colors"
            >
              متوجه شدم (بازگشت به حساب دمو)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
