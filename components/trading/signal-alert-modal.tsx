// components/trading/signal-alert-modal.tsx
// مرکز مدیریت و اعلان‌های هوشمند چندتایم‌فریمه
// ۱۰۰٪ آفلاین با تست صدای سینت‌سایزر Web Audio API و پایش حدنصاب شورا و مونت‌کارلو

'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  Volume2,
  AlertTriangle,
  Trash2,
  Play,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { SignalAlert, AlertDispatcherConfig } from '@/lib/contracts/alerts';
import { SignalAlertDispatcher } from '@/lib/core/signal-alert-dispatcher';

interface SignalAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCandidatePrice?: (entryPrice: number) => void;
}

export const SignalAlertModal: React.FC<SignalAlertModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);
  const [config, setConfig] = useState<AlertDispatcherConfig>(SignalAlertDispatcher.getConfig());
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'SETTINGS'>('ALERTS');

  useEffect(() => {
    if (!isOpen) return;
    setAlerts(SignalAlertDispatcher.getAlerts());
    setConfig(SignalAlertDispatcher.getConfig());

    // سابسکرایب به رویدادهای زنده
    const unsubscribe = SignalAlertDispatcher.subscribe(() => {
      setAlerts(SignalAlertDispatcher.getAlerts());
    });

    return () => unsubscribe();
  }, [isOpen]);

  const handleUpdateConfig = (newVal: Partial<AlertDispatcherConfig>) => {
    const updated = SignalAlertDispatcher.updateConfig(newVal);
    setConfig(updated);
  };

  const handleMarkAllAsRead = () => {
    SignalAlertDispatcher.markAllAsRead();
    setAlerts(SignalAlertDispatcher.getAlerts());
  };

  const handleClearAlerts = () => {
    SignalAlertDispatcher.clearAlerts();
    setAlerts([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto" dir="rtl">
      <div className="bg-[#10131b] border border-[#222938] rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* سربرگ مودال */}
        <div className="p-4 border-b border-[#1f2636] flex items-center justify-between bg-[#141824]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>دیدبان و مرکز اعلانات هوشمند چندتایم‌فریمه</span>
                {alerts.filter(a => !a.isRead).length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-900 text-cyan-300 font-bold border border-cyan-700">
                    {alerts.filter(a => !a.isRead).length} جدید
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                پایش لحظه‌ای همگرایی سطوح کلان، نمره کواروم شورا و احتمال مونت‌کارلو
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* نوار انتخاب تب‌ها و اکشن‌های سریع */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#0c0f16] border-b border-[#1c2230] text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('ALERTS')}
              className={`px-3 py-1 rounded-xl font-bold transition-colors ${
                activeTab === 'ALERTS'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              هشدارهای اخیر ({alerts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('SETTINGS')}
              className={`px-3 py-1 rounded-xl font-bold transition-colors ${
                activeTab === 'SETTINGS'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              تنظیمات فیلتر و صدا
            </button>
          </div>

          {activeTab === 'ALERTS' && alerts.length > 0 && (
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                خوانده‌شدن همه
              </button>
              <span className="text-zinc-600">|</span>
              <button
                type="button"
                onClick={handleClearAlerts}
                className="text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>پاکسازی</span>
              </button>
            </div>
          )}
        </div>

        {/* بدنه محتوا */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
          {activeTab === 'ALERTS' && (
            <div className="space-y-2.5">
              {alerts.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-zinc-500">
                  <Bell className="w-10 h-10 mx-auto stroke-1 opacity-40" />
                  <p className="text-xs">هنوز هشداری در این جلسه ثبت نشده است.</p>
                  <p className="text-[11px] text-zinc-600">
                    با جلو بردن ریپلی کندل‌ها، ستاپ‌های تایید شده توسط شورا به صورت خودکار ثبت خواهند شد.
                  </p>
                </div>
              ) : (
                alerts.map(a => (
                  <div
                    key={a.id}
                    className={`p-3 rounded-2xl border transition-all space-y-2 ${
                      !a.isRead
                        ? 'bg-[#151c28] border-cyan-700/60 shadow-md'
                        : 'bg-[#0d1017] border-[#1d2331] opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {a.direction === 'BUY' ? (
                          <span className="p-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800">
                            <ArrowUpRight className="w-4 h-4" />
                          </span>
                        ) : a.direction === 'SELL' ? (
                          <span className="p-1 rounded-lg bg-rose-950 text-rose-400 border border-rose-800">
                            <ArrowDownRight className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="p-1 rounded-lg bg-amber-950 text-amber-400 border border-amber-800">
                            <AlertTriangle className="w-4 h-4" />
                          </span>
                        )}
                        <span className="font-bold text-zinc-100 text-xs">{a.titleFa}</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {a.symbol}
                        </span>
                      </div>

                      <span className="text-[10px] text-zinc-500 font-mono" dir="ltr">
                        {new Date(a.timestamp).toLocaleTimeString('fa-IR')}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-300 leading-relaxed pr-6">
                      {a.messageFa}
                    </p>

                    {/* مقادیر قیمت ستاپ */}
                    {a.entryPrice && (
                      <div className="flex items-center gap-3 bg-[#0a0d13] p-2 rounded-xl text-[10px] font-mono text-zinc-300 pr-6">
                        <span>ورود: <strong className="text-zinc-100">{a.entryPrice}</strong></span>
                        <span>حد ضرر: <strong className="text-rose-400">{a.stopLossPrice}</strong></span>
                        <span>حد سود: <strong className="text-emerald-400">{a.takeProfitPrice}</strong></span>
                        {a.alphaConsensusScore && (
                          <span className="text-cyan-400">شورا: <strong>{a.alphaConsensusScore}٪</strong></span>
                        )}
                        {a.monteCarloTpProbability && (
                          <span className="text-purple-400">مونت‌کارلو: <strong>{a.monteCarloTpProbability}٪</strong></span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'SETTINGS' && (
            <div className="space-y-4 p-1">
              {/* تنظیمات صدا و وب‌پوش */}
              <div className="p-3.5 bg-[#0e121a] rounded-2xl border border-[#1e2535] space-y-3">
                <span className="font-bold text-zinc-200 text-xs">کانال‌های اعلام هشدار (سنتز صوتی و اعلان سیستم)</span>
                
                <div className="space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer p-2 rounded-xl bg-[#141822]">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                      <span className="text-zinc-200 text-xs">پخش صدای اختصاصی Web Audio API (بدون اینترنت)</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.enableAudio}
                      onChange={e => handleUpdateConfig({ enableAudio: e.target.checked })}
                      className="accent-cyan-500 w-4 h-4"
                    />
                  </label>

                  {/* دکمه‌های تست صدا */}
                  <div className="flex items-center gap-2 pr-2">
                    <button
                      type="button"
                      onClick={() => SignalAlertDispatcher.playAlertSound('SUCCESS', 'BUY')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-900 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>تست صدای خرید (BUY)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => SignalAlertDispatcher.playAlertSound('SUCCESS', 'SELL')}
                      className="px-2.5 py-1 rounded-lg bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold flex items-center gap-1 hover:bg-rose-900 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>تست صدای فروش (SELL)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => SignalAlertDispatcher.playAlertSound('CRITICAL')}
                      className="px-2.5 py-1 rounded-lg bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-bold flex items-center gap-1 hover:bg-purple-900 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>تست صدای اخطار فیوز</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* آستانه‌های فیلتر هوشمند */}
              <div className="p-3.5 bg-[#0e121a] rounded-2xl border border-[#1e2535] space-y-3">
                <span className="font-bold text-zinc-200 text-xs">فیلترهای دقت و حدنصاب صدور هشدار</span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 p-2 bg-[#141822] rounded-xl">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300">حداقل نمره شورای هوش مصنوعی:</span>
                      <span className="font-mono text-cyan-400 font-bold">{config.minAlphaConsensusScore}٪</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="90"
                      step="5"
                      value={config.minAlphaConsensusScore}
                      onChange={e => handleUpdateConfig({ minAlphaConsensusScore: Number(e.target.value) })}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1 p-2 bg-[#141822] rounded-xl">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300">حداقل احتمال تارگت مونت‌کارلو:</span>
                      <span className="font-mono text-purple-400 font-bold">{config.minMonteCarloTpProbability}٪</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="80"
                      step="5"
                      value={config.minMonteCarloTpProbability}
                      onChange={e => handleUpdateConfig({ minMonteCarloTpProbability: Number(e.target.value) })}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
