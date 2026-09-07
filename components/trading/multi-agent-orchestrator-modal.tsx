// components/trading/multi-agent-orchestrator-modal.tsx
// پنجره پیشرفته پیکربندی خط‌لوله ۴ ایجنت هوشمند و سبک‌های معاملاتی
// طراحی بر اساس متریال ۳ گوگل، با تایپوگرافی خوانا و جلوگیری از خستگی چشم

'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Bot,
  Cpu,
  ShieldCheck,
  Zap,
  Sliders,
  Sparkles,
  CheckCircle2,
  Layers,
  ArrowRight,
  HelpCircle,
  HardDrive,
  Activity,
  Check,
} from 'lucide-react';
import {
  MultiAgentConfiguration,
  TRADING_STYLES,
  AGENT_ROLES_INFO,
  AGENT_ENGINE_OPTIONS,
  DEFAULT_MULTI_AGENT_CONFIG,
  TradingStyleId,
  AgentRole,
} from '@/lib/contracts/multi-agent-system';
import { BrowserOfflineAIManager, WebGPUCapabilityReport } from '@/lib/ai/browser-offline-ai';

interface MultiAgentOrchestratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MultiAgentConfiguration;
  onSaveConfig: (newConfig: MultiAgentConfiguration) => void;
}

export const MultiAgentOrchestratorModal: React.FC<MultiAgentOrchestratorModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'agents' | 'styles' | 'hardware'>('agents');
  const [currentConfig, setCurrentConfig] = useState<MultiAgentConfiguration>(config);
  const [prevConfig, setPrevConfig] = useState<MultiAgentConfiguration>(config);
  const [hardware, setHardware] = useState<WebGPUCapabilityReport | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  if (prevConfig !== config) {
    setPrevConfig(config);
    setCurrentConfig(config);
  }

  useEffect(() => {
    if (isOpen) {
      BrowserOfflineAIManager.probeHardware().then(setHardware);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(currentConfig);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setCurrentConfig(DEFAULT_MULTI_AGENT_CONFIG);
  };

  const roles: AgentRole[] = ['SCANNER', 'ANALYST', 'CRITIC', 'JUDGE'];

  const getOptionsForRole = (role: AgentRole) => {
    return AGENT_ENGINE_OPTIONS.filter(o => o.role === role);
  };

  const getSelectedEngineId = (role: AgentRole): string => {
    switch (role) {
      case 'SCANNER':
        return currentConfig.scannerEngineId;
      case 'ANALYST':
        return currentConfig.analystEngineId;
      case 'CRITIC':
        return currentConfig.criticEngineId;
      case 'JUDGE':
        return currentConfig.judgeEngineId;
    }
  };

  const setSelectedEngineId = (role: AgentRole, engineId: string) => {
    setCurrentConfig(prev => {
      switch (role) {
        case 'SCANNER':
          return { ...prev, scannerEngineId: engineId };
        case 'ANALYST':
          return { ...prev, analystEngineId: engineId };
        case 'CRITIC':
          return { ...prev, criticEngineId: engineId };
        case 'JUDGE':
          return { ...prev, judgeEngineId: engineId };
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto font-sans"
      dir="rtl"
    >
      <div
        className="bg-[#12151b] border border-[#262c3a] w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] text-right overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* سربرگ پنجره مودال */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#212735] bg-[#161a22]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-800/60 text-cyan-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">
                  اتاق فرمان ۴ ایجنت هوشمند و سبک‌های معاملاتی
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-bold">
                  نسخه ۴.۰ تیمی
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                تخصیص مستقل مدل‌ها و هوش‌های مصنوعی به هر یک از ۴ نقش؛ تلفیق کامل موتورهای مکانیکی و عصبی
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#1f2532] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* سربرگ تب‌ها */}
        <div className="flex items-center justify-between px-6 border-b border-[#212735] bg-[#141820]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('agents')}
              className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'agents'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>پیکربندی ۴ ایجنت تیمی</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('styles')}
              className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'styles'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>سبک‌های ترید اسمارت‌مانی</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hardware')}
              className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'hardware'
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>پایش سخت‌افزار مرورگر (WebGPU)</span>
            </button>
          </div>

          <span className="text-[11px] text-zinc-400 hidden sm:inline">
            سبک فعال: <span className="text-cyan-300 font-bold">{TRADING_STYLES.find(s => s.id === currentConfig.activeTradingStyle)?.nameFa}</span>
          </span>
        </div>

        {/* محتوای تب‌ها */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* تب ۱: پیکربندی ۴ ایجنت */}
          {activeTab === 'agents' && (
            <div className="space-y-4">
              <div className="p-3 bg-gradient-to-r from-cyan-950/40 via-purple-950/30 to-slate-900 border border-cyan-800/40 rounded-xl text-zinc-300 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong className="text-cyan-300">معماری هم‌افزا (Symphony Multi-Agent):</strong> برخلاف مدل‌های تک‌انتخابی، در این سیستم هر ۴ ایجنت هم‌زمان فعال هستند. شما می‌توانید برای هر نقش، هوش‌های عصبی پرقدرت (شامل مدل‌های ۱۴ میلیاردی DeepSeek-R1 و Qwen برای دستگاه‌های با رم ۱۶ گیگابایت نظیر Pixel 9 Pro Fold و لپ‌تاپ Snapdragon X Plus) یا الگوریتم‌های فوق‌سریع و فشرده (مانند Phi-4-mini و S0 قطعی) را به طور کاملاً مستقل انتخاب کنید.
                </div>
              </div>

              {/* ۴ کارت ایجنت در خط‌لوله */}
              <div className="space-y-3">
                {roles.map((role, idx) => {
                  const info = AGENT_ROLES_INFO[role];
                  const options = getOptionsForRole(role);
                  const selectedId = getSelectedEngineId(role);
                  const selectedOption = options.find(o => o.id === selectedId) || options[0];

                  return (
                    <div
                      key={role}
                      className="p-4 rounded-xl bg-[#161a22] border border-[#242b38] hover:border-cyan-800/50 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#1f2533]">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-[#1c222e] border border-[#2f3747] text-cyan-400 font-mono text-xs flex items-center justify-center font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <h3 className="font-bold text-zinc-100 text-sm">{info.nameFa}</h3>
                            <p className="text-zinc-400 text-[11px] mt-0.5">{info.missionFa}</p>
                          </div>
                        </div>

                        {/* انتخاب‌گر موتور برای این ایجنت */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-zinc-400">موتور مجری:</span>
                          <select
                            value={selectedId}
                            onChange={e => setSelectedEngineId(role, e.target.value)}
                            className="bg-[#0e1117] border border-[#2b3342] text-cyan-300 font-medium rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
                          >
                            {options.map(opt => (
                              <option key={opt.id} value={opt.id}>
                                {opt.nameFa} ({opt.type === 'DETERMINISTIC' ? 'محاسباتی قطعی' : 'WebGPU عصبی'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* اطلاعات موتور انتخابی */}
                      <div className="pt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#1d222d] text-zinc-300 font-mono">
                            {selectedOption.type === 'DETERMINISTIC' ? 'قطعی ۱۰۰٪ آفلاین' : 'استنتاج عصبی WebGPU'}
                          </span>
                          <span>{selectedOption.descriptionFa}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <span>تأخیر تخمینی:</span>
                          <span dir="ltr" className="font-mono text-cyan-400 font-bold">
                            ~{selectedOption.latencyMs}ms
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* تب ۲: سبک‌های معاملاتی */}
          {activeTab === 'styles' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-xl text-zinc-300 flex items-start gap-2.5">
                <Layers className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong className="text-emerald-300">تطابق دقیق سبک با منطق هوش مصنوعی:</strong> با تغییر سبک، پرامپت‌ها و پارامترهای هر ۴ ایجنت (شامل حداقل R:R، نوع کندل تاییدیه، و شروط ابطال) متناسب با همان سبک بروزرسانی می‌شوند.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TRADING_STYLES.map(style => {
                  const isSelected = currentConfig.activeTradingStyle === style.id;
                  return (
                    <div
                      key={style.id}
                      onClick={() => setCurrentConfig(p => ({ ...p, activeTradingStyle: style.id }))}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-cyan-950/30 border-cyan-500 shadow-md ring-1 ring-cyan-500/50'
                          : 'bg-[#161a22] border-[#252c3a] hover:border-zinc-600'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1c222e] border border-[#2d3545] text-cyan-300">
                            {style.badgeFa}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                          )}
                        </div>

                        <h4 className="font-bold text-zinc-100 text-sm">{style.nameFa}</h4>
                        <p className="text-zinc-400 text-[11px] leading-relaxed">
                          {style.descriptionFa}
                        </p>

                        <div className="space-y-1 pt-2 border-t border-[#202532]">
                          <span className="text-[10px] text-zinc-400 font-bold block">قوانین کلیدی سبک:</span>
                          {style.coreRulesFa.map((rule, rIdx) => (
                            <div key={rIdx} className="flex items-center gap-1.5 text-[10px] text-zinc-300">
                              <span className="text-cyan-400">•</span>
                              <span>{rule}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 pt-2 border-t border-[#202532] flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">حداقل R:R مصوب:</span>
                        <span dir="ltr" className="font-mono font-bold text-emerald-400">
                          1 : {style.minimumRR}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* تب ۳: وضعیت سخت‌افزار */}
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#161a22] border border-[#252c3a] space-y-3">
                <div className="flex items-center justify-between border-b border-[#212735] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-bold text-zinc-100">سنجش زنده شتاب‌دهنده گرافیک مرورگر</h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      hardware?.hasWebGPU
                        ? 'bg-emerald-950/80 border-emerald-700 text-emerald-400'
                        : 'bg-amber-950/80 border-amber-700 text-amber-400'
                    }`}
                  >
                    {hardware?.hasWebGPU ? 'WebGPU فعال است' : 'استفاده از شتاب‌دهنده CPU'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#11141a] border border-[#202633] flex justify-between items-center">
                    <span className="text-zinc-400">نام آداپتور:</span>
                    <span className="text-zinc-200 font-mono text-[11px] truncate max-w-[200px]" dir="ltr">
                      {hardware?.adapterName || 'در حال سنجش...'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#11141a] border border-[#202633] flex justify-between items-center">
                    <span className="text-zinc-400">پشتیبانی از shader-f16:</span>
                    <span className={hardware?.hasShaderF16 ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                      {hardware?.hasShaderF16 ? 'پشتیبانی کامل' : 'غیرفعال (Fallback به f32)'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#11141a] border border-[#202633] flex justify-between items-center">
                    <span className="text-zinc-400">ظرفیت بافر مجاز:</span>
                    <span dir="ltr" className="font-mono text-cyan-400 font-bold">
                      {hardware?.maxBufferSizeMB || 0} MB
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#11141a] border border-[#202633] flex justify-between items-center">
                    <span className="text-zinc-400">سهمیه کش دیسک مرورگر:</span>
                    <span dir="ltr" className="font-mono text-cyan-400 font-bold">
                      {hardware?.estimatedStorageQuotaMB || 0} MB
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#11141a] border border-[#202633] text-[11px] text-zinc-300">
                  <strong className="text-cyan-300 block mb-1">توصیه کارایی بر اساس معماری دستگاه:</strong>
                  <span>{hardware?.recommendationFa || 'سیستم آماده کار با هر ۴ ایجنت است.'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* پاورقی دکمه‌های اقدام */}
        <div className="px-6 py-3.5 border-t border-[#212735] bg-[#161a22] flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#1f2532] transition-colors"
          >
            بازنشانی به تنظیمات پیش‌فرض
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-zinc-300 hover:bg-[#1f2532] transition-colors"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
            >
              {isSaved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>پیکربندی ذخیره شد</span>
                </>
              ) : (
                <>
                  <Sliders className="w-4 h-4" />
                  <span>اعمال و ذخیره تغییرات</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
