'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { WifiOff, AlertTriangle } from 'lucide-react';

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOnlineSnapshot() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getServerOnlineSnapshot() {
  return true;
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [showWarningDetails, setShowWarningDetails] = useState(false);

  if (isOnline) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 rounded-xl bg-rose-950/95 border border-rose-800 text-rose-200 p-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-300"
      dir="rtl"
    >
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 rounded-lg bg-rose-900/60 border border-rose-700/80 text-rose-300 shrink-0 mt-0.5">
          <WifiOff className="w-4 h-4 animate-pulse" />
        </div>
        <div className="flex-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-rose-100 flex items-center gap-1.5">
              قطع اتصال شبکه (آفلاین)
            </span>
            <button
              onClick={() => setShowWarningDetails(!showWarningDetails)}
              className="text-[10px] text-rose-300 hover:text-white underline"
            >
              {showWarningDetails ? 'بستن جزئیات' : 'قوانین ایمنی'}
            </button>
          </div>
          <p className="text-rose-300/90 mt-1 leading-relaxed">
            دسترسی به شبکه قطع شد. داده‌ها از حافظه کش محلی بارگذاری می‌شوند.
          </p>

          {showWarningDetails && (
            <div className="mt-2.5 pt-2 border-t border-rose-800/80 text-[11px] text-rose-200 space-y-1">
              <div className="flex items-center gap-1 text-amber-300 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>اصل عدم اجرای پس‌زمینه در وب:</span>
              </div>
              <p className="text-rose-300/90 leading-tight">
                برنامه تحت وب و PWA در صورت بسته شدن تب مرورگر یا تعلیق پردازش پس‌زمینه توسط سیستم‌عامل اندروید، امکان ارسال سفارش جدید ندارد. برای امنیت سرمایه، کلیه عملیات ارسال به حالت تعلیق امن (Fail-Closed) درمی‌آیند.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
