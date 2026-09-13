'use client';

import React, { useState, useRef } from 'react';
import { Download, Upload, Trash2, CheckCircle2, AlertTriangle, X, Database } from 'lucide-react';
import { PersistenceStorage, AppExportPayloadV1 } from '@/lib/persistence/storage';
import { SymbolId } from '@/lib/contracts/market';

interface ExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: {
    symbol: SymbolId;
    currentStepIndex: number;
    accountBalance: number;
    accountEquity: number;
  };
  onStateRestored: (state: AppExportPayloadV1['state']) => void;
}

export function ExportImportModal({
  isOpen,
  onClose,
  currentState,
  onStateRestored,
}: ExportImportModalProps) {
  const [importStatus, setImportStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    state: AppExportPayloadV1['state'];
    filename: string;
    migratedFromV1: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // خروجی گرفتن از وضعیت به صورت فایل JSON
  const handleExport = () => {
    const jsonStr = PersistenceStorage.exportState(currentState);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hamed-trading-lab-backup-v2.0-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setImportStatus({
      success: true,
      message: 'دانلود فایل پشتیبان v2.0 به مرورگر سپرده شد. این فایل فقط وضعیت ریپلی محلی را نگه می‌دارد.',
    });
  };

  // بارگذاری و اعتبارسنجی فایل JSON
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setPendingRestore(null);
      setImportStatus({ success: false, message: 'فایل پشتیبان بزرگ‌تر از حد مجاز ۱ مگابایت است.' });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result;
      if (typeof content !== 'string') {
        setPendingRestore(null);
        setImportStatus({ success: false, message: 'محتوای فایل پشتیبان قابل خواندن نیست.' });
        return;
      }
      const validation = PersistenceStorage.validateAndImport(content);

      if (validation.valid && validation.data) {
        setPendingRestore({ state: validation.data.state, filename: file.name, migratedFromV1: Boolean(validation.migratedFromV1) });
        setImportStatus({
          success: true,
          message: 'فایل معتبر است؛ پیش‌نمایش را بررسی و سپس بازیابی را تأیید کنید.',
        });
      } else {
        setPendingRestore(null);
        setImportStatus({
          success: false,
          message: validation.error || 'اعتبارسنجی فایل پشتیبان با شکست مواجه شد.',
        });
      }
    };
    reader.onerror = () => setImportStatus({ success: false, message: 'خواندن فایل پشتیبان ناموفق بود.' });
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyRestore = () => {
    if (!pendingRestore) return;
    onStateRestored(pendingRestore.state);
    const wasSaved = PersistenceStorage.saveToLocal(pendingRestore.state);
    setImportStatus({
      success: true,
      message: `وضعیت ریپلی بازیابی شد: نماد ${pendingRestore.state.symbol}، گام ${pendingRestore.state.currentStepIndex}${pendingRestore.migratedFromV1 ? ' (فایل v1 سازگار شد)' : ''}${wasSaved ? '؛ نسخهٔ محلی هم به‌روز شد.' : '؛ ذخیرهٔ محلی مرورگر در دسترس نبود.'}`,
    });
    setPendingRestore(null);
  };

  // پاک‌سازی وضعیت ذخیره‌شده محلی
  const handleClear = () => {
    PersistenceStorage.clearLocal();
    setImportStatus({
      success: true,
      message: 'حافظه محلی با موفقیت پاک‌سازی شد.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-right font-sans">
        {/* سربرگ */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-zinc-100 text-sm">
              پشتیبان‌گیری ریپلی محلی (Export / Import JSON v2.0)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          این فایل نماد و گام ریپلی را بازیابی می‌کند. نمای موجودی حساب آزمایشی فقط برای مرجع در فایل نگه‌داری می‌شود و به حساب بروکر بازگردانی نمی‌شود. سفارش‌های بروکر، توکن‌های ورود و وزن مدل‌های AI عمداً در آن قرار نمی‌گیرند.
        </p>

        {/* بازخورد عملیات */}
        {importStatus && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              importStatus.success
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
            }`}
          >
            {importStatus.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{importStatus.message}</span>
          </div>
        )}

        {pendingRestore && (
          <div className="rounded-xl border border-cyan-800/80 bg-cyan-950/30 p-3 space-y-2 text-xs text-cyan-100">
            <div className="flex items-center justify-between gap-3">
              <strong>پیش‌نمایش بازیابی</strong>
              <span className="text-[10px] text-cyan-300 truncate" title={pendingRestore.filename}>{pendingRestore.filename}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <span>نماد: <strong dir="ltr">{pendingRestore.state.symbol}</strong></span>
              <span>گام ریپلی: <strong>{pendingRestore.state.currentStepIndex}</strong></span>
              <span>موجودی مرجع: <strong>${pendingRestore.state.accountBalance.toLocaleString('en-US')}</strong></span>
              <span>اکوئیتی مرجع: <strong>${pendingRestore.state.accountEquity.toLocaleString('en-US')}</strong></span>
            </div>
            <button type="button" onClick={handleApplyRestore} className="w-full rounded-lg bg-cyan-600 px-3 py-2 font-bold text-white hover:bg-cyan-500">
              تأیید و بازیابی ریپلی
            </button>
          </div>
        )}

        {/* دکمه‌های عملیاتی */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* دکمه استخراج */}
          <button
            onClick={handleExport}
            className="p-4 bg-zinc-950 border border-zinc-800 hover:border-cyan-600 rounded-xl text-right transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-zinc-200 text-xs group-hover:text-cyan-400">
                استخراج فایل JSON
              </span>
              <Download className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-[11px] text-zinc-500">
              دانلود وضعیت ریپلی با اعتبارسنجی اسکیما v2.0
            </p>
          </button>

          {/* دکمه واردسازی */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 bg-zinc-950 border border-zinc-800 hover:border-emerald-600 rounded-xl text-right transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-zinc-200 text-xs group-hover:text-emerald-400">
                بارگذاری فایل JSON
              </span>
              <Upload className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-[11px] text-zinc-500">
              انتخاب فایل JSON پشتیبان و بازگردانی گام تحلیل
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
          </button>
        </div>

        {/* پاک‌سازی کش محلی */}
        <div className="pt-2 border-t border-zinc-850 flex items-center justify-between text-xs">
          <button
            onClick={handleClear}
            className="text-zinc-500 hover:text-rose-400 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>پاک‌سازی وضعیت ذخیره‌شده محلی</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
