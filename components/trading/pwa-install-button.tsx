'use client';

import React, { useState } from 'react';
import { Download, Share, X, CheckCircle, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/hooks/use-pwa-install';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // در صورت اجرای برنامه در حالت standalone یا عدم پشتیبانی، دکمه مخفی می‌شود
  if (isInstalled) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 border border-emerald-800/60 rounded-lg text-emerald-400 text-xs">
        <CheckCircle className="w-3.5 h-3.5" />
        <span>اپلیکیشن نصب‌شده (PWA)</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      await install();
    } finally {
      setIsInstalling(false);
    }
  };

  // جریان نصب در کروم / اندروید / ویندوز
  if (isInstallable) {
    return (
      <button
        onClick={handleInstallClick}
        disabled={isInstalling}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-sm transition active:scale-95 border border-emerald-500/40"
        title="نصب نسخه وب‌اپلیکیشن پیش‌رونده برای دسترسی سریع‌تر در ویندوز و اندروید"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{isInstalling ? 'در حال نصب...' : 'نصب اپلیکیشن (PWA)'}</span>
      </button>
    );
  }

  // جریان راهنمای نصب در آیفون / آیپد (iOS Safari)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-200 text-xs font-medium transition"
        >
          <Smartphone className="w-3.5 h-3.5 text-zinc-400" />
          <span>نصب در iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" dir="rtl">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-right">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  راهنمای نصب در iOS
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-zinc-300">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-800/80 border border-zinc-700/60">
                  <Share className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-zinc-100">۱. لمس دکمه Share:</span>
                    <p className="text-zinc-400 mt-0.5">در نوار پایین مرورگر سافاری، دکمه اشتراک‌گذاری (Share) را لمس کنید.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-800/80 border border-zinc-700/60">
                  <Download className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-zinc-100">۲. افزودن به صفحه اصلی:</span>
                    <p className="text-zinc-400 mt-0.5">به پایین اسکرول کرده و گزینه «Add to Home Screen» را انتخاب نمایید.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // در سایر حالت‌ها که مرورگر ایونت را منتشر نکرده است
  return null;
};
