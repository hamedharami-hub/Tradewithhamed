// components/ui/help-tooltip.tsx
// کامپوننت هوشمند علامت سؤال (?) با زبان ساده و ملموس فارسی جهت شفاف‌سازی گزینه‌ها

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HelpTooltipProps {
  titleFa: string;
  explanationFa: string;
  practicalTipFa?: string;
  impactOnPropFirmFa?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  titleFa,
  explanationFa,
  practicalTipFa,
  impactOnPropFirmFa,
  placement = 'top',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // بستن تول‌تیپ با کلیک خارج از کامپوننت
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
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-zinc-400 hover:text-purple-300 hover:bg-purple-500/20 transition-all focus:outline-none focus:ring-1 focus:ring-purple-400 ml-1"
        aria-label={titleFa}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-72 sm:w-80 p-3 bg-[#0d1322] border border-purple-500/40 rounded-2xl shadow-2xl shadow-purple-950/50 text-right text-xs transition-all animate-in fade-in zoom-in-95 ${
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
          {/* هدر تول‌تیپ */}
          <div className="flex items-center justify-between border-b border-[#222c42] pb-1.5 mb-2">
            <span className="font-bold text-purple-300 flex items-center gap-1 text-[11px]">
              <HelpCircle className="w-3 h-3 text-purple-400" />
              <span>{titleFa}</span>
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded-md"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* توضیح روان به زبان ساده */}
          <p className="text-zinc-300 leading-relaxed text-[11px] font-normal mb-2">
            {explanationFa}
          </p>

          {/* نکته کاربردی معامله‌گر */}
          {practicalTipFa && (
            <div className="bg-purple-950/30 border border-purple-500/20 rounded-xl p-2 mb-1.5 text-[10px] text-purple-200 leading-normal">
              <strong className="text-purple-300 font-bold block mb-0.5">💡 چطور تنظیمش کنم؟</strong>
              {practicalTipFa}
            </div>
          )}

          {/* تأثیر در پراپ‌فرم و حساب شخصی */}
          {impactOnPropFirmFa && (
            <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-2 text-[10px] text-amber-200/90 leading-normal">
              <strong className="text-amber-300 font-bold block mb-0.5">🛡️ تأثیر در قبولی پراپ:</strong>
              {impactOnPropFirmFa}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
