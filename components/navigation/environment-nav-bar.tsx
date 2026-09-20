'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  BookOpen,
  FlaskConical,
  Globe,
  Sliders,
  Sparkles,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Server,
} from 'lucide-react';
import { AppEnvironment, ENVIRONMENTS_CONFIG } from '@/lib/contracts/environment';
import { DataProvenance } from '@/lib/contracts/provenance';

interface EnvironmentNavBarProps {
  currentEnv: AppEnvironment;
  provenance?: DataProvenance;
  viewMode?: 'SIMPLE' | 'ADVANCED';
  onToggleViewMode?: (mode: 'SIMPLE' | 'ADVANCED') => void;
}

export const EnvironmentNavBar: React.FC<EnvironmentNavBarProps> = ({
  currentEnv,
  provenance,
  viewMode = 'SIMPLE',
  onToggleViewMode,
}) => {
  const getButtonEffectText = () => {
    switch (currentEnv) {
      case 'PRACTICE':
        return 'دکمه معامله: ثبت در شبیه‌ساز محلی (بدون ارسال به هیچ بروکری)';
      case 'RESEARCH':
        return 'دکمه معامله: اجرای آزمایشی روی گذشته (بدون ارسال سفارش)';
      case 'DEMO':
        return 'دکمه معامله: ارسال واقعی سفارش به حساب cTrader Demo';
      default:
        return '';
    }
  };

  const getAccountTypeText = () => {
    switch (currentEnv) {
      case 'PRACTICE':
        return 'حساب مجازی مرورگر (رم)';
      case 'RESEARCH':
        return 'موتور شبیه‌سازی تحلیلی';
      case 'DEMO':
        return 'حساب دموی تأییدشده بروکر';
      default:
        return '';
    }
  };

  return (
    <header className="w-full bg-[#0d111a] border-b border-[#1c2230] select-none text-xs font-sans" dir="rtl">
      {/* ۱. ردیف اول: لوگو، انتخاب محیط سه‌گانه و سوئیچ حالت ساده/پیشرفته */}
      <div className="max-w-[1920px] mx-auto px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-[#161c28]">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 text-zinc-100 hover:text-cyan-400 transition-colors">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-bold text-xs sm:text-sm">Tradewithhamed</span>
          </Link>

          <span className="text-zinc-600">/</span>

          {/* تب‌های سه محیط با برچسب‌های فارسی ساده */}
          <div className="flex items-center gap-1 bg-[#121724] p-1 rounded-xl border border-[#202738]">
            <Link
              href="/practice"
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                currentEnv === 'PRACTICE'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>۱. تمرین (آفلاین)</span>
            </Link>

            <Link
              href="/research"
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                currentEnv === 'RESEARCH'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>۲. بررسی استراتژی</span>
            </Link>

            <Link
              href="/demo"
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                currentEnv === 'DEMO'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>۳. دموی بروکر</span>
            </Link>
          </div>
        </div>

        {/* سوئیچ حالت ساده / پیشرفته */}
        {onToggleViewMode && (
          <div className="flex items-center gap-1.5 bg-[#141926] p-1 rounded-xl border border-[#232c40]">
            <span className="text-[11px] text-zinc-400 px-1">نمایش:</span>
            <button
              type="button"
              onClick={() => onToggleViewMode('SIMPLE')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                viewMode === 'SIMPLE'
                  ? 'bg-cyan-500 text-black shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              ساده (پیش‌فرض)
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode('ADVANCED')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                viewMode === 'ADVANCED'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3 h-3" />
              <span>پیشرفته</span>
            </button>
          </div>
        )}
      </div>

      {/* ۲. ردیف دوم: کارت شناسنامه ۵‌گانه محیط (همیشه مرئی و شفاف) */}
      <div className="max-w-[1920px] mx-auto px-3 sm:px-5 py-1.5 bg-[#0a0d14]/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300 font-mono">
        <div className="flex flex-wrap items-center gap-3">
          {/* ۱. نام محیط */}
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-zinc-500 font-sans">محیط فعلی:</span>
            <span className={`px-2 py-0.5 rounded font-sans ${
              currentEnv === 'PRACTICE'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : currentEnv === 'RESEARCH'
                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
            }`}>
              {ENVIRONMENTS_CONFIG[currentEnv].titleFa}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* ۲. منبع داده */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 font-sans">منبع داده:</span>
            <span className="text-cyan-300 font-sans">
              {provenance?.originLabelFa || 'نمونه تستی'}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* ۳. نوع حساب */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 font-sans">نوع حساب:</span>
            <span className="text-zinc-200 font-sans font-bold">
              {getAccountTypeText()}
            </span>
          </div>

          <span className="text-zinc-700">|</span>

          {/* ۴. وضعیت تازگی داده (با آیکون و متن صریح) */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 font-sans">تازگی داده:</span>
            <div className={`flex items-center gap-1 px-2 py-0.2 rounded border font-sans font-bold text-[10px] ${
              provenance?.freshnessStatus === 'FRESH'
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                : provenance?.freshnessStatus === 'STALE'
                ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                : 'bg-rose-950/40 text-rose-300 border-rose-500/30'
            }`}>
              {provenance?.freshnessStatus === 'FRESH' ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>داده معتبر و تازه</span>
                </>
              ) : provenance?.freshnessStatus === 'STALE' ? (
                <>
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>داده قدیمی (Stale)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>قطع اتصال فید</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ۵. اثر صریح دکمه معامله */}
        <div className="flex items-center gap-1.5 text-zinc-400 font-sans text-[11px] bg-[#111622] px-2.5 py-0.5 rounded-lg border border-[#1f2738]">
          <span className="text-amber-400">💡</span>
          <span>{getButtonEffectText()}</span>
        </div>
      </div>
    </header>
  );
};
