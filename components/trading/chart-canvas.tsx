// components/trading/chart-canvas.tsx
// بوم پیشرفته رسم نمودار کندل‌استیک با خط‌کش اندازه‌گیری پیپ (Pip Ruler)، ابزارهای ترسیمی
// و نمای دوگانه چندتایم‌فریمه (Dual-Chart Multi-Timeframe Split View) با کراس‌هیر مشترک و بدون سوگیری زمانی
// سازگار کامل با حالت روز (Light Mode) و شب (Dark Mode) و کاملاً ریسپانسیو

'use client';

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { MultiTimeframeLevel, PercentileStepPoint } from '@/lib/contracts/monte-carlo';
import { useTheme } from '@/context/theme-context';
import { DataWorkbench } from '@/lib/core/data-workbench';
import { DriftMonitor } from '@/lib/core/drift-monitor';
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Columns,
  Square,
  Ruler,
  MousePointer,
  Minus,
  Trash2,
  BoxSelect,
} from 'lucide-react';

export type DrawingToolType = 'cursor' | 'ruler' | 'horizontal' | 'rectangle';

export interface PersistentRuler {
  id: string;
  startPrice: number;
  endPrice: number;
  startIdx: number;
  endIdx: number;
  startTimestamp: number;
  endTimestamp: number;
}

export interface PersistentHorizontalLine {
  id: string;
  price: number;
  color?: string;
}

export interface PersistentRectangle {
  id: string;
  startPrice: number;
  endPrice: number;
  startIdx: number;
  endIdx: number;
  startTimestamp: number;
  endTimestamp: number;
  color?: string;
}

interface ChartCanvasProps {
  symbol: SymbolId;
  candles: Candle[];
  activeCandidate: StrategyCandidate | null;
  multiTimeframeLevels?: MultiTimeframeLevel[];
  monteCarloCone?: PercentileStepPoint[];
  isCrosshairSynced?: boolean;
  onCrosshairChange?: (price: number | null, timestamp: number | null) => void;
  crosshairPrice?: number | null;
  currentPrice?: number;
  macroTrend?: 'BULLISH' | 'BEARISH' | 'RANGING';
  macroLevels?: MultiTimeframeLevel[];
  onOpenMonteCarlo?: () => void;
  onOpenBacktest?: () => void;
  onOpenAlerts?: () => void;
  unreadAlertsCount?: number;
}

interface SingleChartPaneProps {
  symbol: SymbolId;
  candles: Candle[];
  timeframe: string;
  title: string;
  activeCandidate?: StrategyCandidate | null;
  multiTimeframeLevels?: MultiTimeframeLevel[];
  monteCarloCone?: PercentileStepPoint[];
  crosshairPrice: number | null;
  onCrosshairChange?: (price: number | null, timestamp: number | null) => void;
  themeColors: Record<string, string>;
  isSecondary?: boolean;
  chartHeight: number;
  activeTool: DrawingToolType;
  onToolUsed?: () => void;
}

// کامپوننت داخلی رندر مستقل هر پانل چارت SVG همراه با خط‌کش اندازه‌گیری پیپ و ابزارهای ترسیمی
const SingleChartPane: React.FC<SingleChartPaneProps> = ({
  symbol,
  candles,
  timeframe,
  title,
  activeCandidate,
  multiTimeframeLevels = [],
  monteCarloCone = [],
  crosshairPrice,
  onCrosshairChange,
  themeColors,
  isSecondary = false,
  chartHeight,
  activeTool,
  onToolUsed,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(500);
  const [hoverState, setHoverState] = useState<{
    x: number;
    y: number;
    price: number;
    timestamp?: number;
  } | null>(null);

  // وضعیت‌های اختصاصی ابزارهای ترسیمی
  const [rulers, setRulers] = useState<PersistentRuler[]>([]);
  const [activeRulerDraft, setActiveRulerDraft] = useState<PersistentRuler | null>(null);
  const [horizontalLines, setHorizontalLines] = useState<PersistentHorizontalLine[]>([]);
  const [rectangles, setRectangles] = useState<PersistentRectangle[]>([]);
  const [activeRectDraft, setActiveRectDraft] = useState<PersistentRectangle | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const PLOT_TOP = 24;
  const PLOT_BOTTOM = chartHeight - 55;
  const PLOT_HEIGHT = Math.max(100, PLOT_BOTTOM - PLOT_TOP);
  const RIGHT_PRICE_AXIS_WIDTH = 65;

  // پایش عرض واقعی پانل چارت با ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries[0]) return;
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 80) {
        setPaneWidth(w);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!candles || candles.length === 0) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-muted)] text-xs font-sans">
        در انتظار داده‌های کندل {timeframe}...
      </div>
    );
  }

  // محاسبه بازه حداقل و حداکثر قیمت برای محور عمودی Y
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  candles.forEach((c) => {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  });

  if (activeCandidate && !isSecondary) {
    minPrice = Math.min(
      minPrice,
      activeCandidate.entryPrice,
      activeCandidate.stopLossPrice,
      activeCandidate.takeProfitPrice
    );
    maxPrice = Math.max(
      maxPrice,
      activeCandidate.entryPrice,
      activeCandidate.stopLossPrice,
      activeCandidate.takeProfitPrice
    );
  }

  multiTimeframeLevels.forEach((lvl) => {
    if (Math.abs(lvl.price - minPrice) < (maxPrice - minPrice) * 1.5) {
      if (lvl.price < minPrice) minPrice = lvl.price;
      if (lvl.price > maxPrice) maxPrice = lvl.price;
    }
  });

  const priceDiff = maxPrice - minPrice || 1;
  const padding = priceDiff * 0.07;
  const viewMinPrice = minPrice - padding;
  const viewMaxPrice = maxPrice + padding;
  const viewRange = viewMaxPrice - viewMinPrice;

  const getY = (price: number) => {
    const ratio = (price - viewMinPrice) / viewRange;
    return PLOT_BOTTOM - ratio * PLOT_HEIGHT;
  };

  const getPriceAtY = (y: number) => {
    return viewMaxPrice - ((y - PLOT_TOP) / PLOT_HEIGHT) * viewRange;
  };

  const getClampedLabelY = (price: number) => {
    const rawY = getY(price);
    return Math.max(PLOT_TOP + 18, Math.min(PLOT_BOTTOM, rawY));
  };

  const usableWidth = Math.max(150, paneWidth - RIGHT_PRICE_AXIS_WIDTH - 20);
  const candleCount = candles.length;
  const slotWidth = usableWidth / candleCount;
  const candleBodyWidth = Math.max(2, Math.min(16, Math.floor(slotWidth * 0.72)));
  const lastCandle = candles[candles.length - 1];

  const getCandleIdxAtX = (x: number) => {
    return Math.min(candleCount - 1, Math.max(0, Math.floor((x - 10) / slotWidth)));
  };

  const getXForCandleIdx = (idx: number) => {
    return 10 + Math.min(candleCount - 1, Math.max(0, idx)) * slotWidth + slotWidth / 2;
  };

  // رویداد فشردن ماوس جهت شروع ترسیم خط‌کش، باکس یا ثبت خط افقی
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 10 || x > usableWidth || y < PLOT_TOP || y > PLOT_BOTTOM) return;

    const clickedPrice = getPriceAtY(y);
    const clickedIdx = getCandleIdxAtX(x);
    const clickedTimestamp = candles[clickedIdx]?.timestamp || Date.now();

    const isRulerMode = activeTool === 'ruler' || e.shiftKey;

    if (isRulerMode) {
      setIsDrawing(true);
      setActiveRulerDraft({
        id: `RL-DRAFT-${Date.now()}`,
        startPrice: clickedPrice,
        endPrice: clickedPrice,
        startIdx: clickedIdx,
        endIdx: clickedIdx,
        startTimestamp: clickedTimestamp,
        endTimestamp: clickedTimestamp,
      });
      return;
    }

    if (activeTool === 'rectangle') {
      setIsDrawing(true);
      setActiveRectDraft({
        id: `RC-DRAFT-${Date.now()}`,
        startPrice: clickedPrice,
        endPrice: clickedPrice,
        startIdx: clickedIdx,
        endIdx: clickedIdx,
        startTimestamp: clickedTimestamp,
        endTimestamp: clickedTimestamp,
        color: '#a855f7',
      });
      return;
    }

    if (activeTool === 'horizontal') {
      setHorizontalLines((prev) => [
        ...prev,
        {
          id: `HL-${Date.now()}`,
          price: clickedPrice,
          color: '#38bdf8',
        },
      ]);
      if (onToolUsed) onToolUsed();
    }
  };

  // رویداد حرکت ماوس
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 10 || x > usableWidth || y < PLOT_TOP || y > PLOT_BOTTOM) {
      setHoverState(null);
      if (onCrosshairChange) onCrosshairChange(null, null);
      return;
    }

    const price = getPriceAtY(y);
    const candleIdx = getCandleIdxAtX(x);
    const timestamp = candles[candleIdx]?.timestamp;

    setHoverState({ x, y, price, timestamp });
    if (onCrosshairChange) {
      onCrosshairChange(price, timestamp || null);
    }

    // به‌روزرسانی زنده ابزار در حال ترسیم
    if (isDrawing) {
      if (activeRulerDraft) {
        setActiveRulerDraft((prev) =>
          prev
            ? {
                ...prev,
                endPrice: price,
                endIdx: candleIdx,
                endTimestamp: timestamp || prev.endTimestamp,
              }
            : null
        );
      } else if (activeRectDraft) {
        setActiveRectDraft((prev) =>
          prev
            ? {
                ...prev,
                endPrice: price,
                endIdx: candleIdx,
                endTimestamp: timestamp || prev.endTimestamp,
              }
            : null
        );
      }
    }
  };

  // رویداد رها کردن ماوس و تثبیت ترسیم
  const handleMouseUp = () => {
    if (!isDrawing) return;

    if (activeRulerDraft) {
      const pDiff = Math.abs(activeRulerDraft.endPrice - activeRulerDraft.startPrice);
      const bDiff = Math.abs(activeRulerDraft.endIdx - activeRulerDraft.startIdx);
      if (pDiff > 0.0001 || bDiff > 0) {
        setRulers((prev) => [
          ...prev,
          { ...activeRulerDraft, id: `RL-${Date.now()}` },
        ]);
      }
      setActiveRulerDraft(null);
    }

    if (activeRectDraft) {
      const pDiff = Math.abs(activeRectDraft.endPrice - activeRectDraft.startPrice);
      const bDiff = Math.abs(activeRectDraft.endIdx - activeRectDraft.startIdx);
      if (pDiff > 0.0001 || bDiff > 0) {
        setRectangles((prev) => [
          ...prev,
          { ...activeRectDraft, id: `RC-${Date.now()}` },
        ]);
      }
      setActiveRectDraft(null);
    }

    setIsDrawing(false);
    if (onToolUsed && activeTool !== 'cursor') {
      onToolUsed();
    }
  };

  const handleMouseLeave = () => {
    setHoverState(null);
    if (onCrosshairChange) onCrosshairChange(null, null);
    if (isDrawing) {
      handleMouseUp();
    }
  };

  const removeRuler = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRulers((prev) => prev.filter((r) => r.id !== id));
  };

  const removeHorizontalLine = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHorizontalLines((prev) => prev.filter((h) => h.id !== id));
  };

  const removeRectangle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRectangles((prev) => prev.filter((rc) => rc.id !== id));
  };

  const gridLines = [0.2, 0.4, 0.6, 0.8].map((ratio) => {
    const p = viewMinPrice + ratio * viewRange;
    return { y: getY(p), price: p };
  });

  const pipSize = DriftMonitor.getPipSize(symbol);
  const allRulersToRender = activeRulerDraft ? [...rulers, activeRulerDraft] : rulers;
  const allRectsToRender = activeRectDraft ? [...rectangles, activeRectDraft] : rectangles;

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-2.5 flex flex-col relative overflow-hidden select-none"
    >
      {/* سربرگ پانل چارت */}
      <div className="flex items-center justify-between mb-1 px-1 text-xs shrink-0 font-sans">
        <div className="flex items-center gap-1.5 font-mono flex-wrap">
          <span className="font-bold text-[var(--text-primary)]">{title}</span>
          <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20 text-[10px]">
            {timeframe}
          </span>
          <span className="text-emerald-500 font-bold text-[11px]">
            ${lastCandle.close.toFixed(symbol === 'XAUUSD' ? 2 : 5)}
          </span>
        </div>

        <div className="text-[10px] text-[var(--text-muted)] font-mono flex items-center gap-2">
          {hoverState && (
            <span className="text-cyan-400 font-bold bg-[var(--bg-surface)] px-1.5 py-0.2 rounded border border-cyan-500/30">
              {hoverState.price.toFixed(symbol === 'XAUUSD' ? 2 : 5)}
            </span>
          )}
          <span>{candles.length} کندل</span>
          {activeTool === 'ruler' && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30 text-[9px] animate-pulse">
              📏 خط‌کش فعال (درگ کنید)
            </span>
          )}
        </div>
      </div>

      {/* ناحیه بوم SVG رسم کندل‌ها، خط‌کش و ابزارهای ترسیمی */}
      <div className="flex-1 w-full relative min-h-0 overflow-hidden">
        <svg
          width={paneWidth}
          height={chartHeight - 50}
          className={`overflow-visible ${
            activeTool === 'ruler' || activeTool === 'rectangle'
              ? 'cursor-crosshair'
              : activeTool === 'horizontal'
              ? 'cursor-row-resize'
              : 'cursor-crosshair'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          {/* خطوط پس‌زمینه شبکه قیمت */}
          {gridLines.map((g, idx) => (
            <g key={idx}>
              <line
                x1={10}
                y1={g.y}
                x2={paneWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={g.y}
                stroke={themeColors.gridLine}
                strokeDasharray="2,3"
                strokeWidth="1"
              />
              <text
                x={paneWidth - RIGHT_PRICE_AXIS_WIDTH + 8}
                y={g.y + 4}
                fill={themeColors.axisText}
                fontSize="9"
                fontFamily="monospace"
              >
                {g.price.toFixed(symbol === 'XAUUSD' ? 1 : 4)}
              </text>
            </g>
          ))}

          {/* ۱. سطوح کلان چندتایم‌فریمه */}
          {multiTimeframeLevels.map((lvl) => {
            const y = getY(lvl.price);
            if (y < PLOT_TOP || y > PLOT_BOTTOM) return null;

            return (
              <g key={lvl.id}>
                <line
                  x1={10}
                  y1={y}
                  x2={paneWidth - RIGHT_PRICE_AXIS_WIDTH}
                  y2={y}
                  stroke={lvl.color || '#06b6d4'}
                  strokeDasharray="4,4"
                  strokeWidth="1.2"
                  opacity={0.85}
                />
                <rect
                  x={paneWidth - RIGHT_PRICE_AXIS_WIDTH - 85}
                  y={y - 12}
                  width={80}
                  height={12}
                  fill={themeColors.levelTagBg}
                  stroke={lvl.color || '#06b6d4'}
                  strokeWidth="0.8"
                  rx={3}
                  opacity={0.95}
                />
                <text
                  x={paneWidth - RIGHT_PRICE_AXIS_WIDTH - 45}
                  y={y - 3}
                  fill={lvl.color || '#0284c7'}
                  fontSize="8"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {lvl.labelFa.slice(0, 10)}
                </text>
              </g>
            );
          })}

          {/* ۲. مخروط استوکاستیک مونت‌کارلو (تنها در چارت اصلی) */}
          {!isSecondary && monteCarloCone.length > 1 && (() => {
            const lastX = 10 + (candleCount - 1) * slotWidth + slotWidth / 2;
            const stepPx = 3.5;

            const p5ToP95Points = [
              ...monteCarloCone.map(
                (pt, i) => `${(lastX + i * stepPx).toFixed(1)},${getY(pt.p95).toFixed(1)}`
              ),
              ...[...monteCarloCone].reverse().map((pt, i) => {
                const origIdx = monteCarloCone.length - 1 - i;
                return `${(lastX + origIdx * stepPx).toFixed(1)},${getY(pt.p5).toFixed(1)}`;
              }),
            ].join(' ');

            const p25ToP75Points = [
              ...monteCarloCone.map(
                (pt, i) => `${(lastX + i * stepPx).toFixed(1)},${getY(pt.p75).toFixed(1)}`
              ),
              ...[...monteCarloCone].reverse().map((pt, i) => {
                const origIdx = monteCarloCone.length - 1 - i;
                return `${(lastX + origIdx * stepPx).toFixed(1)},${getY(pt.p25).toFixed(1)}`;
              }),
            ].join(' ');

            const p50Points = monteCarloCone
              .map((pt, i) => `${(lastX + i * stepPx).toFixed(1)},${getY(pt.p50).toFixed(1)}`)
              .join(' ');

            return (
              <g id="monte-carlo-cone-layer" opacity={0.65}>
                <polygon points={p5ToP95Points} fill="#a855f7" opacity={0.15} />
                <polygon points={p25ToP75Points} fill="#a855f7" opacity={0.25} />
                <polyline
                  points={p50Points}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.5"
                  strokeDasharray="3,2"
                />
              </g>
            );
          })()}

          {/* ۳. ترسیم کندل‌ها (OHLC Candlesticks) */}
          {candles.map((c, i) => {
            const x = 10 + i * slotWidth + slotWidth / 2;
            const isUp = c.close >= c.open;
            const highY = getY(c.high);
            const lowY = getY(c.low);
            const openY = getY(c.open);
            const closeY = getY(c.close);
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
            const color = isUp ? themeColors.bullishCandle : themeColors.bearishCandle;

            return (
              <g key={c.timestamp || i}>
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1.2"
                  opacity={0.85}
                />
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

          {/* ۴. خطوط ستاپ معاملاتی فعال هوش مصنوعی (در چارت اصلی) */}
          {activeCandidate && !isSecondary && (
            <g id="candidate-overlay-layer">
              <line
                x1={10}
                y1={getY(activeCandidate.entryPrice)}
                x2={paneWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={getY(activeCandidate.entryPrice)}
                stroke={themeColors.entryLine}
                strokeDasharray="4,4"
                strokeWidth="1.5"
              />
              <rect
                x={12}
                y={getClampedLabelY(activeCandidate.entryPrice) - 15}
                width={110}
                height={15}
                fill={themeColors.entryBg}
                rx={3}
                opacity={0.9}
              />
              <text
                x={16}
                y={getClampedLabelY(activeCandidate.entryPrice) - 4}
                fill={themeColors.entryText}
                fontSize="9"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                ورود: {activeCandidate.entryPrice}
              </text>

              {/* خط حد ضرر */}
              <line
                x1={10}
                y1={getY(activeCandidate.stopLossPrice)}
                x2={paneWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={getY(activeCandidate.stopLossPrice)}
                stroke={themeColors.slLine}
                strokeWidth="1.5"
              />
              <rect
                x={12}
                y={getClampedLabelY(activeCandidate.stopLossPrice) - 15}
                width={110}
                height={15}
                fill={themeColors.slBg}
                rx={3}
                opacity={0.9}
              />
              <text
                x={16}
                y={getClampedLabelY(activeCandidate.stopLossPrice) - 4}
                fill={themeColors.slText}
                fontSize="9"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                حد ضرر: {activeCandidate.stopLossPrice}
              </text>

              {/* خط حد سود */}
              <line
                x1={10}
                y1={getY(activeCandidate.takeProfitPrice)}
                x2={paneWidth - RIGHT_PRICE_AXIS_WIDTH}
                y2={getY(activeCandidate.takeProfitPrice)}
                stroke={themeColors.tpLine}
                strokeWidth="1.5"
              />
              <rect
                x={12}
                y={getClampedLabelY(activeCandidate.takeProfitPrice) - 15}
                width={110}
                height={15}
                fill={themeColors.tpBg}
                rx={3}
                opacity={0.9}
              />
              <text
                x={16}
                y={getClampedLabelY(activeCandidate.takeProfitPrice) - 4}
                fill={themeColors.tpText}
                fontSize="9"
                fontFamily="sans-serif"
                fontWeight="bold"
              >
                تارگت سود: {activeCandidate.takeProfitPrice}
              </text>
            </g>
          )}

          {/* ۵. ترسیم خطوط افقی تراز نقدینگی کاربر (Horizontal Rays) */}
          {horizontalLines.map((hl) => {
            const y = getY(hl.price);
            if (y < PLOT_TOP || y > PLOT_BOTTOM) return null;

            return (
              <g key={hl.id} className="group">
                <line
                  x1={10}
                  y1={y}
                  x2={paneWidth - RIGHT_PRICE_AXIS_WIDTH}
                  y2={y}
                  stroke={hl.color || '#38bdf8'}
                  strokeWidth="1.5"
                  strokeDasharray="4,4"
                  opacity={0.9}
                />
                <rect
                  x={12}
                  y={y - 10}
                  width={75}
                  height={15}
                  rx={3}
                  fill="#0f172a"
                  stroke={hl.color || '#38bdf8'}
                  strokeWidth="1"
                />
                <text
                  x={16}
                  y={y + 1}
                  fill={hl.color || '#38bdf8'}
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  HL: {hl.price.toFixed(symbol === 'XAUUSD' ? 2 : 4)}
                </text>
                <g
                  onClick={(e) => removeHorizontalLine(hl.id, e)}
                  className="cursor-pointer"
                >
                  <circle cx={92} cy={y - 2} r={6} fill="#ef4444" opacity={0.8} />
                  <text x={92} y={y + 1} fill="#ffffff" fontSize="8" textAnchor="middle">
                    ✕
                  </text>
                </g>
              </g>
            );
          })}

          {/* ۶. ترسیم باکس‌های محدوده نقدینگی / اوردربلاک / FVG */}
          {allRectsToRender.map((rc) => {
            const x1 = getXForCandleIdx(rc.startIdx);
            const x2 = getXForCandleIdx(rc.endIdx);
            const y1 = getY(rc.startPrice);
            const y2 = getY(rc.endPrice);

            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            const w = Math.max(4, maxX - minX);
            const h = Math.max(4, maxY - minY);

            return (
              <g key={rc.id}>
                <rect
                  x={minX}
                  y={minY}
                  width={w}
                  height={h}
                  fill="rgba(168, 85, 247, 0.15)"
                  stroke="#a855f7"
                  strokeWidth="1.2"
                  strokeDasharray="3,2"
                  rx={4}
                />
                <text
                  x={minX + 6}
                  y={minY + 12}
                  fill="#c084fc"
                  fontSize="9"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                >
                  Zone / FVG
                </text>
                {!rc.id.includes('DRAFT') && (
                  <g
                    onClick={(e) => removeRectangle(rc.id, e)}
                    className="cursor-pointer"
                  >
                    <circle cx={maxX - 8} cy={minY + 8} r={6} fill="#ef4444" opacity={0.8} />
                    <text x={maxX - 8} y={minY + 11} fill="#ffffff" fontSize="8" textAnchor="middle">
                      ✕
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ۷. ابزار ستاره: خط‌کش اندازه‌گیری پیپ و درصد (Pip & Time Measurement Ruler) */}
          {allRulersToRender.map((r) => {
            const x1 = getXForCandleIdx(r.startIdx);
            const x2 = getXForCandleIdx(r.endIdx);
            const y1 = getY(r.startPrice);
            const y2 = getY(r.endPrice);

            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            const w = Math.max(2, maxX - minX);
            const h = Math.max(2, maxY - minY);

            const isUp = r.endPrice >= r.startPrice;
            const strokeColor = isUp ? '#10b981' : '#f43f5e';
            const fillColor = isUp ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)';

            const priceDiff = r.endPrice - r.startPrice;
            const pipsDiff = Number((priceDiff / pipSize).toFixed(1));
            const percentDiff = Number((((r.endPrice - r.startPrice) / r.startPrice) * 100).toFixed(2));
            const bars = Math.abs(r.endIdx - r.startIdx) + 1;
            const timeMinutes = bars * (timeframe === '15M' ? 15 : timeframe === '1H' ? 60 : 5);
            const timeStr =
              timeMinutes >= 60
                ? `${Math.floor(timeMinutes / 60)}h ${timeMinutes % 60}m`
                : `${timeMinutes}m`;

            // موقعیت قرارگیری هوشمند کارت HUD اندازه‌گیری
            const cardWidth = 168;
            const cardHeight = 52;
            let cardX = Math.min(usableWidth - cardWidth, Math.max(15, (minX + maxX) / 2 - cardWidth / 2));
            let cardY = minY - cardHeight - 8;
            if (cardY < PLOT_TOP + 5) {
              cardY = maxY + 10;
            }

            return (
              <g key={r.id} id={`ruler-${r.id}`}>
                {/* سایه روشن و حاشیه محدوده خط‌کش */}
                <rect
                  x={minX}
                  y={minY}
                  width={w}
                  height={h}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth="1.2"
                  strokeDasharray="4,3"
                  rx={4}
                />

                {/* بردار قطری خط‌کش */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeWidth="1.6"
                />

                {/* نقاط ابتدا و انتهای خط‌کش */}
                <circle cx={x1} cy={y1} r={3.5} fill={strokeColor} />
                <circle cx={x2} cy={y2} r={3.5} fill={strokeColor} />

                {/* کارت نمایشگر شناور مشخصات اندازه‌گیری (HUD Floating Card) */}
                <rect
                  x={cardX}
                  y={cardY}
                  width={cardWidth}
                  height={cardHeight}
                  rx={8}
                  fill="#0b0f19"
                  stroke={strokeColor}
                  strokeWidth="1.2"
                  filter="drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5))"
                />

                {/* خط اول کارت: پیپ و درصد */}
                <text
                  x={cardX + 10}
                  y={cardY + 18}
                  fill={strokeColor}
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {isUp ? '+' : ''}{pipsDiff} pips ({isUp ? '+' : ''}{percentDiff}%)
                </text>

                {/* خط دوم کارت: تغییر قیمت دلاری و تعداد کندل */}
                <text
                  x={cardX + 10}
                  y={cardY + 33}
                  fill="#f8fafc"
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  Δ {isUp ? '+' : ''}${Math.abs(priceDiff).toFixed(symbol === 'XAUUSD' ? 2 : 4)}
                </text>

                {/* خط سوم کارت: مدت زمان و تعداد بارها */}
                <text
                  x={cardX + 10}
                  y={cardY + 45}
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="sans-serif"
                >
                  {bars} کندل • {timeStr}
                </text>

                {/* دکمه حذف اندازه خط‌کش */}
                {!r.id.includes('DRAFT') && (
                  <g
                    onClick={(e) => removeRuler(r.id, e)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={cardX + cardWidth - 22}
                      y={cardY + 6}
                      width={16}
                      height={16}
                      rx={4}
                      fill="#1e293b"
                    />
                    <text
                      x={cardX + cardWidth - 14}
                      y={cardY + 18}
                      fill="#f43f5e"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      ✕
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ۸. کراس‌هیر تعاملی مشترک و همگام (Crosshair Overlay) */}
          {(() => {
            const hasHover = hoverState !== null;
            const hasSyncedPrice = crosshairPrice !== null;
            if (!hasHover && !hasSyncedPrice) return null;

            const effectivePrice = hasHover ? hoverState.price : crosshairPrice!;
            const activeY = getY(effectivePrice);
            if (activeY < PLOT_TOP || activeY > PLOT_BOTTOM) return null;

            const activeX = hasHover ? hoverState.x : null;

            return (
              <g id="interactive-crosshair-sync" pointerEvents="none">
                <line
                  x1={10}
                  y1={activeY}
                  x2={paneWidth - RIGHT_PRICE_AXIS_WIDTH}
                  y2={activeY}
                  stroke={themeColors.crosshairLine}
                  strokeDasharray="3,3"
                  strokeWidth="1.2"
                  opacity={0.8}
                />
                <rect
                  x={paneWidth - RIGHT_PRICE_AXIS_WIDTH}
                  y={activeY - 9}
                  width={RIGHT_PRICE_AXIS_WIDTH - 5}
                  height={18}
                  fill={themeColors.crosshairBg}
                  rx={3}
                />
                <text
                  x={paneWidth - RIGHT_PRICE_AXIS_WIDTH + 4}
                  y={activeY + 4}
                  fill="#ffffff"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {effectivePrice.toFixed(symbol === 'XAUUSD' ? 2 : 4)}
                </text>

                {activeX !== null && (
                  <line
                    x1={activeX}
                    y1={PLOT_TOP}
                    x2={activeX}
                    y2={PLOT_BOTTOM}
                    stroke={themeColors.crosshairLine}
                    strokeDasharray="3,3"
                    strokeWidth="1.2"
                    opacity={0.8}
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

export const ChartCanvas: React.FC<ChartCanvasProps> = ({
  symbol,
  candles,
  activeCandidate,
  multiTimeframeLevels = [],
  monteCarloCone = [],
  onCrosshairChange,
  crosshairPrice = null,
}) => {
  const [isSplitView, setIsSplitView] = useState(false);
  const [secondaryTimeframe, setSecondaryTimeframe] = useState<Timeframe>('15M');
  const [visibleCandleCount, setVisibleCandleCount] = useState(80);
  const [isExpanded, setIsExpanded] = useState(false);
  const [internalCrosshairPrice, setInternalCrosshairPrice] = useState<number | null>(null);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingToolType>('cursor');

  const { actualTheme } = useTheme();
  const isDark = actualTheme === 'dark';

  // پالت رنگ‌های هماهنگ با قالب فعال
  const themeColors = useMemo(
    () => ({
      gridLine: isDark ? '#1e293b' : '#e2e8f0',
      axisText: '#64748b',
      bullishCandle: isDark ? '#10b981' : '#059669',
      bearishCandle: isDark ? '#f43f5e' : '#dc2626',
      entryLine: isDark ? '#38bdf8' : '#0284c7',
      entryBg: isDark ? '#0c4a6e' : '#0284c7',
      entryText: '#ffffff',
      slLine: isDark ? '#f43f5e' : '#dc2626',
      slBg: isDark ? '#4c0519' : '#dc2626',
      slText: '#ffffff',
      tpLine: isDark ? '#10b981' : '#16a34a',
      tpBg: isDark ? '#022c22' : '#16a34a',
      tpText: '#ffffff',
      levelTagBg: isDark ? '#0f172a' : '#ffffff',
      crosshairLine: isDark ? '#06b6d4' : '#0284c7',
      crosshairBg: isDark ? '#0e7490' : '#0284c7',
    }),
    [isDark]
  );

  // کندل‌های نمایان چارت اولیه ۵ دقیقه‌ای
  const visibleCandles = useMemo(
    () => candles.slice(-Math.max(1, Math.min(visibleCandleCount, candles.length))),
    [candles, visibleCandleCount]
  );

  // تولید کندل‌های کلان چارت دوم به صورت بدون سوگیری زمانی
  const secondaryCandles = useMemo(() => {
    if (!isSplitView || !candles || candles.length === 0) return [];
    return DataWorkbench.aggregateCandles(candles, secondaryTimeframe);
  }, [isSplitView, candles, secondaryTimeframe]);

  const visibleSecondaryCandles = useMemo(() => {
    const count = Math.max(15, Math.floor(visibleCandleCount / (secondaryTimeframe === '15M' ? 2.5 : 5)));
    return secondaryCandles.slice(-Math.min(count, secondaryCandles.length));
  }, [secondaryCandles, visibleCandleCount, secondaryTimeframe]);

  // مدیریت کراس‌هیر مشترک دوسویه
  const handleCrosshairUpdate = useCallback(
    (price: number | null, timestamp: number | null) => {
      setInternalCrosshairPrice(price);
      if (onCrosshairChange) {
        onCrosshairChange(price, timestamp);
      }
    },
    [onCrosshairChange]
  );

  const activeCrosshairPrice = crosshairPrice !== null ? crosshairPrice : internalCrosshairPrice;

  const CHART_TOTAL_HEIGHT = isExpanded ? 640 : isSplitView ? 340 : 360;

  if (!candles || candles.length === 0) {
    return (
      <div className="w-full h-[360px] flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl text-[var(--text-muted)] text-xs font-sans">
        در حال بارگذاری کندل‌های بازار...
      </div>
    );
  }

  const lastCandle = visibleCandles[visibleCandles.length - 1];

  return (
    <div
      id="chart-main-container"
      className={`w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-3 flex flex-col relative select-none font-sans shadow-xs transition-all ${
        isExpanded
          ? 'fixed inset-3 md:inset-6 z-[100] h-[calc(100vh-1.5rem)] md:h-[calc(100vh-3rem)] shadow-2xl overflow-y-auto'
          : 'h-auto min-h-[380px]'
      }`}
    >
      {/* نوار ابزار مستر بالای چارت: نماد، انتخابگر ابزارهای ترسیمی (خط‌کش و باکس)، سوئیچ نمای دوگانه، زوم و تمام‌صفحه */}
      <div className="flex flex-wrap items-center justify-between mb-2.5 px-1 text-xs shrink-0 gap-2 border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-2 font-mono flex-wrap">
          <span className="font-bold text-base text-[var(--text-primary)]">{symbol}</span>
          <span className="text-emerald-500 font-bold">
            ${lastCandle.close.toFixed(symbol === 'XAUUSD' ? 2 : 5)}
          </span>

          {/* برچسب‌های وضعیت */}
          <div className="hidden sm:flex items-center gap-1 text-[10px] font-sans">
            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              بستر: H1/4H ({activeCandidate ? (activeCandidate.direction === 'BUY' ? 'صعودی' : 'نزولی') : 'خنثی'})
            </span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 font-bold">
              ورود: 5M
            </span>
          </div>
        </div>

        {/* بخش ابزارهای تعاملی: پالت ابزارهای ترسیمی + سوئیچ نما + زوم + فول‌اسکرین */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* پالت ابزارهای ترسیمی تعاملی و خط‌کش اندازه‌گیری پیپ */}
          <div className="flex items-center bg-[var(--bg-canvas)] rounded-lg p-0.5 border border-[var(--border-subtle)] text-[11px]">
            <button
              type="button"
              onClick={() => setActiveDrawingTool('cursor')}
              className={`p-1.5 rounded-md transition-all ${
                activeDrawingTool === 'cursor'
                  ? 'bg-slate-700 text-white font-bold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="نشانگر عادی (پیمایش و کراس‌هیر)"
              aria-label="نشانگر عادی"
            >
              <MousePointer className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveDrawingTool(activeDrawingTool === 'ruler' ? 'cursor' : 'ruler')
              }
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                activeDrawingTool === 'ruler'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-amber-400'
              }`}
              title="خط‌کش اندازه‌گیری پیپ، درصد و کندل‌ها (کلیک و درگ روی چارت یا نگه‌داشتن Shift)"
              aria-label="خط‌کش اندازه‌گیری پیپ"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-bold">خط‌کش پیپ</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveDrawingTool(activeDrawingTool === 'horizontal' ? 'cursor' : 'horizontal')
              }
              className={`p-1.5 rounded-md transition-all ${
                activeDrawingTool === 'horizontal'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-cyan-400'
              }`}
              title="خط افقی تراز قیمت (کلیک روی سطح مورد نظر)"
              aria-label="خط افقی تراز قیمت"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveDrawingTool(activeDrawingTool === 'rectangle' ? 'cursor' : 'rectangle')
              }
              className={`p-1.5 rounded-md transition-all ${
                activeDrawingTool === 'rectangle'
                  ? 'bg-purple-500 text-slate-950 font-bold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-purple-400'
              }`}
              title="باکس محدوده نقدینگی / اوردربلاک / FVG"
              aria-label="باکس محدوده نقدینگی"
            >
              <BoxSelect className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* دکمه‌های سوئیچ تک‌چارت / نمای دوگانه */}
          <div className="flex items-center bg-[var(--bg-canvas)] rounded-lg p-0.5 border border-[var(--border-subtle)] text-[11px]">
            <button
              type="button"
              onClick={() => setIsSplitView(false)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                !isSplitView
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="نمای تک‌چارت ۵ دقیقه‌ای"
            >
              <Square className="w-3 h-3" />
              <span className="hidden sm:inline">تک‌چارت</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSplitView(true)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                isSplitView
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="نمای دوگانه همگام چندتایم‌فریمه"
            >
              <Columns className="w-3 h-3" />
              <span className="font-semibold">نمای دوگانه</span>
            </button>
          </div>

          {/* در صورت فعال بودن نمای دوگانه: انتخابگر تایم‌فریم ثانویه */}
          {isSplitView && (
            <div className="flex items-center bg-[var(--bg-canvas)] rounded-lg p-0.5 border border-[var(--border-subtle)] text-[11px] font-mono">
              {(['15M', '1H', '4H'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setSecondaryTimeframe(tf)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    secondaryTimeframe === tf
                      ? 'bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}

          {/* کنترل‌های بزرگ‌نمایی و تمام‌صفحه */}
          <div className="flex items-center gap-1 border-r border-[var(--border-subtle)] pr-2">
            <button
              type="button"
              onClick={() => setVisibleCandleCount((count) => Math.max(20, Math.floor(count / 1.5)))}
              disabled={visibleCandles.length <= 20}
              className="p-1 rounded hover:bg-[var(--bg-surface-raised)] disabled:opacity-40"
              title="بزرگ‌نمایی کندل‌ها"
              aria-label="بزرگ‌نمایی نمودار"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setVisibleCandleCount((count) => Math.min(candles.length, Math.ceil(count * 1.5)))}
              disabled={visibleCandles.length >= candles.length}
              className="p-1 rounded hover:bg-[var(--bg-surface-raised)] disabled:opacity-40"
              title="کوچک‌نمایی کندل‌ها"
              aria-label="کوچک‌نمایی نمودار"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded((value) => !value)}
              className="p-1 rounded hover:bg-[var(--bg-surface-raised)]"
              title={isExpanded ? 'بستن نمای بزرگ' : 'تمام‌صفحه نمودار'}
              aria-label={isExpanded ? 'بستن نمای بزرگ نمودار' : 'نمای بزرگ نمودار'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ناحیه رندر چارت‌ها: تک‌چارت یا شبکه دو ستونه موازی با خط‌کش و کراس‌هیر همگام */}
      {!isSplitView ? (
        <div className="flex-1 w-full min-h-0 flex flex-col">
          <SingleChartPane
            symbol={symbol}
            candles={visibleCandles}
            timeframe="5M"
            title={`نمودار تحلیلی و ورود ۵ دقیقه‌ای`}
            activeCandidate={activeCandidate}
            multiTimeframeLevels={multiTimeframeLevels}
            monteCarloCone={monteCarloCone}
            crosshairPrice={activeCrosshairPrice}
            onCrosshairChange={handleCrosshairUpdate}
            themeColors={themeColors}
            chartHeight={CHART_TOTAL_HEIGHT}
            activeTool={activeDrawingTool}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 w-full flex-1 min-h-0">
          {/* چارت اول: تایم‌فریم ورود ۵ دقیقه‌ای (Execution Chart) */}
          <SingleChartPane
            symbol={symbol}
            candles={visibleCandles}
            timeframe="5M"
            title="چارت ۱: ورود و نقدینگی ریزساختار"
            activeCandidate={activeCandidate}
            multiTimeframeLevels={multiTimeframeLevels}
            monteCarloCone={monteCarloCone}
            crosshairPrice={activeCrosshairPrice}
            onCrosshairChange={handleCrosshairUpdate}
            themeColors={themeColors}
            chartHeight={CHART_TOTAL_HEIGHT}
            activeTool={activeDrawingTool}
          />

          {/* چارت دوم: تایم‌فریم کلان تجمیع‌شده (Macro Context Chart) */}
          <SingleChartPane
            symbol={symbol}
            candles={visibleSecondaryCandles}
            timeframe={secondaryTimeframe}
            title={`چارت ۲: ساختار روند کلان`}
            activeCandidate={activeCandidate}
            multiTimeframeLevels={multiTimeframeLevels}
            monteCarloCone={[]}
            crosshairPrice={activeCrosshairPrice}
            onCrosshairChange={handleCrosshairUpdate}
            themeColors={themeColors}
            isSecondary={true}
            chartHeight={CHART_TOTAL_HEIGHT}
            activeTool={activeDrawingTool}
          />
        </div>
      )}
    </div>
  );
};
