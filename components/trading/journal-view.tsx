'use client';

import React, { useState, useEffect } from 'react';
import { TradePosition, JournalAuditEvent, StrategyPerformanceStats } from '@/lib/contracts/journal';
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Award,
  BarChart3,
  Shield,
  Layers,
  History,
  AlertTriangle,
} from 'lucide-react';

export function JournalView() {
  const [activeTab, setActiveTab] = useState<'STATS' | 'POSITIONS' | 'AUDIT'>('STATS');
  const [positions, setPositions] = useState<TradePosition[]>([]);
  const [auditLogs, setAuditLogs] = useState<JournalAuditEvent[]>([]);
  const [statistics, setStatistics] = useState<StrategyPerformanceStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchJournalData = async (isManual = false) => {
    if (isManual) setIsLoading(true);
    try {
      const res = await fetch('/api/journal');
      if (res.ok) {
        const data = await res.json();
        setPositions(data.positions || []);
        setAuditLogs(data.auditLogs || []);
        setStatistics(data.statistics || null);
      }
    } catch {
      // خطا در شبکه
    } finally {
      if (isManual) setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadInitial = async () => {
      try {
        const res = await fetch('/api/journal');
        if (res.ok && isMounted) {
          const data = await res.json();
          setPositions(data.positions || []);
          setAuditLogs(data.auditLogs || []);
          setStatistics(data.statistics || null);
        }
      } catch {
        // نادیده گرفتن خطا
      }
    };

    loadInitial();
    const timer = setInterval(() => {
      if (isMounted) fetchJournalData(false);
    }, 5000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const handleClosePosition = async (positionId: string, exitPrice: number, exitReason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE') => {
    setActionLoading(positionId);
    setFeedback(null);
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLOSE_POSITION',
          positionId,
          exitPrice,
          exitReason,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.message || 'پوزیشن با موفقیت بسته شد.');
        await fetchJournalData();
      } else {
        setFeedback(data.error || 'خطا در بستن پوزیشن.');
      }
    } catch (err) {
      setFeedback('خطای شبکه در ارسال درخواست خروج پوزیشن.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div id="trading-journal-card" className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 text-white flex flex-col gap-4">
      {/* هدر بخش ژورنال */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-100">ژورنال زنده، ثبت لاگ و ارزیابی استراتژی</h3>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                مرحله ۶
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              ارزیابی قطعی عملکرد الگوریتم S0 بر مبنای سود خالص، ضرایب R و ردگیری زنجیره ممیزی
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchJournalData(true)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          <span>بروزرسانی</span>
        </button>
      </div>

      {feedback && (
        <div className="p-2.5 rounded-lg text-xs bg-zinc-800/80 border border-zinc-700 text-zinc-200 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-zinc-200 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* دکمه‌های ناوبری تب‌ها */}
      <div className="flex border-b border-zinc-800 gap-2">
        <button
          onClick={() => setActiveTab('STATS')}
          className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2 ${
            activeTab === 'STATS'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>آمار عملکرد استراتژی</span>
        </button>

        <button
          onClick={() => setActiveTab('POSITIONS')}
          className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2 ${
            activeTab === 'POSITIONS'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>پوزیشن‌های ژورنال ({positions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 transition-all border-b-2 ${
            activeTab === 'AUDIT'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>لاگ ممیزی و ردیابی ({auditLogs.length})</span>
        </button>
      </div>

      {/* محتوای تب آمار عملکرد */}
      {activeTab === 'STATS' && statistics && (
        <div className="space-y-4">
          {/* کارت‌های خلاصه شاخص‌های عملکرد */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/60 flex flex-col">
              <span className="text-[11px] text-zinc-400">نرخ برد (Win Rate)</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-lg font-bold font-mono text-emerald-400">
                  {statistics.winRatePercent}%
                </span>
                <Award className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-[10px] text-zinc-500 mt-1">
                {statistics.winningTrades} برد / {statistics.losingTrades} باخت
              </span>
            </div>

            <div className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/60 flex flex-col">
              <span className="text-[11px] text-zinc-400">ضریب سود (Profit Factor)</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-lg font-bold font-mono text-zinc-100">
                  {statistics.profitFactor >= 99 ? '∞' : statistics.profitFactor}
                </span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-[10px] text-zinc-500 mt-1">
                سود ناخالص: ${statistics.totalGrossProfit}
              </span>
            </div>

            <div className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/60 flex flex-col">
              <span className="text-[11px] text-zinc-400">سود خالص کل (Net PnL)</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`text-lg font-bold font-mono ${
                    statistics.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  ${statistics.totalNetProfit}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 mt-1">
                کارمزد بروکر: ${statistics.totalCommissions}
              </span>
            </div>

            <div className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/60 flex flex-col">
              <span className="text-[11px] text-zinc-400">حداکثر افت (Max DD)</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-lg font-bold font-mono text-rose-400">
                  ${statistics.maxDrawdownDollar}
                </span>
                <span className="text-[10px] font-mono text-rose-300">
                  ({statistics.maxDrawdownPercent}%)
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 mt-1">افت سرمایه قله به دره</span>
            </div>
          </div>

          {/* ردیف دوم شاخص‌ها: امید ریاضی و میانگین ضرایب R */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400">امید ریاضی هر معامله (Expectancy):</span>
              <span className="font-mono font-bold text-emerald-400">
                +${statistics.expectancyDollar} (+{statistics.expectancyR}R)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400">میانگین سود / زیان:</span>
              <span className="font-mono text-zinc-200">
                ${statistics.averageWinAmount} / ${statistics.averageLossAmount}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400">میانگین ضریب R معاملات:</span>
              <span className="font-mono font-bold text-amber-400">
                {statistics.averageRMultiple > 0 ? `+${statistics.averageRMultiple}` : statistics.averageRMultiple}R
              </span>
            </div>
          </div>

          {/* تفکیک آمار بر اساس نمادها */}
          <div className="bg-zinc-950/40 rounded-xl border border-zinc-800/80 p-3">
            <h4 className="text-xs font-bold text-zinc-300 mb-2">تفکیک عملکرد بر حسب نمادهای فعال</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(statistics.bySymbol).map(([sym, symStats]) => (
                <div key={sym} className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-zinc-100">{sym}</span>
                    <span className="text-[10px] text-zinc-500">({symStats.tradesCount} معامله)</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-emerald-400">برد: {symStats.winRatePercent}%</span>
                    <span className={symStats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      ${symStats.netProfit}
                    </span>
                    <span className="text-amber-400">PF: {symStats.profitFactor}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* محتوای تب پوزیشن‌ها */}
      {activeTab === 'POSITIONS' && (
        <div className="space-y-3">
          {positions.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">هیچ پوزیشنی در ژورنال ثبت نشده است.</div>
          ) : (
            positions.map((pos) => {
              const isOpen = pos.status === 'OPEN';
              const isProfit = pos.status === 'CLOSED_PROFIT';

              return (
                <div
                  key={pos.positionId}
                  className={`p-3 rounded-xl border transition-all ${
                    isOpen
                      ? 'bg-blue-950/20 border-blue-800/50'
                      : isProfit
                      ? 'bg-emerald-950/20 border-emerald-800/40'
                      : 'bg-rose-950/20 border-rose-800/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-zinc-200">{pos.positionId}</span>
                      <span className="font-mono text-xs font-bold text-amber-400">{pos.symbol}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold font-mono ${
                          pos.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {pos.direction} ({pos.volumeLots} Lot)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                          isOpen
                            ? 'bg-blue-500/20 text-blue-300 animate-pulse'
                            : isProfit
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {isOpen ? <Clock className="w-3 h-3" /> : isProfit ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{pos.status}</span>
                      </span>

                      {!isOpen && (
                        <span
                          className={`font-mono font-bold text-xs ${
                            (pos.realizedNetPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {pos.realizedNetPnL && pos.realizedNetPnL > 0 ? `+$${pos.realizedNetPnL}` : `$${pos.realizedNetPnL}`} ({pos.realizedRMultiple}R)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-zinc-300 py-1.5 border-t border-b border-zinc-800/60">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">قیمت ورود:</span>
                      <span>{pos.entryPrice}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">حد ضرر (SL):</span>
                      <span className="text-rose-400">{pos.stopLossPrice}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">حد سود (TP):</span>
                      <span className="text-emerald-400">{pos.takeProfitPrice}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">قیمت خروج / دلیل:</span>
                      <span>{pos.exitPrice ? `${pos.exitPrice} (${pos.exitReason})` : 'در جریان...'}</span>
                    </div>
                  </div>

                  {/* دکمه‌های بستن شبیه‌سازی در محیط دمو */}
                  {isOpen && (
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-zinc-400">عملیات دمو:</span>
                      <button
                        onClick={() => handleClosePosition(pos.positionId, pos.takeProfitPrice, 'TP_HIT')}
                        disabled={actionLoading === pos.positionId}
                        className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-600/40 text-[10px] font-bold rounded"
                      >
                        اصابت حد سود (TP Hit)
                      </button>
                      <button
                        onClick={() => handleClosePosition(pos.positionId, pos.stopLossPrice, 'SL_HIT')}
                        disabled={actionLoading === pos.positionId}
                        className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-600/40 text-[10px] font-bold rounded"
                      >
                        اصابت حد ضرر (SL Hit)
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* محتوای تب لاگ ممیزی */}
      {activeTab === 'AUDIT' && (
        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">هیچ رویدادی در لاگ ممیزی ثبت نشده است.</div>
          ) : (
            auditLogs.map((log) => {
              const isCritical = log.severity === 'CRITICAL';
              const isWarn = log.severity === 'WARN';

              return (
                <div
                  key={log.eventId}
                  className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1 ${
                    isCritical
                      ? 'bg-rose-950/20 border-rose-800 text-rose-200'
                      : isWarn
                      ? 'bg-amber-950/20 border-amber-800 text-amber-200'
                      : 'bg-zinc-950/50 border-zinc-800 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold text-amber-400">{log.eventType}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                          isCritical ? 'bg-rose-500/20 text-rose-400' : isWarn ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {log.severity}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString('fa-IR')}
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-zinc-200">{log.details}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[9px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/40">
                    <span>Event: {log.eventId}</span>
                    {log.intentId && <span>Intent: {log.intentId}</span>}
                    {log.correlationId && <span>Corr: {log.correlationId}</span>}
                    {log.causationId && <span>Cause: {log.causationId}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
