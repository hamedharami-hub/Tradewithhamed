// components/trading/chart-canvas.tsx
// بوم پیشرفته رسم نمودار کندل‌استیک ۵ دقیقه‌ای با سطوح همگام چندتایم‌فریمه (MultiTF Levels)،
// مخروط پیش‌بینی احتمالاتی مونت‌کارلو (Monte Carlo Cone) و کراس‌هیر تعاملی مشترک

'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Candle, SymbolId } from '@/lib/contracts/market';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { MultiTimeframeLevel, PercentileStepPoint } from '@/lib/contracts/monte-carlo';

interface ChartCanvasProps {
  symbol: SymbolId;
  candles: Candle[];
  activeCandidate: StrategyCandidate | null;
  multiTimeframeLevels?: MultiTimeframeLevel[];
  monteCarloCone?: PercentileStepPoint[];
  isCrosshairSynced?: boolean;
  onCrosshairChange?: (price: number | null, timestamp: number | null) => void;
  crosshairPrice?: number | null;
}

export const ChartCanvas: React.FC<ChartCanvasProps> = ({
  symbol,
  candles,
  activeCandidate,
  multiTimeframeLevels = [],
  monteCarloCone = [],
  isCrosshairSynced = true,
  onCrosshairChange,
  crosshairPrice = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [hoverState, setHoverState] = useState<{ x: number; y: number; price: number; timestamp?: number } | null>(null);

  // ارتفاع ثابت و پایدار نمودار برای جلوگیری کامل از کشیدگی ResizeObserver
  const CHART_TOTAL_HEIGHT = 360;
  const PLOT_TOP = 20;
  const PLOT_BOTTOM = 300;
  const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
  const RIGHT_PRICE_AXIS_WIDTH = 65;

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
      <div className="w-full h-[360px] flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-500 text-xs font-sans">
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

  // در نظر گرفتن سطوح ماکرو در دامنه مقیاس اگر نزدیک قیمت باشند
  multiTimeframeLevels.forEach(lvl => {
    if (Math.abs(lvl.price - minPrice) < (maxPrice - minPrice) * 1.5) {
      if (lvl.price < minPrice) minPrice = lvl.price;
      if (lvl.price > maxPrice) maxPrice = lvl.price;
    }
  });

  // اضافه کردن حاشیه ۷ درصدی بالا و پایین برای تنفس سطوح
  const priceDiff = maxPrice - minPrice || 1;
  const padding = priceDiff * 0.07;
  const viewMinPrice = minPrice - padding;
  const viewMaxPrice = maxPrice + padding;
  const viewRange = viewMaxPrice - viewMinPrice;

  // تابع تبدیل قیمت به مختصات عمودی Y
  const getY = (price: number) => {
    const ratio = (price - viewMinPrice) / viewRange;
    return PLOT_BOTTOM - ratio * PLOT_HEIGHT;
  };

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

  // مدیریت رویداد حرکت ماوس برای کراس‌هیر
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 10 || x > usableWidth || y < PLOT_TOP || y > PLOT_BOTTOM) {
      setHoverState(null);
      if (onCrosshairChange) onCrosshairChange(null, null);
      return;
    }

    const price = viewMaxPrice - ((y - PLOT_TOP) / PLOT_HEIGHT) * viewRange;
    const candleIdx = Math.min(candleCount - 1, Math.max(0, Math.floor((x - 10) / slotWidth)));
    const timestamp = candles[candleIdx]?.timestamp;

    setHoverState({ x, y, price, timestamp });
    if (onCrosshairChange) {
      onCrosshairChange(price, timestamp || null);
    }
  };

  const handleMouseLeave = () => {
    setHoverState(null);
    if (onCrosshairChange) onCrosshairChange(null, null);
  };

  // خطوط افقی شبکه قیمت
  const gridLines = [0.2, 0.4, 0.6, 0.8].map(ratio => {
    const p = viewMinPrice + ratio * viewRange;
    return { y: getY(p), price: p };
  });

  return (
    <div
      id="chart-main-container"
      ref={containerRef}
      className="w-full h-[360px] bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col relative overflow-hidden select-none font-sans"
    >
      {/* سربرگ اطلاعات نماد و وضعیت چندتایم‌فریمه */}
      <div className="flex flex-wrap items-center justify-between mb-1.5 px-1 text-xs shrink-0 gap-2">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-bold text-zinc-100">{symbol}</span>
          <span className="text-emerald-400 font-bold">
            ${lastCandle.close.toFixed(symbol === 'XAUUSD' ? 2 : 5)}
          </span>

          <div className="hidden sm:flex items-center gap-1 text-[10px] font-sans">
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              بستر: H1/4H ({activeCandidate ? (activeCandidate.direction === 'BUY' ? 'صعودی' : 'نزولی') : 'خنثی'})
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-cyan-400">
              ورود: 5M
            </span>
            {multiTimeframeLevels.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800 text-cyan-300 font-mono">
                {multiTimeframeLevels.length} سطح کلان
              </span>
            )}
          </div>
        </div>

        <div className="text-[11px] text-zinc-400 font-sans flex items-center gap-2">
          {hoverState && (
            <span className="font-mono text-cyan-400 font-bold bg-[#141b28] px-2 py-0.5 rounded border border-cyan-800">
              قیمت: {hoverState.price.toFixed(symbol === 'XAUUSD' ? 2 : 5)}
            </span>
          )}
          <span>کندل‌های بسته: <strong className="font-mono text-zinc-300">{candles.length}</strong></span>
        </div>
      </div>

      {/* بوم SVG با ابعاد پایدار و مشخص */}
      <div className="flex-1 w-full relative min-h-0 overflow-hidden">
        <svg
          width={containerWidth}
          height={CHART_TOTAL_HEIGHT - 45}
          className="overflow-visible cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* خطوط پس‌زمینه شبکه قیمت */}
          {gridLines.map((g, idx) => (
            <g key={idx}>
              <line
                x1={10}
                y1={g.y}
                x2={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={g.y}
                stroke="#1e293b"
                strokeDasharray="2,3"
                strokeWidth="1"
              />
              <text
                x={containerWidth - RIGHT_PRICE_AXIS_WIDTH + 8}
                y={g.y + 4}
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                {g.price.toFixed(symbol === 'XAUUSD' ? 1 : 4)}
              </text>
            </g>
          ))}

          {/* ۱. ترسیم سطوح کلان چندتایم‌فریمه (MultiTimeframe Levels) */}
          {multiTimeframeLevels.map((lvl) => {
            const y = getY(lvl.price);
            if (y < PLOT_TOP || y > PLOT_BOTTOM) return null;

            return (
              <g key={lvl.id}>
                <line
                  x1={10}
                  y1={y}
                  x2={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                  y2={y}
                  stroke={lvl.color || '#06b6d4'}
                  strokeDasharray="4,4"
                  strokeWidth="1.2"
                  opacity={0.85}
                />
                <rect
                  x={containerWidth - RIGHT_PRICE_AXIS_WIDTH - 90}
                  y={y - 13}
                  width={85}
                  height={13}
                  fill="#0f172a"
                  stroke={lvl.color || '#06b6d4'}
                  strokeWidth="0.8"
                  rx={3}
                  opacity={0.9}
                />
                <text
                  x={containerWidth - RIGHT_PRICE_AXIS_WIDTH - 48}
                  y={y - 3}
                  fill={lvl.color || '#38bdf8'}
                  fontSize="9"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {lvl.labelFa.slice(0, 12)}
                </text>
              </g>
            );
          })}

          {/* ۲. ترسیم مخروط شبیه‌سازی استوکاستیک مونت‌کارلو (Monte Carlo Probability Cone) */}
          {monteCarloCone.length > 1 && (() => {
            const lastX = 10 + (candleCount - 1) * slotWidth + slotWidth / 2;
            const stepPx = 3.5;

            // باندهای صدک ۵ تا ۹۵ (سایه بنفش ملایم)
            const p5ToP95Points = [
              ...monteCarloCone.map((pt, i) => `${(lastX + i * stepPx).toFixed(1)},${getY(pt.p95).toFixed(1)}`),
              ...[...monteCarloCone].reverse().map((pt, i) => {
                const origIdx = monteCarloCone.length - 1 - i;
                return `${(lastX + origIdx * stepPx).toFixed(1)},${getY(pt.p5).toFixed(1)}`;
              }),
            ].join(' ');

            // باندهای صدک ۲۵ تا ۷۵ (سایه بنفش پررنگ‌تر)
            const p25ToP75Points = [
              ...monteCarloCone.map((pt, i) => `${(lastX + i * stepPx).toFixed(1)},${getY(pt.p75).toFixed(1)}`),
              ...[...monteCarloCone].reverse().map((pt, i) => {
                const origIdx = monteCarloCone.length - 1 - i;
                return `${(lastX + origIdx * stepPx).toFixed(1)},${getY(pt.p25).toFixed(1)}`;
              }),
            ].join(' ');

            // خط میانه P50
            const p50Points = monteCarloCone.map((pt, i) => `${(lastX + i * stepPx).toFixed(1)},${getY(pt.p50).toFixed(1)}`).join(' ');

            return (
              <g id="monte-carlo-chart-cone" opacity={0.65}>
                <polygon points={p5ToP95Points} fill="#a855f7" opacity={0.15} />
                <polygon points={p25ToP75Points} fill="#a855f7" opacity={0.25} />
                <polyline points={p50Points} fill="none" stroke="#c084fc" strokeWidth="1.5" strokeDasharray="3,2" />
              </g>
            );
          })()}

          {/* ۳. ترسیم کندل‌استیک‌ها */}
          {candles.map((c, i) => {
            const x = 10 + i * slotWidth + slotWidth / 2;
            const isUp = c.close >= c.open;
            const highY = getY(c.high);
            const lowY = getY(c.low);
            const openY = getY(c.open);
            const closeY = getY(c.close);
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
            const color = isUp ? '#10b981' : '#f43f5e';

            return (
              <g key={c.timestamp || i}>
                {/* شدو (Wick) */}
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1.2"
                  opacity={0.85}
                />
                {/* بدنه (Body) */}
                <rect
                  x={x - candleBodyWidth / 2}
                  y={bodyTop}
                  width={candleBodyWidth}
                  height={bodyHeight}
                  fill={color}
                  rx={1}
                />
              </g>
            );
          })}

          {/* ۴. خطوط سطوح ستاپ معاملاتی فعال هوش مصنوعی (Entry, SL, TP) */}
          {activeCandidate && (
            <g id="candidate-overlay-lines">
              {/* خط ورود لیمیت */}
              <line
                x1={10}
                y1={getY(activeCandidate.entryPrice)}
                x2={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={getY(activeCandidate.entryPrice)}
                stroke="#38bdf8"
                strokeDasharray="4,4"
                strokeWidth="1.5"
              />
              <rect
                x={12}
                y={getClampedLabelY(activeCandidate.entryPrice) - 16}
                width={120}
                height={16}
                fill="#0c4a6e"
                rx={3}
                opacity={0.85}
              />
              <text
                x={16}
                y={getClampedLabelY(activeCandidate.entryPrice) - 4}
                fill="#bae6fd"
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

          {/* ۵. کراس‌هیر تعاملی (Crosshair) */}
          {(hoverState || (crosshairPrice !== null && crosshairPrice !== undefined)) && (() => {
            const activeY = hoverState ? hoverState.y : getY(crosshairPrice!);
            const activePrice = hoverState ? hoverState.price : crosshairPrice!;
            const activeX = hoverState ? hoverState.x : null;

            return (
              <g id="interactive-crosshair" pointerEvents="none">
                {/* خط افقی قیمت */}
                <line
                  x1={10}
                  y1={activeY}
                  x2={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                  y2={activeY}
                  stroke="#06b6d4"
                  strokeDasharray="3,3"
                  strokeWidth="1.2"
                  opacity={0.75}
                />
                {/* برچسب قیمت روی محور عمودی راست */}
                <rect
                  x={containerWidth - RIGHT_PRICE_AXIS_WIDTH}
                  y={activeY - 9}
                  width={RIGHT_PRICE_AXIS_WIDTH - 5}
                  height={18}
                  fill="#0e7490"
                  rx={3}
                />
                <text
                  x={containerWidth - RIGHT_PRICE_AXIS_WIDTH + 4}
                  y={activeY + 4}
                  fill="#ffffff"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {activePrice.toFixed(symbol === 'XAUUSD' ? 2 : 4)}
                </text>

                {/* خط عمودی زمان اگر کاربر روی چارت باشد */}
                {activeX !== null && (
                  <line
                    x1={activeX}
                    y1={PLOT_TOP}
                    x2={activeX}
                    y2={PLOT_BOTTOM}
                    stroke="#06b6d4"
                    strokeDasharray="3,3"
                    strokeWidth="1.2"
                    opacity={0.75}
                  />
                )}
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
};
