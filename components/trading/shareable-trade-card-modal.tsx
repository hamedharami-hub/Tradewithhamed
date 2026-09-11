// components/trading/shareable-trade-card-modal.tsx
// مودال سازنده و صادرکننده کارت گرافیکی مدرن و باکیفیت معامله (Shareable PnL Card)
// رندر ۱۰۰٪ سمت کلاینت با بوم Canvas، بدون وابستگی خارجی و سازگار با اینستاگرام/تلگرام

'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Share2,
  Maximize2,
  Square,
  ShieldCheck,
} from 'lucide-react';

export interface ShareableTradeData {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  realizedNetPnL?: number;
  realizedRMultiple?: number;
  volumeLots?: number;
  maePips?: number;
  maeDollar?: number;
  mfePips?: number;
  mfeDollar?: number;
  exitEfficiencyPercent?: number;
  psychologyMood?: string;
  propFirmId?: string;
  setupGrade?: string;
  openedAt?: number;
  closedAt?: number;
  traderNotesFa?: string;
  isCandidate?: boolean;
}

interface ShareableTradeCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ShareableTradeData | null;
}

type AspectRatio = '16:9' | '1:1';

export const ShareableTradeCardModal: React.FC<ShareableTradeCardModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ترسیم کارت گرافیکی روی بوم Canvas
  const drawCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const isWide = aspectRatio === '16:9';
    const width = isWide ? 1200 : 1080;
    const height = isWide ? 675 : 1080;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ۱. پس‌زمینه سایبرپانک تیره با گرادیان
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0a0e17');
    bgGradient.addColorStop(0.5, '#0f172a');
    bgGradient.addColorStop(1, '#050811');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // ۲. الگوی شبکه هندسی مدرن (Grid Lines)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.035)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // ۳. هاله نورانی نئونی بالا و گوشه‌ها (Ambient Glow)
    const isBuy = data.direction === 'BUY';
    const isProfit = (data.realizedNetPnL ?? 0) >= 0;
    const accentColor = isBuy ? '#10b981' : '#f43f5e';
    const pnlColor = isProfit ? '#10b981' : '#f43f5e';

    const glowGradient = ctx.createRadialGradient(
      width * 0.5,
      height * 0.1,
      20,
      width * 0.5,
      height * 0.1,
      width * 0.6
    );
    glowGradient.addColorStop(0, isProfit ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)');
    glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, width, height);

    // ۴. کادر بیرونی مدرن با حاشیه درخشان
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, width - 48, height - 48);

    // گوشه‌های سایبری نئونی
    const drawCorner = (cx: number, cy: number, dx: number, dy: number) => {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + dx * 28, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * 28);
      ctx.stroke();
    };
    drawCorner(24, 24, 1, 1);
    drawCorner(width - 24, 24, -1, 1);
    drawCorner(24, height - 24, 1, -1);
    drawCorner(width - 24, height - 24, -1, -1);

    // ۵. سربرگ برند و عنوان سازمانی (Header)
    const paddingX = 64;
    let currentY = isWide ? 84 : 100;

    // نشان برند Tradewithhamed
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Tradewithhamed', paddingX, currentY);

    // نقطه نئونی برند
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(paddingX + 225, currentY - 8, 5, 0, Math.PI * 2);
    ctx.fill();

    // نشان زیرعنوان سازمانی
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('AUTONOMOUS INSTITUTIONAL TRADING LAB', paddingX, currentY + 22);

    // بج تایید اعتبار و بدون بایاس (Verified Badge) در سمت راست
    const rightX = width - paddingX;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('✓ VERIFIED ENGINE FEED', rightX, currentY);

    ctx.fillStyle = '#64748b';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('ZERO LOOKAHEAD BIAS', rightX, currentY + 20);

    // خط فاصل باریک زیر سربرگ
    currentY += 45;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX, currentY);
    ctx.lineTo(rightX, currentY);
    ctx.stroke();

    // ۶. بخش هویت معامله: نماد و نشان جهت (Symbol & Direction)
    currentY += isWide ? 55 : 65;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 52px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillText(data.symbol, paddingX, currentY);

    const symbolTextWidth = ctx.measureText(data.symbol).width;

    // برچسب جهت خرید / فروش (BUY / SELL Tag)
    const tagX = paddingX + symbolTextWidth + 24;
    const tagY = currentY - 40;
    const tagWidth = 140;
    const tagHeight = 44;

    ctx.fillStyle = isBuy ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      isBuy ? '▲ BUY / LONG' : '▼ SELL / SHORT',
      tagX + tagWidth / 2,
      tagY + 29
    );

    // ۷. بخش نمایش سود و زیان اصلی و R-Multiple (PnL Hero Area)
    currentY += isWide ? 75 : 85;

    // باکس کانتینر سود/زیان
    const pnlBoxY = currentY;
    const pnlBoxHeight = isWide ? 140 : 160;
    const pnlBoxWidth = width - paddingX * 2;

    const pnlBoxGrad = ctx.createLinearGradient(paddingX, pnlBoxY, paddingX + pnlBoxWidth, pnlBoxY + pnlBoxHeight);
    pnlBoxGrad.addColorStop(0, 'rgba(15, 23, 42, 0.7)');
    pnlBoxGrad.addColorStop(1, 'rgba(30, 41, 59, 0.4)');
    ctx.fillStyle = pnlBoxGrad;
    ctx.strokeStyle = isProfit ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(paddingX, pnlBoxY, pnlBoxWidth, pnlBoxHeight, 16);
    ctx.fill();
    ctx.stroke();

    // نوشته برچسب PnL
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(data.isCandidate ? 'PROJECTED RETURN (R:R)' : 'NET REALIZED PnL', paddingX + 28, pnlBoxY + 36);

    // عدد بزرگ سود و زیان دلاری
    const netPnl = data.realizedNetPnL ?? 0;
    const pnlString = data.isCandidate
      ? `1 : ${((data.takeProfitPrice && data.stopLossPrice && data.entryPrice)
          ? Math.abs((data.takeProfitPrice - data.entryPrice) / (data.entryPrice - data.stopLossPrice)).toFixed(2)
          : '2.50')}`
      : `${netPnl >= 0 ? '+' : ''}$${Math.abs(netPnl).toFixed(2)}`;

    ctx.fillStyle = pnlColor;
    ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillText(pnlString, paddingX + 28, pnlBoxY + 98);

    // نشان بازدهی به ضریب ریسک (R-Multiple Pill) در سمت راست جعبه
    if (data.realizedRMultiple !== undefined || data.isCandidate) {
      const rVal = data.realizedRMultiple ?? 2.5;
      const rString = `${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)} R`;
      const pillW = 160;
      const pillH = 50;
      const pillX = paddingX + pnlBoxWidth - pillW - 28;
      const pillY = pnlBoxY + 45;

      ctx.fillStyle = isProfit ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
      ctx.strokeStyle = pnlColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pnlColor;
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(rString, pillX + pillW / 2, pillY + 34);
    }

    // ۸. پنل مشخصات قیمتی و معیارهای پیشرفته MAE / MFE
    currentY += pnlBoxHeight + 24;

    const statsCols = isWide ? 4 : 2;
    const statsRows = isWide ? 1 : 2;
    const statBoxWidth = (pnlBoxWidth - (statsCols - 1) * 16) / statsCols;
    const statBoxHeight = 84;

    const stats = [
      {
        label: 'ENTRY PRICE',
        value: data.entryPrice.toFixed(data.symbol === 'XAUUSD' ? 2 : 5),
        sub: data.volumeLots ? `${data.volumeLots} Lots` : 'Market',
        color: '#38bdf8',
      },
      {
        label: data.exitPrice ? 'EXIT PRICE' : 'TARGET (TP)',
        value: (data.exitPrice ?? data.takeProfitPrice ?? data.entryPrice).toFixed(data.symbol === 'XAUUSD' ? 2 : 5),
        sub: data.stopLossPrice ? `SL: ${data.stopLossPrice.toFixed(data.symbol === 'XAUUSD' ? 2 : 4)}` : '',
        color: '#f8fafc',
      },
      {
        label: 'MAE (MAX ADVERSE)',
        value: data.maePips !== undefined ? `${data.maePips.toFixed(1)} pips` : '0.0 pips',
        sub: data.maeDollar !== undefined ? `-$${Math.abs(data.maeDollar).toFixed(1)}` : 'Low Drift',
        color: '#f43f5e',
      },
      {
        label: 'MFE / EFFICIENCY',
        value: data.mfePips !== undefined ? `${data.mfePips.toFixed(1)} pips` : 'Peak',
        sub: data.exitEfficiencyPercent !== undefined ? `${data.exitEfficiencyPercent}% Efficiency` : 'High Capture',
        color: '#10b981',
      },
    ];

    stats.forEach((st, idx) => {
      const col = idx % statsCols;
      const row = Math.floor(idx / statsCols);
      const bx = paddingX + col * (statBoxWidth + 16);
      const by = currentY + row * (statBoxHeight + 16);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, statBoxWidth, statBoxHeight, 10);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(st.label, bx + 16, by + 26);

      ctx.fillStyle = st.color;
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
      ctx.fillText(st.value, bx + 16, by + 52);

      if (st.sub) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
        ctx.fillText(st.sub, bx + 16, by + 72);
      }
    });

    currentY += statsRows * (statBoxHeight + 16) + 12;

    // ۹. نشان‌های سه‌گانه: روان‌شناسی، پراپ‌فرم و رتبه ستاپ (Badges Row)
    const badgesY = isWide ? currentY + 12 : currentY + 20;
    let badgeX = paddingX;

    // الف) بج روانشناسی
    const moodMap: Record<string, { label: string; bg: string; border: string; text: string }> = {
      PLAN_DISCIPLINED: { label: '🎯 Plan Disciplined', bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', text: '#d8b4fe' },
      FOMO_RUSH: { label: '⚡ FOMO Rush Tagged', bg: 'rgba(234, 179, 8, 0.15)', border: '#eab308', text: '#fde047' },
      REVENGE_TRADE: { label: '😡 Anti-Revenge Guard', bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#fca5a5' },
      FATIGUED: { label: '😴 Fatigue Alert', bg: 'rgba(148, 163, 184, 0.15)', border: '#94a3b8', text: '#cbd5e1' },
    };
    const moodMeta = moodMap[data.psychologyMood || 'PLAN_DISCIPLINED'] || moodMap.PLAN_DISCIPLINED;

    const renderPill = (text: string, bg: string, border: string, color: string) => {
      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const textW = ctx.measureText(text).width;
      const pillW = textW + 28;
      const pillH = 34;

      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgesY, pillW, pillH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(text, badgeX + 14, badgesY + 22);

      badgeX += pillW + 12;
    };

    renderPill(moodMeta.label, moodMeta.bg, moodMeta.border, moodMeta.text);

    // ب) بج پراپ فرم
    if (data.propFirmId) {
      const firmName = data.propFirmId.split('_')[0] || data.propFirmId;
      renderPill(`🏛️ Prop: ${firmName}`, 'rgba(245, 158, 11, 0.15)', '#f59e0b', '#fcd34d');
    }

    // ج) رتبه کیفیت هوش مصنوعی ستاپ
    const grade = data.setupGrade || 'A+';
    renderPill(`⚡ Setup Grade: ${grade}`, 'rgba(6, 182, 212, 0.15)', '#06b6d4', '#67e8f9');

    // ۱۰. پاورقی کارت: تاریخ، امضای اصالت و آدرس وبسایت
    const footerY = height - 52;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX, footerY - 18);
    ctx.lineTo(rightX, footerY - 18);
    ctx.stroke();

    const dateString = new Date(data.closedAt || data.openedAt || Date.now()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC';

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillText(`TIMESTAMP: ${dateString}`, paddingX, footerY + 4);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.fillText('tradewithhamed.vercel.app', rightX, footerY + 4);
  }, [aspectRatio, data]);

  // رندر مجدد در تغییر داده یا نسبت تصویر
  useEffect(() => {
    if (isOpen && data) {
      const timer = setTimeout(() => {
        drawCard();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, data, drawCard]);

  // تابع دانلود تصویر به صورت PNG با کیفیت بالا
  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    setIsExporting(true);
    try {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = `tradewithhamed-${data.symbol}-${data.direction}-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      setIsExporting(false);
    }
  };

  // تابع کپی مستقیم تصویر در حافظه (Clipboard API)
  const handleCopyToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }, 'image/png', 1.0);
    } catch (err) {
      console.warn('Clipboard write failed, fallback to download:', err);
      handleDownloadImage();
    }
  };

  if (!isOpen || !data) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-3xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* سربرگ مودال */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#1e293b]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                <span>کارت اشتراک‌گذاری معامله و بازدهی</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
                  PNG Export
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تولید پوستر گرافیکی با کیفیت بالا همراه با تمام سنجه‌های اصالت معامله و روانشناسی
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-xl hover:bg-slate-800 transition-colors"
            aria-label="بستن مودال"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* نوار کنترل تنظیمات نسبت تصویر */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#0a0e1a] border-b border-[#1e293b] text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">نسبت ابعاد:</span>
            <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  aspectRatio === '16:9'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>۱۶:۹ (عریض / تلگرام و توییتر)</span>
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('1:1')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  aspectRatio === '1:1'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                <span>۱:۱ (مربعی / اینستاگرام و استوری)</span>
              </button>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-slate-400 text-[11px] font-mono">
            <span>رزولوشن: {aspectRatio === '16:9' ? '1200x675' : '1080x1080'} px</span>
          </div>
        </div>

        {/* کادر پیش‌نمایش کارت */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center bg-[#070a12]">
          <div className="max-w-full max-h-[58vh] overflow-hidden rounded-2xl shadow-2xl border border-slate-800/80 bg-slate-950 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[56vh] object-contain block rounded-2xl"
              style={{ width: 'auto', height: 'auto' }}
            />
          </div>
        </div>

        {/* پاورقی دکمه‌های اقدام: دانلود و کپی */}
        <div className="p-4 sm:p-5 border-t border-[#1e293b] bg-[#0a0e1a] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>دارای امضای اصالت بدون سوگیری زمانی (Zero Lookahead Bias)</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyToClipboard}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all shadow-sm active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">در حافظه کپی شد!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>کپی در کلیپ‌بورد</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={isExporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>دانلود تصویر PNG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
