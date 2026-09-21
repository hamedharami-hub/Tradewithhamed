// components/ui/help-tooltip.tsx
// کامپوننت هوشمند علامت سؤال (?) همراه با دیاگرام‌های بصری (ASCII/Visual Scheme)، راهنمای مفهومی ساده و ملموس معامله‌گری

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, Sparkles, TrendingUp, ShieldCheck } from 'lucide-react';

interface HelpTooltipProps {
  titleFa: string;
  explanationFa: string;
  visualDiagramFa?: string; // دیاگرام یا طرح مفهومی بصری
  practicalTipFa?: string; // راهنمای کاربردی
  impactOnPropFirmFa?: string; // اثر بر قبولی پراپ و حفظ حساب
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  titleFa,
  explanationFa,
  visualDiagramFa,
  practicalTipFa,
  impactOnPropFirmFa,
  placement = 'top',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // بستن تول‌تیپ با کلیک در خارج از کامپوننت
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`relative inline-flex items-center ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-zinc-400 hover:text-purple-300 hover:bg-purple-500/20 transition-all focus:outline-none focus:ring-1 focus:ring-purple-400 ml-1 cursor-pointer"
        aria-label={titleFa}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-80 sm:w-96 p-3.5 bg-[#0b101c] border border-purple-500/50 rounded-2xl shadow-2xl shadow-black/80 text-right text-xs transition-all animate-in fade-in zoom-in-95 ${
            placement === 'top'
              ? 'bottom-full mb-2 right-1/2 translate-x-1/2'
              : placement === 'bottom'
              ? 'top-full mt-2 right-1/2 translate-x-1/2'
              : placement === 'left'
              ? 'right-full mr-2 top-1/2 -translate-y-1/2'
              : 'left-full ml-2 top-1/2 -translate-y-1/2'
          }`}
          onMouseLeave={() => setIsOpen(false)}
        >
          {/* هدر تول‌تیپ با دکمه بستن */}
          <div className="flex items-center justify-between border-b border-[#222c42] pb-2 mb-2.5">
            <span className="font-bold text-purple-200 flex items-center gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{titleFa}</span>
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-zinc-400 hover:text-white p-0.5 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* توضیح بسیار ساده، مفهومی و روان */}
          <p className="text-zinc-200 leading-relaxed text-[11px] font-normal mb-2.5">
            {explanationFa}
          </p>

          {/* طرح / دیاگرام مفهومی بصری (Visual Scheme) */}
          {visualDiagramFa && (
            <div className="bg-[#050811] border border-cyan-500/30 rounded-xl p-2.5 mb-2.5 font-mono text-[10px] text-cyan-300 leading-tight whitespace-pre-wrap select-none overflow-x-auto text-left ltr">
              <span className="text-[9px] text-zinc-500 block text-right rtl font-sans mb-1 font-bold">
                📊 دیاگرام و شکل شماتیک:
              </span>
              {visualDiagramFa}
            </div>
          )}

          {/* نکته کاربردی و راهنمای تنظیم معامله‌گر */}
          {practicalTipFa && (
            <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-2.5 mb-2 text-[10px] text-purple-200 leading-relaxed">
              <div className="flex items-center gap-1 text-purple-300 font-bold mb-1">
                <TrendingUp className="w-3 h-3 text-purple-400" />
                <span>💡 نحوه استفاده و تنظیم بهینه:</span>
              </div>
              <span>{practicalTipFa}</span>
            </div>
          )}

          {/* اثر بر قبولی پراپ و محافظت حساب */}
          {impactOnPropFirmFa && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-2 text-[10px] text-amber-200 leading-relaxed">
              <div className="flex items-center gap-1 text-amber-300 font-bold mb-1">
                <ShieldCheck className="w-3 h-3 text-amber-400" />
                <span>🛡️ تأثیر بر قبولی در چالش‌های پراپ‌فرم:</span>
              </div>
              <span>{impactOnPropFirmFa}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
