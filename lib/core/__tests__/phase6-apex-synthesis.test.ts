// lib/core/__tests__/phase6-apex-synthesis.test.ts
// آزمون‌های جامع سنتز اوج (Phase 6: The Apex Synthesis)
// شامل انطباق شورای هوش مصنوعی، سطوح چندتایم‌فریمه و مخروط استوکاستیک مونت‌کارلو

import { PostTradeAnalyticsEngine } from '../post-trade-analytics';
import { DEFAULT_W5_TRADES } from '../../contracts/w5-journal-analytics';
import { MonteCarloSimulator } from '../monte-carlo-simulator';

export interface TestResultItem {
  name: string;
  passed: boolean;
  details: string;
}

export function runPhase6TestSuite(): TestResultItem[] {
  const results: TestResultItem[] = [];

  // ۱. بررسی یکپارچگی تفکیک عملکرد شورای هوش مصنوعی و رژیم‌های بازار
  try {
    const report = PostTradeAnalyticsEngine.calculateAICouncilAttribution(DEFAULT_W5_TRADES);

    const totalTradesMatch = report.totalTrades === DEFAULT_W5_TRADES.length;
    const hasStyles = !!report.byStyle['SMC_INTRADAY'] && !!report.byStyle['SCALP_M1_M5'];
    const hasRegimes = !!report.byRegime['COMPRESSION'] && !!report.byRegime['TRENDING_BULLISH'];
    const passed = totalTradesMatch && hasStyles && hasRegimes;

    results.push({
      name: '[Phase 6.1] انطباق تفکیکی سبک معاملاتی و رژیم بازار در ژورنال W5',
      passed,
      details: passed
        ? `تعداد ${report.totalTrades} معامله در ${Object.keys(report.byStyle).length} سبک و ${Object.keys(report.byRegime).length} رژیم تفکیک شدند.`
        : 'عدم تطابق تعداد یا مپینگ سبک‌ها و رژیم‌ها در گزارش شورا.',
    });
  } catch (err: any) {
    results.push({
      name: '[Phase 6.1] انطباق تفکیکی سبک معاملاتی و رژیم بازار در ژورنال W5',
      passed: false,
      details: `خطا در محاسبه: ${err?.message || err}`,
    });
  }

  // ۲. بررسی صحت دسته‌بندی سطوح اجماع شورا (Consensus Tiers)
  try {
    const report = PostTradeAnalyticsEngine.calculateAICouncilAttribution(DEFAULT_W5_TRADES);

    const highTier = report.byConsensusTier.highConsensus;
    const lowTier = report.byConsensusTier.lowConsensus;

    // ۳ معامله بالای ۷۵٪ اجماع دارند و هر ۳ سودده هستند (وین‌ریت ۱۰۰٪)
    const highTierValid = highTier.tradesCount === 3 && highTier.winRate === 100 && highTier.netProfit > 0;
    // ۱ معامله زیر ۶۰٪ اجماع است و زیانده بوده (وین‌ریت ۰٪)
    const lowTierValid = lowTier.tradesCount === 1 && lowTier.winRate === 0 && lowTier.netProfit < 0;
    const passed = highTierValid && lowTierValid;

    results.push({
      name: '[Phase 6.2] صحت آماری سطوح اجماع شورای هوش مصنوعی (High vs Low Quorum)',
      passed,
      details: passed
        ? `سطح اجماع بالا: ${highTier.tradesCount} معامله با وین‌ریت ${highTier.winRate}٪ و سود +$${highTier.netProfit.toFixed(2)} | سطح پایین: وین‌ریت ${lowTier.winRate}٪.`
        : `عدم تطابق شاخص‌های سطوح اجماع: HighWinRate=${highTier.winRate}%, LowWinRate=${lowTier.winRate}%`,
    });
  } catch (err: any) {
    results.push({
      name: '[Phase 6.2] صحت آماری سطوح اجماع شورای هوش مصنوعی (High vs Low Quorum)',
      passed: false,
      details: `خطا: ${err?.message || err}`,
    });
  }

  // ۳. ارزیابی ریاضی و تجربی اثر سیو سود پارشال (50% در 1.2R)
  try {
    const report = PostTradeAnalyticsEngine.calculateAICouncilAttribution(DEFAULT_W5_TRADES);
    const partial = report.partialTpImpact;

    const partialCountValid = partial.partialTpCount === 3;
    const partialWinRateValid = partial.partialTpWinRate === 100;
    const partialNetProfitValid = partial.partialTpNetProfit > 100; // 74.5 + 59.64 + 17.67 = 151.81
    const passed = partialCountValid && partialWinRateValid && partialNetProfitValid;

    results.push({
      name: '[Phase 6.3] اثر تاکتیکی سیو سود پارشال ۵۰٪ در ۱.۲R و کاهش دراودان',
      passed,
      details: passed
        ? `سیو سود در ${partial.partialTpCount} معامله اجرا شد: نرخ برد ${partial.partialTpWinRate}٪ با سود خالص +$${partial.partialTpNetProfit.toFixed(2)}.`
        : `شاخص‌های سیو سود نامعتبر: count=${partial.partialTpCount}, winRate=${partial.partialTpWinRate}%`,
    });
  } catch (err: any) {
    results.push({
      name: '[Phase 6.3] اثر تاکتیکی سیو سود پارشال ۵۰٪ در ۱.۲R و کاهش دراودان',
      passed: false,
      details: `خطا: ${err?.message || err}`,
    });
  }

  // ۴. بررسی ریاضی مخروط احتمالاتی استوکاستیک مونت‌کارلو و پیش‌بینی سطوح
  try {
    const basePrice = 2650.0;
    const sim = MonteCarloSimulator.runSimulation({
      iterations: 200,
      steps: 20,
      initialPrice: basePrice,
      targetPrice: basePrice + 15,
      stopLossPrice: basePrice - 6,
      seed: 42,
    });

    const cone = sim.percentileCone;
    const stepCountValid = cone.length === 21; // گام ۰ تا ۲۰

    // بررسی یکنوایی صدک‌ها در هر گام: p5 <= p25 <= p50 <= p75 <= p95
    let monotonicityValid = true;
    for (const p of cone) {
      if (!(p.p5 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p95)) {
        monotonicityValid = false;
        break;
      }
    }

    // بررسی انبساط زمانی مخروط به دلیل قانون حرکت براونی (واریانس متناسب با زمان)
    const initialSpread = cone[0].p95 - cone[0].p5;
    const finalSpread = cone[cone.length - 1].p95 - cone[cone.length - 1].p5;
    const diffusionExpansionValid = finalSpread > initialSpread;

    const passed = stepCountValid && monotonicityValid && diffusionExpansionValid;

    results.push({
      name: '[Phase 6.4] صحت ریاضی مخروط صدک‌های استوکاستیک مونت‌کارلو (GBM Cone Diffusion)',
      passed,
      details: passed
        ? `تایید یکنوایی صدک‌ها در ۲۰ گام پیش‌بینی. گسترش واریانس دیفیوژن از ${initialSpread.toFixed(2)} به ${finalSpread.toFixed(2)} دلار.`
        : `نقض یکنوایی یا دیفیوژن: steps=${stepCountValid}, monotonic=${monotonicityValid}, diffusion=${diffusionExpansionValid}`,
    });
  } catch (err: any) {
    results.push({
      name: '[Phase 6.4] صحت ریاضی مخروط صدک‌های استوکاستیک مونت‌کارلو (GBM Cone Diffusion)',
      passed: false,
      details: `خطا در شبیه‌سازی: ${err?.message || err}`,
    });
  }

  return results;
}
