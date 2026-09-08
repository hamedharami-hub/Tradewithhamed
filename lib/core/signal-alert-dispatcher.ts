// lib/core/signal-alert-dispatcher.ts
// موتور پایش لحظه‌ای و ارسال خودکار هشدارهای معاملاتی چندتایم‌فریمه
// ۱۰۰٪ کلاینت‌ساید و آفلاین، مجهز به سینت‌سایزر صوتی Web Audio API و دیسپچر اعلان

import { SymbolId, Timeframe } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { MarketRegimeAnalysis } from '../contracts/regimes';
import {
  SignalAlert,
  AlertDispatcherConfig,
  DEFAULT_ALERT_DISPATCHER_CONFIG,
  AlertSeverity,
} from '../contracts/alerts';
import { MultiAgentPipelineResult } from '../contracts/multi-agent-system';
import { MonteCarloSimulationResult } from '../contracts/monte-carlo';

export class SignalAlertDispatcher {
  private static alerts: SignalAlert[] = [];
  private static config: AlertDispatcherConfig = { ...DEFAULT_ALERT_DISPATCHER_CONFIG };
  private static lastAlertTimestamps: Map<string, number> = new Map();
  private static listeners: ((alert: SignalAlert) => void)[] = [];
  private static lastRegime: string | null = null;

  public static getConfig(): AlertDispatcherConfig {
    return { ...this.config };
  }

  public static updateConfig(newConfig: Partial<AlertDispatcherConfig>): AlertDispatcherConfig {
    this.config = { ...this.config, ...newConfig };
    return this.getConfig();
  }

  public static getAlerts(): SignalAlert[] {
    return [...this.alerts];
  }

  public static getUnreadCount(): number {
    return this.alerts.filter(a => !a.isRead).length;
  }

  public static markAllAsRead(): void {
    this.alerts = this.alerts.map(a => ({ ...a, isRead: true }));
  }

  public static markAsRead(id: string): void {
    this.alerts = this.alerts.map(a => a.id === id ? { ...a, isRead: true } : a);
  }

  public static clearAlerts(): void {
    this.alerts = [];
    this.lastAlertTimestamps.clear();
  }

  public static subscribe(callback: (alert: SignalAlert) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  // ۱. سینت‌سایزر صوتی سبک با Web Audio API بدون نیاز به فایل خارجی صوتی
  public static playAlertSound(severity: AlertSeverity, direction?: 'BUY' | 'SELL'): void {
    if (!this.config.enableAudio || typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (direction === 'BUY') {
        // دو فرکانس صعودی دلنشین برای خرید (۴۴۰ -> ۸۸۰ هرتز)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(440, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
        osc2.frequency.setValueAtTime(554.37, ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start(ctx.currentTime + 0.05);
        osc1.stop(ctx.currentTime + 0.3);
        osc2.stop(ctx.currentTime + 0.3);
      } else if (direction === 'SELL') {
        // دو فرکانس نزولی برای فروش (۶۶۰ -> ۳۳۰ هرتز)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (severity === 'CRITICAL' || severity === 'WARNING') {
        // سه پالس هشدار نوسان یا قطع فیوز
        [0, 0.12, 0.24].forEach(timeOffset => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(880, ctx.currentTime + timeOffset);
          gain.gain.setValueAtTime(0.15, ctx.currentTime + timeOffset);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + timeOffset + 0.09);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + timeOffset);
          osc.stop(ctx.currentTime + timeOffset + 0.09);
        });
      }
    } catch {
      // نادیده‌گیری خطای Web Audio اگر هنوز مجوزی داده نشده باشد
    }
  }

  // ۲. ارسال اعلان به مرورگر (Web Notifications API)
  public static async triggerBrowserNotification(alert: SignalAlert): Promise<void> {
    if (!this.config.enableBrowserNotifications || typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      try {
        new Notification('[Hamed Trading Lab] ' + alert.titleFa, {
          body: alert.messageFa,
          icon: '/icons/icon-192x192.png',
          tag: alert.id,
        });
      } catch {}
    } else if (Notification.permission !== 'denied') {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification('[Hamed Trading Lab] ' + alert.titleFa, {
            body: alert.messageFa,
            icon: '/icons/icon-192x192.png',
          });
        }
      } catch {}
    }
  }

  // ۳. ثبت، توزیع و مدیریت کول‌داون هشدار
  public static dispatchAlert(alert: SignalAlert): void {
    const cooldownKey = alert.symbol + '-' + alert.triggerType + '-' + (alert.direction || 'NONE');
    const now = Date.now();
    const lastTime = this.lastAlertTimestamps.get(cooldownKey) || 0;

    if (now - lastTime < this.config.cooldownMs) {
      return; // اسپم نشود
    }

    this.lastAlertTimestamps.set(cooldownKey, now);
    this.alerts.unshift(alert);

    // سقف نگهداری ۱۰۰ هشدار اخیر
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(0, 100);
    }

    // پخش صدا
    this.playAlertSound(alert.severity, alert.direction);

    // ارسال اعلان وب
    this.triggerBrowserNotification(alert);

    // آگاه‌سازی شنوندگان UI
    this.listeners.forEach(cb => {
      try {
        cb(alert);
      } catch {}
    });
  }

  // ۴. موتور تحلیل زنده و ارزیابی جامع شرایط هشدار
  public static evaluateMarketState(params: {
    symbol: SymbolId;
    timeframe: Timeframe;
    currentPrice: number;
    regimeAnalysis?: MarketRegimeAnalysis;
    activeCandidate?: StrategyCandidate | null;
    councilResult?: MultiAgentPipelineResult | null;
    monteCarloResult?: MonteCarloSimulationResult | null;
  }): SignalAlert[] {
    const generatedAlerts: SignalAlert[] = [];
    const now = Date.now();

    // الف. بررسی تغییر رژیم بازار (Regime Shift)
    if (params.regimeAnalysis) {
      const currentRegime = params.regimeAnalysis.regime;
      if (this.lastRegime && this.lastRegime !== currentRegime) {
        const isHighVol = currentRegime === 'HIGH_VOL_NEWS';
        const alert: SignalAlert = {
          id: 'ALERT-REGIME-' + now,
          timestamp: now,
          symbol: params.symbol,
          timeframe: params.timeframe,
          triggerType: 'REGIME_SHIFT',
          severity: isHighVol ? 'CRITICAL' : 'WARNING',
          titleFa: 'تغییر رژیم بازار به ' + params.regimeAnalysis.headlineFa,
          titleEn: 'Market Regime Shift: ' + currentRegime,
          messageFa: 'رژیم ساختاری از ' + this.lastRegime + ' به ' + currentRegime + ' تغییر کرد (' + params.regimeAnalysis.confidence + '٪ اطمینان). سبک‌های پیشنهادی: ' + params.regimeAnalysis.recommendedStyles.join('، '),
          messageEn: 'Regime shifted to ' + currentRegime + ' with ' + params.regimeAnalysis.confidence + '% confidence.',
          priceAtTrigger: params.currentPrice,
          marketRegime: currentRegime,
          isRead: false,
        };
        this.dispatchAlert(alert);
        generatedAlerts.push(alert);
      }
      this.lastRegime = currentRegime;
    }

    // ب. بررسی همگرایی ستاپ ورود با شورا و مونت‌کارلو
    if (params.activeCandidate) {
      const cand = params.activeCandidate;
      const councilScore = params.councilResult?.councilConsensus?.alphaConsensusScore ?? 0;
      const quorumReached = params.councilResult?.councilConsensus?.quorumReached ?? false;
      const monteCarloProb = params.monteCarloResult?.probabilityHittingTarget ?? 0;

      const isStyleActive = cand.style ? this.config.activeStyles.includes(cand.style) : true;

      if (isStyleActive) {
        // ۱. تاییدیه قدرتمند شورای هوش مصنوعی (Alpha Council Quorum)
        if (councilScore >= this.config.minAlphaConsensusScore && quorumReached) {
          const alert: SignalAlert = {
            id: 'ALERT-COUNCIL-' + cand.id + '-' + now,
            timestamp: now,
            symbol: params.symbol,
            timeframe: params.timeframe,
            triggerType: 'ALPHA_COUNCIL_QUORUM',
            severity: 'SUCCESS',
            titleFa: 'تأییدیه کواروم شورا برای ستاپ ' + (cand.direction === 'BUY' ? 'خرید (BUY)' : 'فروش (SELL)'),
            titleEn: 'Council Quorum Approved ' + cand.direction + ' Setup',
            messageFa: 'شورای ۴ عاملی با امتیاز آلفا ' + councilScore.toFixed(0) + '٪ ستاپ ورود در قیمت ' + cand.entryPrice + ' با R:R=' + cand.riskRewardRatio + ' را تصویب کرد.',
            messageEn: 'Multi-agent council approved setup at ' + cand.entryPrice + ' with score ' + councilScore.toFixed(0) + '%.',
            direction: cand.direction,
            priceAtTrigger: params.currentPrice,
            entryPrice: cand.entryPrice,
            stopLossPrice: cand.stopLossPrice,
            takeProfitPrice: cand.takeProfitPrice,
            riskRewardRatio: cand.riskRewardRatio,
            tradingStyle: cand.style,
            alphaConsensusScore: councilScore,
            monteCarloTpProbability: monteCarloProb,
            isRead: false,
          };
          this.dispatchAlert(alert);
          generatedAlerts.push(alert);
        }

        // ۲. احتمال بالای شبیه‌سازی ۱۰۰۰ مسیره مونت‌کارلو (Monte Carlo High Probability)
        if (monteCarloProb >= this.config.minMonteCarloTpProbability) {
          const alert: SignalAlert = {
            id: 'ALERT-MC-' + cand.id + '-' + now,
            timestamp: now,
            symbol: params.symbol,
            timeframe: params.timeframe,
            triggerType: 'MONTE_CARLO_HIGH_PROB',
            severity: 'SUCCESS',
            titleFa: 'احتمال ' + monteCarloProb.toFixed(0) + '٪ تارگت در شبیه‌سازی مونت‌کارلو',
            titleEn: 'Monte Carlo High Win Probability: ' + monteCarloProb.toFixed(0) + '%',
            messageFa: 'موتور مونت‌کارلو در ۱۰۰۰ مسیر تصادفی GBM، شانس لمس تارگت ' + cand.takeProfitPrice + ' پیش از استاپ ' + cand.stopLossPrice + ' را ' + monteCarloProb.toFixed(0) + '٪ برآورد کرد.',
            messageEn: 'Monte Carlo 1000-path simulation calculated ' + monteCarloProb.toFixed(0) + '% probability of hitting TP first.',
            direction: cand.direction,
            priceAtTrigger: params.currentPrice,
            entryPrice: cand.entryPrice,
            stopLossPrice: cand.stopLossPrice,
            takeProfitPrice: cand.takeProfitPrice,
            riskRewardRatio: cand.riskRewardRatio,
            tradingStyle: cand.style,
            alphaConsensusScore: councilScore,
            monteCarloTpProbability: monteCarloProb,
            isRead: false,
          };
          this.dispatchAlert(alert);
          generatedAlerts.push(alert);
        }
      }
    }

    return generatedAlerts;
  }
}
