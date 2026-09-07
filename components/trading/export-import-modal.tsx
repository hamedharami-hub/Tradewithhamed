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
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // خروجی گرفتن از وضعیت به صورت فایل JSON
  const handleExport = () => {
    const jsonStr = PersistenceStorage.exportState(currentState);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hamed-trading-lab-backup-v1.0-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setImportStatus({
      success: true,
      message: 'فایل پشتیبان JSON با موفقیت دانلود شد.',
    });
  };

  // بارگذاری و اعتبارسنجی فایل JSON
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      const validation = PersistenceStorage.validateAndImport(content);

      if (validation.valid && validation.data) {
        onStateRestored(validation.data.state);
        PersistenceStorage.saveToLocal(validation.data.state);
        setImportStatus({
          success: true,
          message: `وضعیت با موفقیت بازیابی شد: نماد ${validation.data.state.symbol}، گام ریپلی ${validation.data.state.currentStepIndex}`,
        });
      } else {
        setImportStatus({
          success: false,
          message: validation.error || 'اعتبارسنجی فایل پشتیبان با شکست مواجه شد.',
        });
      }
    };
    reader.readAsText(file);
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
              پشتیبان‌گیری و بازیابی داده‌ها (Export / Import JSON v1.0)
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
          شما می‌توانید وضعیت جاری تحلیل، گام ریپلی، و تنظیمات شبیه‌ساز را به صورت فایل JSON استاندارد
          استخراج کرده و در جلسات آینده یا دستگاه دیگر بدون اتلاف داده بازیابی کنید.
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
              دانلود وضعیت فعلی شبیه‌ساز با اعتبارسنجی اسکیما v1.0
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
