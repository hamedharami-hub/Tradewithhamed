// lib/core/__tests__/signal-alerts.test.ts
// آزمون‌های جامع دیسپچر هشدارهای خودکار چندتایم‌فریمه و سیستم اعلان‌های هوشمند

import { SignalAlertDispatcher } from '../signal-alert-dispatcher';
import { SignalAlert, DEFAULT_ALERT_DISPATCHER_CONFIG } from '../../contracts/alerts';
import { StrategyCandidate } from '../../contracts/strategy';
import { MarketRegimeAnalysis } from '../../contracts/regimes';
import { MultiAgentPipelineResult, DEFAULT_MULTI_AGENT_CONFIG } from '../../contracts/multi-agent-system';
import { MultiAgentOrchestrator } from '../multi-agent-orchestrator';
import { MonteCarloSimulationResult } from '../../contracts/monte-carlo';

export interface TestResultItem {
  name: string;
  passed: boolean;
  details: string;
}

export function runSignalAlertsTestSuite(): TestResultItem[] {
  const results: TestResultItem[] = [];

  // ریست وضعیت برای شروع تست‌ها
  SignalAlertDispatcher.clearAlerts();
  SignalAlertDispatcher.updateConfig(DEFAULT_ALERT_DISPATCHER_CONFIG);

  // ۱. بررسی تنظیمات پیش‌فرض و به‌روزرسانی پیکربندی
  try {
    const initialConfig = SignalAlertDispatcher.getConfig();
    const defaultsValid = initialConfig.enableAudio === true &&
                          initialConfig.minAlphaConsensusScore === 70 &&
                          initialConfig.minMonteCarloTpProbability === 60 &&
                          initialConfig.activeStyles.length === 4;

    const updated = SignalAlertDispatcher.updateConfig({
      minAlphaConsensusScore: 75,
      minMonteCarloTpProbability: 65,
    });

    const updateValid = updated.minAlphaConsensusScore === 75 &&
                        updated.minMonteCarloTpProbability === 65;

    results.push({
      name: '[Signal Alerts] Configuration Defaults & Dynamic Mutation',
      passed: defaultsValid && updateValid,
      details: `تنظیمات پیش‌فرض: معتبر (${initialConfig.minAlphaConsensusScore}٪ شورا) | به‌روزرسانی به: ${updated.minAlphaConsensusScore}٪ شورا`,
    });
  } catch (err) {
    results.push({
      name: '[Signal Alerts] Configuration Defaults & Dynamic Mutation',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. آزمون ثبت، شمارش خوانده‌نشده، خوانده‌شدن همه و کول‌داون ضد اسپم
  try {
    SignalAlertDispatcher.clearAlerts();
    SignalAlertDispatcher.updateConfig({ cooldownMs: 60000 });

    const sampleAlert: SignalAlert = {
      id: 'TEST-ALERT-01',
      timestamp: Date.now(),
      symbol: 'XAUUSD',
      timeframe: '5M',
      triggerType: 'ALPHA_COUNCIL_QUORUM',
      severity: 'SUCCESS',
      titleFa: 'تست تایید شورا',
      titleEn: 'Test Council Approval',
      messageFa: 'پیام تست شورا',
      messageEn: 'Test message',
      direction: 'BUY',
      priceAtTrigger: 2050.0,
      isRead: false,
    };

    SignalAlertDispatcher.dispatchAlert(sampleAlert);

    const alertsAfter1 = SignalAlertDispatcher.getAlerts();
    const unread1 = SignalAlertDispatcher.getUnreadCount();

    // تلاش برای ارسال مجدد همان هشدار در فاصله کول‌داون
    SignalAlertDispatcher.dispatchAlert({
      ...sampleAlert,
      id: 'TEST-ALERT-02',
    });

    const alertsAfterSpam = SignalAlertDispatcher.getAlerts();

    // علامت‌گذاری به عنوان خوانده شده
    SignalAlertDispatcher.markAllAsRead();
    const unreadAfterMark = SignalAlertDispatcher.getUnreadCount();

    const passed = alertsAfter1.length === 1 &&
                   unread1 === 1 &&
                   alertsAfterSpam.length === 1 &&
                   unreadAfterMark === 0;

    results.push({
      name: '[Signal Alerts] Dispatch, Unread Counting & Anti-Spam Cooldown',
      passed,
      details: `تعداد هشدار: ${alertsAfter1.length} | خوانده‌نشده: ${unread1} | جلوگیری از اسپم در کول‌داون: ${alertsAfterSpam.length === 1 ? 'موفق' : 'ناموفق'} | پس از خواندن: ${unreadAfterMark}`,
    });
  } catch (err) {
    results.push({
      name: '[Signal Alerts] Dispatch, Unread Counting & Anti-Spam Cooldown',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. آزمون ارزیابی خودکار تغییر رژیم بازار (Market Regime Shift Trigger)
  try {
    SignalAlertDispatcher.clearAlerts();
    SignalAlertDispatcher.updateConfig({ cooldownMs: 0 });

    const regimeAnalysis1: MarketRegimeAnalysis = {
      regime: 'CHOPPY_RANGING',
      headlineFa: 'رنج فشرده',
      summaryFa: 'بازار بدون روند',
      confidence: 85,
      recommendedStyles: ['SCALP_M1_M5'],
      blockedStyles: ['SWING_MACRO'],
      metrics: {
        adxTrendStrength: 15,
        emaSlope: 0,
        atrRatio: 1.0,
        compressionRatio: 1.0,
        volumeZScore: 0,
        priceVsEmaPercent: 0,
      },
      timestamp: Date.now(),
    };

    SignalAlertDispatcher.evaluateMarketState({
      symbol: 'XAUUSD',
      timeframe: '5M',
      currentPrice: 2050.0,
      regimeAnalysis: regimeAnalysis1,
    });

    const regimeAnalysis2: MarketRegimeAnalysis = {
      ...regimeAnalysis1,
      regime: 'HIGH_VOL_NEWS',
      headlineFa: 'شوک نوسانی شدید',
    };

    const triggered = SignalAlertDispatcher.evaluateMarketState({
      symbol: 'XAUUSD',
      timeframe: '5M',
      currentPrice: 2055.0,
      regimeAnalysis: regimeAnalysis2,
    });

    const shiftAlert = triggered.find(a => a.triggerType === 'REGIME_SHIFT');
    const passed = !!shiftAlert && shiftAlert.severity === 'CRITICAL';

    results.push({
      name: '[Signal Alerts] Market Regime Shift Auto-Detection Trigger',
      passed,
      details: passed
        ? `تغییر رژیم به ${shiftAlert?.titleFa} با شدت بحرانی (CRITICAL) صادر شد.`
        : 'هشدار تغییر رژیم بازار صادر نشد.',
    });
  } catch (err) {
    results.push({
      name: '[Signal Alerts] Market Regime Shift Auto-Detection Trigger',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. آزمون همگرایی حدنصاب کواروم شورا و شبیه‌سازی مونت‌کارلو
  try {
    SignalAlertDispatcher.clearAlerts();
    SignalAlertDispatcher.updateConfig({
      cooldownMs: 0,
      minAlphaConsensusScore: 70,
      minMonteCarloTpProbability: 60,
    });

    const candidate: StrategyCandidate = {
      id: 'CAND-TEST-BUY',
      strategyName: 'SMC_BUY',
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2050.0,
      stopLossPrice: 2045.0,
      takeProfitPrice: 2065.0,
      riskRewardRatio: 3.0,
      timeframe: '5M',
      createdAtTimestamp: Date.now(),
      expiresAtTimestamp: Date.now() + 3600000,
      style: 'SMC_INTRADAY',
      rationale: 'تست همگرایی شورا و مونت‌کارلو',
      status: 'CONFIRMED',
      evidenceIds: {
        sweepId: 'SWEEP-ASIA-01',
        fvgId: 'FVG-M5-01',
      },
    };

    const councilMock: MultiAgentPipelineResult = MultiAgentOrchestrator.evaluateCandidate(candidate, {
      ...DEFAULT_MULTI_AGENT_CONFIG,
      judgeEngineId: 'alpha-consensus-quorum-judge',
    });

    const mcMock: MonteCarloSimulationResult = {
      config: {
        iterations: 1000,
        steps: 40,
        initialPrice: 2050,
        targetPrice: 2065,
        stopLossPrice: 2045,
        annualizedVolatility: 0.16,
        drift: 0.02,
      },
      probabilityOfProfit: 72.0,
      probabilityHittingTarget: 72.0,
      probabilityOfStopLoss: 28.0,
      expectedMaxDrawdownPercent: 1.2,
      riskOfRuin: 0.1,
      medianFinalPrice: 2058.0,
      var95Percent: 0.8,
      cvar95Percent: 1.1,
      percentileCone: [],
      totalPaths: 1000,
      tpFirstCount: 720,
      slFirstCount: 280,
      neitherCount: 0,
      persianRiskAssessment: 'ریسک امن و مطلوب',
      isTradeViable: true,
    };

    const alerts = SignalAlertDispatcher.evaluateMarketState({
      symbol: 'XAUUSD',
      timeframe: '5M',
      currentPrice: 2050.0,
      activeCandidate: candidate,
      councilResult: councilMock,
      monteCarloResult: mcMock,
    });

    const hasCouncilAlert = alerts.some(a => a.triggerType === 'ALPHA_COUNCIL_QUORUM');
    const hasMcAlert = alerts.some(a => a.triggerType === 'MONTE_CARLO_HIGH_PROB');

    results.push({
      name: '[Signal Alerts] MultiTF Council Quorum & Monte Carlo Confluence Alert',
      passed: hasCouncilAlert && hasMcAlert,
      details: `هشدار شورا: ${hasCouncilAlert ? 'صادر شد' : 'خیر'} | هشدار مونت‌کارلو: ${hasMcAlert ? 'صادر شد' : 'خیر'} (نمره شورا: ۸۴.۵٪، احتمال مونت‌کارلو: ۷۲٪)`,
    });
  } catch (err) {
    results.push({
      name: '[Signal Alerts] MultiTF Council Quorum & Monte Carlo Confluence Alert',
      passed: false,
      details: (err as Error).message,
    });
  }

  SignalAlertDispatcher.clearAlerts();
  SignalAlertDispatcher.updateConfig(DEFAULT_ALERT_DISPATCHER_CONFIG);

  return results;
}
