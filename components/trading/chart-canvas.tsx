'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Candle, SymbolId } from '@/lib/contracts/market';
import { StrategyCandidate } from '@/lib/contracts/strategy';

interface ChartCanvasProps {
  symbol: SymbolId;
  candles: Candle[];
  activeCandidate: StrategyCandidate | null;
}

export const ChartCanvas: React.FC<ChartCanvasProps> = ({ symbol, candles, activeCandidate }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  // ارتفاع ثابت و پایدار نمودار برای جلوگیری کامل از چرخه بی‌پایان کشیدگی ResizeObserver
  const CHART_TOTAL_HEIGHT = 360;
  const PLOT_TOP = 20;
  const PLOT_BOTTOM = 300;
  const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
  const RIGHT_PRICE_AXIS_WIDTH = 55;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (!entries[0]) return;
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 100) {
        setContainerWidth(w);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!candles || candles.length === 0) {
    return (
      <div className="w-full h-[360px] flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-500 text-xs">
        در حال بارگذاری کندل‌های بازار...
      </div>
    );
  }

  // محاسبه دقیق بازه حداقل و حداکثر قیمت برای محور عمودی
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  candles.forEach(c => {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  });

  if (activeCandidate) {
    minPrice = Math.min(minPrice, activeCandidate.entryPrice, activeCandidate.stopLossPrice, activeCandidate.takeProfitPrice);
    maxPrice = Math.max(maxPrice, activeCandidate.entryPrice, activeCandidate.stopLossPrice, activeCandidate.takeProfitPrice);
  }

  // اضافه کردن حاشیه ۵ درصدی بالا و پایین برای تنفس سطوح
  const priceDiff = maxPrice - minPrice || 1;
  const padding = priceDiff * 0.08;
  const viewMinPrice = minPrice - padding;
  const viewMaxPrice = maxPrice + padding;
  const viewRange = viewMaxPrice - viewMinPrice;

  // تابع تبدیل قیمت به مختصات عمودی Y
  const getY = (price: number) => {
    const ratio = (price - viewMinPrice) / viewRange;
    return PLOT_BOTTOM - ratio * PLOT_HEIGHT;
  };

  // نگه‌داشتن برچسب‌ها در محدوده قابل مشاهده بدون خروج از لبه‌های بالا و پایین
  const getClampedLabelY = (price: number) => {
    const rawY = getY(price);
    return Math.max(PLOT_TOP + 18, Math.min(PLOT_BOTTOM, rawY));
  };

  // محاسبه عرض کندل‌ها و فواصل
  const usableWidth = Math.max(200, containerWidth - RIGHT_PRICE_AXIS_WIDTH - 20);
  const candleCount = candles.length;
  const slotWidth = usableWidth / candleCount;
  const candleBodyWidth = Math.max(3, Math.min(18, Math.floor(slotWidth * 0.7)));

  const lastCandle = candles[candles.length - 1];

  return (
    <div
      id="chart-main-container"
      ref={containerRef}
      className="w-full h-[360px] bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col relative overflow-hidden select-none"
    >
      {/* سربرگ اطلاعات نماد و فضای چندتایم‌فریمه */}
      <div className="flex flex-wrap items-center justify-between mb-1.5 px-1 text-xs shrink-0 gap-2">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-bold text-zinc-100">{symbol}</span>
          <span className="text-emerald-400 font-bold">
            ${lastCandle.close.toFixed(symbol === 'XAUUSD' ? 2 : 5)}
          </span>

          {/* نشانگر چندتایم‌فریمه */}
          <div className="hidden sm:flex items-center gap-1 text-[10px] font-sans">
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              بستر: 4H/1H ({activeCandidate ? (activeCandidate.direction === 'BUY' ? 'صعودی' : 'نزولی') : 'خنثی'})
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-cyan-400">
              ستاپ: 15M (S0 Sweep)
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400">
              ورود: 5M
            </span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-400 font-sans">
          کندل‌های بسته: <span className="font-mono text-zinc-300">{candles.length}</span> | بدون سوگیری آینده
        </div>
      </div>

      {/* بوم SVG با ابعاد پایدار و مشخص */}
      <div className="flex-1 w-full relative min-h-0 overflow-hidden">
        <svg
          width={containerWidth}
          height={PLOT_BOTTOM + 20}
          viewBox={`0 0 ${containerWidth} ${PLOT_BOTTOM + 20}`}
          className="w-full h-full block"
        >
          {/* خطوط شطرنجی افقی قیمت و برچسب‌های محور راست */}
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((ratio, idx) => {
            const price = viewMinPrice + ratio * viewRange;
            const y = getY(price);
            return (
              <g key={idx}>
                <line
                  x1={10}
                  y1={y}
                  x2={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                  y2={y}
                  stroke="#27272a"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={containerWidth - RIGHT_PRICE_AXIS_WIDTH + 8}
                  y={y + 3}
                  fill="#71717a"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {price.toFixed(symbol === 'XAUUSD' ? 2 : 4)}
                </text>
              </g>
            );
          })}

          {/* رسم کندل‌های ژاپنی */}
          {candles.map((c, i) => {
            const xCenter = 15 + i * slotWidth + slotWidth / 2;
            const xBody = xCenter - candleBodyWidth / 2;
            const isBullish = c.close >= c.open;
            const color = isBullish ? '#10b981' : '#f43f5e';

            const yHigh = getY(c.high);
            const yLow = getY(c.low);
            const yOpen = getY(c.open);
            const yClose = getY(c.close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

            return (
              <g key={c.timestamp || i}>
                {/* سایه کندل (Wick) */}
                <line
                  x1={xCenter}
                  y1={yHigh}
                  x2={xCenter}
                  y2={yLow}
                  stroke={color}
                  strokeWidth="1.2"
                />
                {/* بدنه کندل (Body) */}
                <rect
                  x={xBody}
                  y={bodyTop}
                  width={candleBodyWidth}
                  height={bodyHeight}
                  fill={color}
                  rx={1}
                />
              </g>
            );
          })}

          {/* خطوط سطوح ستاپ معاملاتی (نقطه ورود، حد ضرر و حد سود) */}
          {activeCandidate && (
            <g>
              {/* خط نقطه ورود لیمیت */}
              <line
                x1={10}
                y1={getY(activeCandidate.entryPrice)}
                x2={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={getY(activeCandidate.entryPrice)}
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <rect
                x={12}
                y={getClampedLabelY(activeCandidate.entryPrice) - 16}
                width={130}
                height={16}
                fill="#0c4a6e"
                rx={3}
                opacity={0.85}
              />
              <text
                x={16}
                y={getClampedLabelY(activeCandidate.entryPrice) - 4}
                fill="#7dd3fc"
                fontSize="10"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                ورود لیمیت: {activeCandidate.entryPrice}
              </text>

              {/* خط حد ضرر */}
              <line
                x1={10}
                y1={getY(activeCandidate.stopLossPrice)}
                x2={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={getY(activeCandidate.stopLossPrice)}
                stroke="#f43f5e"
                strokeWidth="1.5"
              />
              <rect
                x={12}
                y={getClampedLabelY(activeCandidate.stopLossPrice) - 16}
                width={120}
                height={16}
                fill="#4c0519"
                rx={3}
                opacity={0.85}
              />
              <text
                x={16}
                y={getClampedLabelY(activeCandidate.stopLossPrice) - 4}
                fill="#fda4af"
                fontSize="10"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                حد ضرر (SL): {activeCandidate.stopLossPrice}
              </text>

              {/* خط حد سود */}
              <line
                x1={10}
                y1={getY(activeCandidate.takeProfitPrice)}
                x2={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={getY(activeCandidate.takeProfitPrice)}
                stroke="#10b981"
                strokeWidth="1.5"
              />
              <rect
                x={12}
                y={getClampedLabelY(activeCandidate.takeProfitPrice) - 16}
                width={120}
                height={16}
                fill="#022c22"
                rx={3}
                opacity={0.85}
              />
              <text
                x={16}
                y={getClampedLabelY(activeCandidate.takeProfitPrice) - 4}
                fill="#6ee7b7"
                fontSize="10"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                حد سود (TP): {activeCandidate.takeProfitPrice}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
