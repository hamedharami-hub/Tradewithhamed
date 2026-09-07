// components/trading/offline-ai-selector-modal.tsx
'use client';

import React, { useState } from 'react';
import {
  OFFLINE_AI_PROFILES,
  OfflineAIProfileId,
  OfflineAIProfile,
} from '@/lib/core/analyst-critic';
import {
  Bot,
  CheckCircle2,
  ShieldCheck,
  Cpu,
  Clock,
  Layers,
  X,
  Zap,
} from 'lucide-react';

interface OfflineAISelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfileId: OfflineAIProfileId;
  customEndpoint?: string;
  onSelectProfile: (profileId: OfflineAIProfileId, endpointUrl?: string) => void;
}

export const OfflineAISelectorModal: React.FC<OfflineAISelectorModalProps> = ({
  isOpen,
  onClose,
  activeProfileId,
  customEndpoint,
  onSelectProfile,
}) => {
  const [selectedId, setSelectedId] = useState<OfflineAIProfileId>(activeProfileId);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const handleApply = (profileId: OfflineAIProfileId) => {
    setSelectedId(profileId);
    onSelectProfile(profileId);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 400);
  };

  const getProfileIcon = (type: OfflineAIProfile['type']) => {
    switch (type) {
      case 'HEURISTIC_DETERMINISTIC':
        return <Zap className="w-4 h-4 text-emerald-400" />;
      case 'DEEP_CRITIC':
        return <ShieldCheck className="w-4 h-4 text-amber-400" />;
      case 'ENSEMBLE':
        return <Layers className="w-4 h-4 text-cyan-400" />;
      case 'WEBLLM_WEBGPU':
        return <Cpu className="w-4 h-4 text-cyan-400" />;
      default:
        return <Bot className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl bg-[#16191f] border border-[#2c323d] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-right font-sans transition-all"
        dir="rtl"
      >
        {/* هدر پنجره با استانداردهای طراحی متریال ۳ گوگل */}
        <div className="px-5 py-4 bg-[#1b2028] border-b border-[#2c323d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-700/60 text-cyan-300">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">
                  انتخاب مدل هوش مصنوعی آفلاین در سایه
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
                  ۱۰۰٪ محلی و امن
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                پردازش کاملاً درون دستگاه، بدون ارسال حتی یک بایت داده به بیرون
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            aria-label="بستن پنجره"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* بدنه اسکرول‌شونده و ممیزی مدل‌ها */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
          {/* بنر اطمینان از سلامت حریم خصوصی و عدم خستگی چشم */}
          <div className="p-3.5 bg-[#12141a] border border-[#262b35] rounded-xl flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs text-zinc-300 leading-relaxed">
              <span className="font-bold text-zinc-100">تضمین استقلال و حریم خصوصی:</span>
              <p className="text-zinc-400 text-[11px]">
                این سامانه ممیزی ستاپ‌های معاملاتی را بر پایه مدل‌های محاسباتی قطعی درون‌مرورگری و پورت لوکال اجرا می‌کند؛ از این رو هیچ کلید شخصی، دیتای ریپلی یا تصمیم تحلیلی از سیستم خارج نمی‌شود.
              </p>
            </div>
          </div>

          {/* لیست پروفایل‌های هوش مصنوعی موجود */}
          <div className="space-y-2.5">
            {OFFLINE_AI_PROFILES.map(profile => {
              const isSelected = selectedId === profile.id;

              return (
                <div
                  key={profile.id}
                  onClick={() => handleApply(profile.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#1e2531] border-cyan-500 shadow-md shadow-cyan-950/30'
                      : 'bg-[#15181e] border-[#252a33] hover:border-zinc-700 hover:bg-[#191d24]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    {/* اطلاعات اصلی */}
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 rounded-lg bg-[#1f242e] border border-zinc-750 shrink-0 mt-0.5">
                        {getProfileIcon(profile.type)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-zinc-100">
                            {profile.nameFa}
                          </span>
                          <span
                            dir="ltr"
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"
                          >
                            {profile.name}
                          </span>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-600 text-white flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              مدل فعال
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {profile.descriptionFa}
                        </p>

                        {/* ویژگی‌ها و نیازمندی سخت‌افزاری */}
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] pt-1">
                          <span className="text-zinc-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-zinc-500" />
                            <span>تأخیر:</span>
                            <span dir="ltr" className="font-mono text-cyan-300 font-semibold">
                              ~{profile.latencyMs} ms
                            </span>
                          </span>
                          <span className="text-zinc-400 flex items-center gap-1">
                            <Cpu className="w-3 h-3 text-zinc-500" />
                            <span>سخت‌افزار: {profile.hardwareReqFa}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* دکمه انتخاب */}
                    <div className="shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleApply(profile.id);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-cyan-600 text-white cursor-default'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                        }`}
                      >
                        {isSelected ? 'انتخاب شده' : 'انتخاب این مدل'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* پاورقی پنجره */}
        <div className="px-5 py-3.5 bg-[#1b2028] border-t border-[#2c323d] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <span>مدل جاری:</span>
            <span className="font-bold text-cyan-300">
              {OFFLINE_AI_PROFILES.find(p => p.id === selectedId)?.nameFa}
            </span>
            {saveSuccess && (
              <span className="text-emerald-400 font-medium">✓ ذخیره شد</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-medium transition-colors"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
