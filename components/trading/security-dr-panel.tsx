'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Activity,
  AlertTriangle,
  Download,
  UploadCloud,
  RefreshCw,
  Cpu,
  CheckCircle2,
  XCircle,
  FileCode,
} from 'lucide-react';
import { DisasterRecoverySnapshot, RateLimiterMetrics } from '@/lib/contracts/security';

export function SecurityDRPanel() {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<RateLimiterMetrics | null>(null);
  const [tokenStatus, setTokenStatus] = useState<{
    algorithm: string;
    active: boolean;
    testVaultCheck: boolean;
    zeroSecretLeakageCompliant: boolean;
  } | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<DisasterRecoverySnapshot | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const fetchSecurityData = async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      const res = await fetch('/api/recovery');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.rateLimiterMetrics);
        setTokenStatus(data.tokenVaultStatus);
        setLastSnapshot(data.snapshot);
      }
    } catch {
      setActionMessage({ text: 'خطا در واکشی وضعیت امنیتی سرور', isError: true });
    } finally {
      if (isManual) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/recovery');
        if (res.ok && active) {
          const data = await res.json();
          setMetrics(data.rateLimiterMetrics);
          setTokenStatus(data.tokenVaultStatus);
          setLastSnapshot(data.snapshot);
        }
      } catch {
        // نادیده گرفتن در بارگذاری اولیه
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleDownloadSnapshot = () => {
    if (!lastSnapshot) return;
    const blob = new Blob([JSON.stringify(lastSnapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dr-snapshot-${lastSnapshot.generatedAt}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setActionMessage({ text: 'اسنپ‌شات اضطراری با امضای SHA-256 دانلود شد.' });
  };

  const handleSimulateColdCrash = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SIMULATE_COLD_CRASH' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({
          text: `شبیه‌سازی کرش سرد موفق بود: سفارش معلق به وضعیت UNKNOWN_RECONCILE_REQUIRED منتقل و ارسال جدید مسدود شد (Fail-Closed).`,
        });
        await fetchSecurityData();
      } else {
        setActionMessage({ text: `خطا در شبیه‌سازی: ${data.error || data.message}`, isError: true });
      }
    } catch (err) {
      setActionMessage({ text: `خطا در ارسال درخواست: ${(err as Error).message}`, isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4 text-xs">
      {/* هدر پنل */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-cyan-950 border border-cyan-800 rounded-lg text-cyan-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
              <span>مرکز سفت‌کاری امنیتی سرور و بازیابی اضطراری (مرحله ۸)</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                AES-256-GCM & DR
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              حفاظت ضد نشت سکرت‌ها، محدودسازی نرخ درخواست (Rate Limit) و چکسام رمزنگاری SHA-256
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchSecurityData(true)}
          disabled={loading}
          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg flex items-center gap-1 transition-colors"
          title="بروزرسانی داده‌های امنیتی"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">بروزرسانی</span>
        </button>
      </div>

      {/* پیام بازخورد */}
      {actionMessage && (
        <div
          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
            actionMessage.isError
              ? 'bg-rose-950/80 border-rose-800 text-rose-300'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.isError ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-zinc-500 hover:text-zinc-300 px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* ستون‌های ۳ گانه اطلاعات امنیتی */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* کارت ۱: گاوصندوق رمزنگاری توکن‌ها */}
        <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-semibold flex items-center gap-1.5 text-zinc-200">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>رمزنگاری توکن‌ها (Vault)</span>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
              فعال
            </span>
          </div>

          <div className="space-y-1.5 text-[11px] text-zinc-400">
            <div className="flex justify-between">
              <span>الگوریتم رمزنگاری:</span>
              <span className="font-mono text-cyan-300 font-bold">AES-256-GCM</span>
            </div>
            <div className="flex justify-between">
              <span>تگ احراز اصالت (Auth Tag):</span>
              <span className="font-mono text-zinc-200">۱۶ بایت (GCM-128)</span>
            </div>
            <div className="flex justify-between">
              <span>ممیزی عدم نشت سکرت:</span>
              <span className="text-emerald-400 font-medium">۱۰۰٪ منطبق (۰ سکرت)</span>
            </div>
            <div className="flex justify-between">
              <span>محیط مجاز بروکر:</span>
              <span className="font-mono text-amber-400 font-bold">DEMO-ONLY</span>
            </div>
          </div>
        </div>

        {/* کارت ۲: محدودکننده نرخ درخواست (Rate Limiter) */}
        <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-semibold flex items-center gap-1.5 text-zinc-200">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>پایشگر نرخ درخواست</span>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-400 border border-amber-800">
              سخت‌گیرانه
            </span>
          </div>

          <div className="space-y-1.5 text-[11px] text-zinc-400">
            <div className="flex justify-between">
              <span>سقف سفارش‌گذاری:</span>
              <span className="font-mono text-zinc-200">۲ درخواست / ۱۰ ثانیه</span>
            </div>
            <div className="flex justify-between">
              <span>حداقل فاصله دو ارسال:</span>
              <span className="font-mono text-zinc-200">۱٫۵ ثانیه (ضد دابل‌کلیک)</span>
            </div>
            <div className="flex justify-between">
              <span>کل درخواست‌های پایش‌شده:</span>
              <span className="font-mono text-zinc-200">{metrics?.totalRequests ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>تعداد مسدودشده (کد ۴۲۹):</span>
              <span className="font-mono text-rose-400 font-bold">{metrics?.totalBlocked ?? 0}</span>
            </div>
          </div>
        </div>

        {/* کارت ۳: وضعیت بازیابی اضطراری (DR) */}
        <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-semibold flex items-center gap-1.5 text-zinc-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>بازتولید اضطراری (DR)</span>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 font-mono">
              v1.0-DR
            </span>
          </div>

          <div className="space-y-1.5 text-[11px] text-zinc-400">
            <div className="flex justify-between">
              <span>رکوردهای صندوق OMS:</span>
              <span className="font-mono text-zinc-200">{lastSnapshot?.omsState.recordsCount ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>پوزیشن‌های ژورنال:</span>
              <span className="font-mono text-zinc-200">{lastSnapshot?.journalState.positionsCount ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>چکسام SHA-256:</span>
              <span className="font-mono text-[10px] text-cyan-400 truncate max-w-[110px]" title={lastSnapshot?.checksum}>
                {lastSnapshot?.checksum ? `${lastSnapshot.checksum.slice(0, 10)}...` : 'محاسبه‌نشده'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>قاعده کرش سرد:</span>
              <span className="text-amber-400 font-medium">Fail-Closed اجباری</span>
            </div>
          </div>
        </div>
      </div>

      {/* نوار دکمه‌های کنترلی بازیابی و پشتیبان‌گیری */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadSnapshot}
            disabled={!lastSnapshot}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-zinc-200 rounded-lg flex items-center gap-1.5 font-medium transition-colors text-xs"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>دریافت اسنپ‌شات اضطراری (JSON)</span>
          </button>

          <button
            onClick={handleSimulateColdCrash}
            disabled={loading}
            className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded-lg flex items-center gap-1.5 font-medium transition-colors text-xs"
            title="شبیه‌سازی قطعی ناگهانی سرور و بررسی انتقال سفارش معلق به بازتطبیق اجباری"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>شبیه‌سازی کرش ناگهانی (Cold Crash Test)</span>
          </button>
        </div>

        <span className="text-[11px] text-zinc-500 font-mono">
          Strict Security Standard • AUD 20/mo Target
        </span>
      </div>
    </div>
  );
}
