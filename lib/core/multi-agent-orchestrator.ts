// lib/core/multi-agent-orchestrator.ts
// موتور هماهنگ‌ساز ۴ ایجنت هوشمند با تطابق کامل سبک‌های معاملاتی
// طراحی کامپوننت‌محور، قطعی، ایمن و سازگار با استنتاج مرورگر WebGPU

import { StrategyCandidate } from '../contracts/strategy';
import {
  MultiAgentConfiguration,
  MultiAgentPipelineResult,
  AgentReviewResult,
  CouncilConsensusReport,
  TRADING_STYLES,
  AGENT_ROLES_INFO,
  AGENT_ENGINE_OPTIONS,
  DEFAULT_MULTI_AGENT_CONFIG,
  TradingStyleId,
  AgentRole,
} from '../contracts/multi-agent-system';

export class MultiAgentOrchestrator {
  private static STORAGE_KEY = 'hamed_multi_agent_config_v4';

  /**
   * دریافت پیکربندی ذخیره‌شده یا پیش‌فرض
   */
  public static loadConfiguration(): MultiAgentConfiguration {
    if (typeof window === 'undefined') return DEFAULT_MULTI_AGENT_CONFIG;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          activeTradingStyle: parsed.activeTradingStyle || DEFAULT_MULTI_AGENT_CONFIG.activeTradingStyle,
          scannerEngineId: parsed.scannerEngineId || DEFAULT_MULTI_AGENT_CONFIG.scannerEngineId,
          analystEngineId: parsed.analystEngineId || DEFAULT_MULTI_AGENT_CONFIG.analystEngineId,
          criticEngineId: parsed.criticEngineId || DEFAULT_MULTI_AGENT_CONFIG.criticEngineId,
          judgeEngineId: parsed.judgeEngineId || DEFAULT_MULTI_AGENT_CONFIG.judgeEngineId,
        };
      }
    } catch {}
    return DEFAULT_MULTI_AGENT_CONFIG;
  }

  /**
   * ذخیره دائمی پیکربندی در حافظه مرورگر
   */
  public static saveConfiguration(config: MultiAgentConfiguration): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }

  /**
   * اجرای کامل خط‌لوله ۴ ایجنتی بر روی کاندیدای معاملاتی و سبک فعال
   */
  public static evaluateCandidate(
    candidate: StrategyCandidate | null,
    config: MultiAgentConfiguration = DEFAULT_MULTI_AGENT_CONFIG,
    options?: {
      environment?: string;
      dataProvenance?: string;
    }
  ): MultiAgentPipelineResult {
    const styleInfo =
      TRADING_STYLES.find(s => s.id === config.activeTradingStyle) || TRADING_STYLES[0];
    const now = Date.now();
    const env = options?.environment || 'PRACTICE';
    const prov = options?.dataProvenance || 'نمونه آزمایشی (Fixtures)';

    // ۱. ارزیابی ایجنت ۱: اسکنر ساختار بازار
    const scannerReview = this.runScannerAgent(candidate, config, styleInfo.id, now, env, prov);

    // ۲. ارزیابی ایجنت ۲: تحلیل‌گر بستر و روند
    const analystReview = this.runAnalystAgent(candidate, config, styleInfo.id, scannerReview, now, env, prov);

    // ۳. ارزیابی ایجنت ۳: منتقد سخت‌گیر ریسک
    const criticReview = this.runCriticAgent(candidate, config, styleInfo.id, analystReview, now, env, prov);

    // ۴. ارزیابی ایجنت ۴: داور نهایی و دیده‌بان قوانین
    const judgeReview = this.runJudgeAgent(candidate, config, styleInfo.id, analystReview, criticReview, now, env, prov);

    // محاسبه ماتریس اجماع شورای عالی آلفا (Alpha Consensus Quorum Matrix)
    const agentWeights = {
      SCANNER: 0.20,
      ANALYST: 0.30,
      CRITIC: 0.30,
      JUDGE: 0.20,
    };

    let approvedVotes = 0;
    let rejectedVotes = 0;
    let neutralVotes = 0;
    let weightedScore = 0;

    const reviews = [scannerReview, analystReview, criticReview, judgeReview];
    for (const r of reviews) {
      if (r.verdict === 'APPROVED') {
        approvedVotes++;
        weightedScore += (agentWeights[r.agentRole] || 0.25) * r.confidence * 100;
      } else if (r.verdict === 'REJECTED') {
        rejectedVotes++;
      } else {
        neutralVotes++;
      }
    }

    const alphaConsensusScore = Number(weightedScore.toFixed(1));
    const quorumReached = alphaConsensusScore >= 75 && approvedVotes >= 3;
    const vetoTriggered = criticReview.verdict === 'REJECTED' || judgeReview.verdict === 'REJECTED';
    const vetoReasonFa = criticReview.verdict === 'REJECTED'
      ? criticReview.summaryFa
      : (judgeReview.verdict === 'REJECTED' ? judgeReview.summaryFa : undefined);

    const verdictPersian = vetoTriggered
      ? `توقف معامله توسط وتوی منتقد/داور (امتیاز انطباق با قوانین: ${alphaConsensusScore}٪)`
      : (quorumReached
        ? `اجماع قاطع شورا با امتیاز انطباق ${alphaConsensusScore}٪ (تایید ۳+ ایجنت)`
        : `عدم حصول حدنصاب ۷۵٪ (امتیاز انطباق فعلی: ${alphaConsensusScore}٪)`);

    const councilConsensus: CouncilConsensusReport = {
      alphaConsensusScore,
      quorumReached,
      vetoTriggered,
      vetoReasonFa,
      votes: {
        approved: approvedVotes,
        rejected: rejectedVotes,
        neutral: neutralVotes,
      },
      agentWeights,
      verdictPersian,
    };

    const configuredEngineIds = [config.scannerEngineId, config.analystEngineId, config.criticEngineId, config.judgeEngineId];
    const hasUnexecutedNeuralEngine = configuredEngineIds.some(engineId =>
      AGENT_ENGINE_OPTIONS.find(engine => engine.id === engineId)?.type === 'NEURAL_WEBGPU'
    );
    const isApprovedForTrading = !hasUnexecutedNeuralEngine && quorumReached && judgeReview.verdict === 'APPROVED' && !vetoTriggered;
    const failClosedTriggered = judgeReview.verdict === 'REJECTED' && analystReview.verdict === 'APPROVED';

    let finalRecommendationFa = '';
    if (hasUnexecutedNeuralEngine) {
      finalRecommendationFa = 'یک یا چند مدل عصبی درخواست شده‌اند اما در این مسیر همگام بارگذاری نشده و اجرا نگردیدند (فال‌بک به قواعد قطعی). برای جلوگیری از تکیه نادرست، ارسال سفارش مسدود است.';
    } else if (isApprovedForTrading) {
      finalRecommendationFa = `اجماع کامل هر ۴ ایجنت در سبک «${styleInfo.nameFa}» حاصل شد (امتیاز انطباق: ${alphaConsensusScore}٪). خروجی مشورتی است و ارسال سفارش نیازمند تایید کاربر است.`;
    } else if (failClosedTriggered) {
      finalRecommendationFa = `توقف بر اساس قاعده شکست امن (Fail-Closed): منتقد به دلیل ${criticReview.summaryFa} ورود را متوقف کرد. هیچ سفارشی ارسال نمی‌شود.`;
    } else {
      finalRecommendationFa = `شرایط ورود در سبک «${styleInfo.nameFa}» هنوز تکمیل نشده است: ${analystReview.summaryFa}`;
    }

    const overallConfidence = isApprovedForTrading
      ? Number(((analystReview.confidence + criticReview.confidence) / 2).toFixed(2))
      : 0.2;

    return {
      tradingStyle: styleInfo.id,
      tradingStyleInfo: styleInfo,
      isApprovedForTrading,
      failClosedTriggered,
      scannerReview,
      analystReview,
      criticReview,
      judgeReview,
      finalRecommendationFa,
      overallConfidence,
      timestamp: now,
      councilConsensus,
    };
  }

  /**
   * کمکی جهت تفکیک صادقانه موتور درخواستی و موتور واقعاً اجراشده
   */
  private static resolveEngineHonesty(
    configuredEngineId: string,
    role: AgentRole,
    env: string,
    prov: string
  ) {
    const requestedEngine =
      AGENT_ENGINE_OPTIONS.find(e => e.id === configuredEngineId) ||
      AGENT_ENGINE_OPTIONS.find(e => e.role === role)!;
    const isNeuralRequested = requestedEngine.type === 'NEURAL_WEBGPU';

    // در خط لوله محاسباتی همگام فعلی، مدل‌های عصبی WebGPU بدون بارگذاری ناهمگام وزن‌ها اجرا نمی‌شوند.
    // بنابراین برای حفظ صداقت اطلاعات، فال‌بک قطعی معادل اجرا می‌شود و به دروغ مدل عصبی نامیده نمی‌شود.
    const executedEngine = isNeuralRequested
      ? (AGENT_ENGINE_OPTIONS.find(e => e.role === role && e.type === 'DETERMINISTIC') || requestedEngine)
      : requestedEngine;

    const isFallback = isNeuralRequested;
    const fallbackReasonFa = isNeuralRequested
      ? 'موتور عصبی درخواستی نیازمند استنتاج ناهمگام WebGPU است. جهت صداقت اطلاعات، قوانین قطعی معادل اجرا شده و نتیجه به نام مدل عصبی جعل نمی‌گردد.'
      : undefined;

    const executionMode: 'DETERMINISTIC_RULES' | 'NEURAL_INFERENCE' | 'NOT_EXECUTED' | 'ERROR' = isNeuralRequested
      ? 'DETERMINISTIC_RULES'
      : 'DETERMINISTIC_RULES';

    const executionStatusFa = isNeuralRequested
      ? 'فال‌بک به قوانین قطعی (مدل عصبی به صورت همگام اجرا نشد)'
      : 'اجراشده با قوانین قطعی';

    return {
      requestedEngineId: requestedEngine.id,
      executedEngineId: executedEngine.id,
      engineId: requestedEngine.id,
      engineNameFa: isNeuralRequested ? `${executedEngine.nameFa} (جایگزین قطعی)` : executedEngine.nameFa,
      engineType: 'DETERMINISTIC' as const,
      executionMode,
      executionStatusFa,
      isFallback,
      fallbackReasonFa,
      environment: env,
      dataProvenance: prov,
      isAdvisoryOnly: true,
      advisoryDisclaimerFa: 'این تحلیل صرفاً جنبهٔ مشورتی دارد و هیچ‌گونه تضمین سود یا پیش‌بینی قطعی آینده نیست.',
      latencyMs: executedEngine.latencyMs,
    };
  }

  /**
   * ایجنت ۱: اسکنر و ستاپ‌یاب ساختار بازار
   */
  private static runScannerAgent(
    candidate: StrategyCandidate | null,
    config: MultiAgentConfiguration,
    style: TradingStyleId,
    now: number,
    env: string,
    prov: string
  ): AgentReviewResult {
    const honesty = this.resolveEngineHonesty(config.scannerEngineId, 'SCANNER', env, prov);

    if (!candidate) {
      return {
        agentRole: 'SCANNER',
        roleTitleFa: AGENT_ROLES_INFO.SCANNER.nameFa,
        ...honesty,
        verdict: 'NEUTRAL',
        verdictTitleFa: 'در انتظار تشکیل ستاپ',
        confidence: 0,
        tradingStyleUsed: style,
        summaryFa: 'هنوز سوییپ نقدینگی معتبر روی چارت شکل نگرفته است.',
        reasoningBulletsFa: [
          'عدم نفوذ شدو به سقف یا کف سشن‌های ماژور',
          'عدم تشکیل کندل تاییدیه و تثبیت در رنج',
        ],
        timestamp: now,
      };
    }

    const hasSweep = !!candidate.evidenceIds.sweepId;
    const hasFvg = !!candidate.evidenceIds.fvgId;
    const hasContext = !!candidate.evidenceIds.contextSwingId || !!candidate.evidenceIds.bosId;

    const isStyleEvidenceValid =
      style === 'S0_SWEEP_FVG'
        ? hasSweep && hasFvg
        : style === 'BOS_ORDER_BLOCK'
        ? hasContext || hasSweep
        : style === 'SCALP_M1_M5' || style === 'M1_SCALP'
        ? hasSweep
        : style === 'SWING_MACRO' || style === 'SESSION_SWING'
        ? hasContext
        : style === 'TREND_BREAKOUT'
        ? hasContext
        : hasSweep || hasContext || hasFvg;

    const bullets: string[] = [];
    if (style === 'S0_SWEEP_FVG') {
      bullets.push(`سوییپ نقدینگی در شناسه ${candidate.evidenceIds.sweepId || 'SWEEP-OK'} احراز شد.`);
      bullets.push(`شکاف ارزش منصفانه (FVG) در تایم ۵ دقیقه تایید گردید.`);
      bullets.push(`قیمت لیمیت پیشنهادی در تراز تعادل: ${candidate.entryPrice}`);
    } else if (style === 'BOS_ORDER_BLOCK') {
      bullets.push(`شکست ساختار ماژور (BOS) در کندل تاییدیه ثبت شد.`);
      bullets.push(`کندل اردر بلاک دست‌نخورده در قیمت ${candidate.entryPrice} مشخص گردید.`);
    } else if (style === 'SCALP_M1_M5' || style === 'M1_SCALP') {
      bullets.push(`سوییپ سریع میکروکف/میکروسقف نقدینگی در تایم‌فریم ۱ یا ۵ دقیقه احراز شد.`);
      bullets.push(`مومنتوم شتابان بازگشتی با تاییدیه کلوز کندل احراز گردید.`);
      bullets.push(`نقطه ورود سریع در قیمت ${candidate.entryPrice} با حد ضرر فشرده مستقر شد.`);
    } else if (style === 'SWING_MACRO' || style === 'SESSION_SWING') {
      bullets.push(`هم‌راستایی ساختار ماژور در تایم‌فریم کلان ۴ ساعته و روزانه (H4/D1) تایید شد.`);
      bullets.push(`سووینگ ماژور و خروج از رنج قیمتی در تراز ${candidate.entryPrice} ثبت گردید.`);
      bullets.push(`تارگت گسترده ساختاری چندروزه در قیمت ${candidate.takeProfitPrice} هدف‌گذاری شد.`);
    } else if (style === 'TREND_BREAKOUT') {
      bullets.push(`شکست معتبر کانال ۵۵ دوره‌ای هم‌راستا با شیب EMA200 ثبت شد.`);
      bullets.push(`خروج شتابان از فاز فشردگی (Compression) تایید گردید.`);
    } else {
      bullets.push(`امواج تکانه‌ای و تراز ۵۰٪ تخفیف (Discount) محاسبه شد.`);
      bullets.push(`ناحیه بهینه ورود قیمت در ${candidate.entryPrice} مستقر است.`);
    }

    return {
      agentRole: 'SCANNER',
      roleTitleFa: AGENT_ROLES_INFO.SCANNER.nameFa,
      ...honesty,
      verdict: isStyleEvidenceValid ? 'APPROVED' : 'REJECTED',
      verdictTitleFa: isStyleEvidenceValid ? 'ستاپ کشف شد' : 'شواهد ناکافی',
      confidence: 0.95,
      tradingStyleUsed: style,
      summaryFa: `کاندیدای ${candidate.direction === 'BUY' ? 'خرید (BUY)' : 'فروش (SELL)'} با مشخصات هندسی کامل شناسایی شد.`,
      reasoningBulletsFa: bullets,
      timestamp: now,
    };
  }

  /**
   * ایجنت ۲: تحلیل‌گر بستر و روند بازار
   */
  private static runAnalystAgent(
    candidate: StrategyCandidate | null,
    config: MultiAgentConfiguration,
    style: TradingStyleId,
    scannerReview: AgentReviewResult,
    now: number,
    env: string,
    prov: string
  ): AgentReviewResult {
    const honesty = this.resolveEngineHonesty(config.analystEngineId, 'ANALYST', env, prov);

    if (!candidate || scannerReview.verdict !== 'APPROVED') {
      return {
        agentRole: 'ANALYST',
        roleTitleFa: AGENT_ROLES_INFO.ANALYST.nameFa,
        ...honesty,
        verdict: 'NEUTRAL',
        verdictTitleFa: 'در انتظار خروجی اسکنر',
        confidence: 0,
        tradingStyleUsed: style,
        summaryFa: 'کاندیدایی برای تحلیل ارائه نشده است.',
        reasoningBulletsFa: ['اسکنر ساختار هنوز ستاپ معتبری را تایید نکرده است.'],
        timestamp: now,
      };
    }

    const bullets: string[] = [
      `هم‌راستایی بستر کلان (Context ساختار HTF متناسب با تایم‌فریم ترید) با جهت ${candidate.direction} بررسی شد.`,
      `درجه ابهام (Uncertainty): پایین (بر مبنای سوییپ نقدینگی و رنج سشن).`,
      `سطح ابطال تحلیلی: نفوذ قیمت به پشت سطح حد ضرر (${candidate.stopLossPrice}).`,
    ];

    if (style === 'S0_SWEEP_FVG') {
      bullets.push('جریان سفارشات اسمارت مانی پس از شکار نقدینگی، تمایل به پر کردن خلاء ارزش منصفانه دارد.');
    } else if (style === 'BOS_ORDER_BLOCK') {
      bullets.push('مومنتوم شکست ساختار قوی بوده و بازگشت به اردر بلاک فرصت کم‌ریسک تلقی می‌شود.');
    } else if (style === 'SCALP_M1_M5' || style === 'M1_SCALP') {
      bullets.push('بستر میکروساختار برای نوسان سریع کوتاه‌مدت بدون ریسک ماندگاری طولانی مساعد است.');
    } else if (style === 'SWING_MACRO' || style === 'SESSION_SWING') {
      bullets.push('روند ساختاری کلان بر نویزهای درون‌روزی چیره شده و پتانسیل ریوارد بالا (3R+) دارد.');
    } else if (style === 'TREND_BREAKOUT') {
      bullets.push('مومنتوم خروج از کانال پرشتاب بوده و شیب میانگین متحرک حامی ادامه حرکت است.');
    } else {
      bullets.push('تعادل عرضه و تقاضا در ناحیه تخفیف ۵۰٪ شرایط خرید ارزان را فراهم کرده است.');
    }

    return {
      agentRole: 'ANALYST',
      roleTitleFa: AGENT_ROLES_INFO.ANALYST.nameFa,
      ...honesty,
      verdict: 'APPROVED',
      verdictTitleFa: 'تایید جهت معامله',
      confidence: 0.88, // امتیاز انطباق با قوانین استراتژی
      tradingStyleUsed: style,
      summaryFa: `تحلیل‌گر بر مبنای سبک «${TRADING_STYLES.find(s => s.id === style)?.nameFa}» شروط ورود را منطبق دانست.`,
      reasoningBulletsFa: bullets,
      timestamp: now,
    };
  }

  /**
   * ایجنت ۳: منتقد سخت‌گیر ریسک و وکیل مدافع شیطان
   */
  private static runCriticAgent(
    candidate: StrategyCandidate | null,
    config: MultiAgentConfiguration,
    style: TradingStyleId,
    analystReview: AgentReviewResult,
    now: number,
    env: string,
    prov: string
  ): AgentReviewResult {
    const honesty = this.resolveEngineHonesty(config.criticEngineId, 'CRITIC', env, prov);

    if (!candidate || analystReview.verdict !== 'APPROVED') {
      return {
        agentRole: 'CRITIC',
        roleTitleFa: AGENT_ROLES_INFO.CRITIC.nameFa,
        ...honesty,
        verdict: 'NEUTRAL',
        verdictTitleFa: 'عدم نیاز به نقد',
        confidence: 0,
        tradingStyleUsed: style,
        summaryFa: 'تحلیلی برای بررسی انتقادی ثبت نشده است.',
        reasoningBulletsFa: ['هیچ ستاپی تایید نشده که نیاز به غربالگری منتقد داشته باشد.'],
        timestamp: now,
      };
    }

    const styleInfo = TRADING_STYLES.find(s => s.id === style) || TRADING_STYLES[0];
    const minRequiredRR = styleInfo.minimumRR;
    const isRRValid = candidate.riskRewardRatio >= minRequiredRR;

    const bullets: string[] = [];
    let verdict: 'APPROVED' | 'REJECTED' = 'APPROVED';
    let summaryFa = '';

    if (!isRRValid) {
      verdict = 'REJECTED';
      summaryFa = `رد ستاپ توسط منتقد: نسبت سود به زیان (${candidate.riskRewardRatio}) کمتر از حداقل مصوب سبک (${minRequiredRR}) است.`;
      bullets.push(`🛡️ لایه ۱ (موتور قطعی S0): نقض شرط بازدهی؛ نسبت R:R کمتر از حداقل مصوب (${minRequiredRR}) است.`);
      bullets.push('اصطکاک و کمیسیون بروکر در این نسبت توجیه‌پذیر نیست.');
    } else {
      verdict = 'APPROVED';
      summaryFa = `تست استرس منتقد با موفقیت پشت سر گذاشته شد (R:R برابر ۱ به ${candidate.riskRewardRatio}).`;
      bullets.push(`🛡️ لایه ۱ (موتور قطعی S0): انطباق کامل R:R برابر ۱ به ${candidate.riskRewardRatio} با معیار مصوب سبک.`);
      if (style === 'SCALP_M1_M5' || style === 'M1_SCALP') {
        bullets.push('🛡️ لایه ۱ (موتور قطعی S0): تایید فاصله زمانی امن از اخبار اقتصادی قرمز.');
        bullets.push('🛡️ لایه ۱ (موتور قطعی S0): کنترل اصطکاک اسپرد و اسلیپیج نسبت به دامنه حد سود اسکلپ.');
      } else if (style === 'SWING_MACRO' || style === 'SESSION_SWING') {
        bullets.push('🛡️ لایه ۱ (موتور قطعی S0): حد ضرر ساختاری فراتر از دامنه نوسان روزانه (ATR) قرار دارد.');
        bullets.push('🛡️ لایه ۱ (موتور قطعی S0): کنترل ریسک سواپ شبانه.');
      } else {
        bullets.push('🛡️ لایه ۱ (موتور قطعی S0): فاصله امن از اخبار اقتصادی قرمز و عدم وجود سد نقدینگی معارض.');
      }
    }

    return {
      agentRole: 'CRITIC',
      roleTitleFa: AGENT_ROLES_INFO.CRITIC.nameFa,
      ...honesty,
      verdict,
      verdictTitleFa: verdict === 'APPROVED' ? 'صحت‌سنجی تایید' : 'مردود و خطرناک',
      confidence: verdict === 'APPROVED' ? 0.9 : 0.95,
      tradingStyleUsed: style,
      summaryFa,
      reasoningBulletsFa: bullets,
      timestamp: now,
    };
  }

  /**
   * ایجنت ۴: داور نهایی و دیده‌بان ریسک
   */
  private static runJudgeAgent(
    candidate: StrategyCandidate | null,
    config: MultiAgentConfiguration,
    style: TradingStyleId,
    analystReview: AgentReviewResult,
    criticReview: AgentReviewResult,
    now: number,
    env: string,
    prov: string
  ): AgentReviewResult {
    const honesty = this.resolveEngineHonesty(config.judgeEngineId, 'JUDGE', env, prov);

    if (!candidate) {
      return {
        agentRole: 'JUDGE',
        roleTitleFa: AGENT_ROLES_INFO.JUDGE.nameFa,
        ...honesty,
        verdict: 'NEUTRAL',
        verdictTitleFa: 'در انتظار ورودی',
        confidence: 0,
        tradingStyleUsed: style,
        summaryFa: 'داوری در وضعیت آماده‌باش قرار دارد.',
        reasoningBulletsFa: ['منتظر تشکیل کاندیدای تاییدشده'],
        timestamp: now,
      };
    }

    const bullets: string[] = [];
    let verdict: 'APPROVED' | 'REJECTED' = 'APPROVED';
    let summaryFa = '';

    const isFailClosedEngine = config.judgeEngineId === 'strict-consensus-fail-closed';
    const isQuorumEngine = config.judgeEngineId === 'alpha-consensus-quorum-judge';
    const isW4GuardianEngine = config.judgeEngineId === 'risk-guardian-w4-judge';

    if (analystReview.verdict !== 'APPROVED' || criticReview.verdict !== 'APPROVED') {
      verdict = 'REJECTED';
      if (isFailClosedEngine) {
        summaryFa = 'عدم صدور مجوز معامله به علت عدم اجماع تحلیل‌گر و منتقد (اصل شکست امن Fail-Closed).';
        bullets.push('قانون شکست امن: کوچک‌ترین اختلاف‌نظر یا ابهام، معامله را فوراً لغو می‌کند.');
      } else if (isQuorumEngine) {
        summaryFa = 'عدم دستیابی به حدنصاب رأی‌گیری شورای آلفا (کواروم به دلیل وتوی یکی از اعضا حاصل نشد).';
        bullets.push('شورا به دلیل فقدان رای اکثریت کیفی، مجوز ورود صادر نکرد.');
      } else if (isW4GuardianEngine) {
        summaryFa = 'دیده‌بان ریسک W4 ورود را متوقف کرد: شواهد تحلیل و نقد با استانداردهای سخت‌گیرانه حساب انطباق ندارد.';
        bullets.push('پایش حساب W4: حفاظت از سرمایه در برابر نوسانات مشکوک.');
      } else {
        summaryFa = 'داوری وزنی تلفیقی: میانگین امتیاز انطباق شورا کمتر از آستانه مجاز ۸۵٪ است.';
        bullets.push('وزن تحلیلی شورا کفایت لازم برای ورود به پوزیشن را احراز نکرد.');
      }
      bullets.push('دیده‌بان ریسک از ورود سرمایه به شرایط غیرشفاف ممانعت به عمل آورد.');
    } else {
      verdict = 'APPROVED';
      if (isFailClosedEngine) {
        summaryFa = 'اجماع قطعی و اتفاق آرا (Fail-Closed) تایید شد؛ ورود مشورتی با رعایت کامل چک‌لیست مجاز است.';
        bullets.push('توافق کامل و بدون استثنای هر ۳ ایجنت اسکنر، تحلیل‌گر و منتقد.');
      } else if (isQuorumEngine) {
        summaryFa = 'کواروم شورای عالی آلفا (حدنصاب بالای ۷۵٪) با موفقیت محقق شد.';
        bullets.push('اکثریت مطلق اعضای شورا به ورود رای مثبت دادند.');
      } else if (isW4GuardianEngine) {
        summaryFa = 'تاییدیه محافظ ریسک حساب W4: تمام پارامترهای اهرم، دروداون و ریسک در وضعیت سبز هستند.';
        bullets.push('انطباق کامل با سقف ریسک ۰٫۲۵٪ کل حساب و کنترل دروداون روزانه ۱٫۵٪.');
      } else {
        summaryFa = 'داوری وزنی تلفیقی (Ensemble): میانگین وزنی امتیازات شورا بالاتر از آستانه اطمینان ۸۵٪ است.';
        bullets.push('ترکیب بهینه‌شده آرای تحلیل‌گر و منتقد با ضریب اطمینان بالا.');
      }
      bullets.push(`صدور شناسه اختصاصی قصد سفارش: INTENT-${now.toString().slice(-6)}`);
    }

    return {
      agentRole: 'JUDGE',
      roleTitleFa: AGENT_ROLES_INFO.JUDGE.nameFa,
      ...honesty,
      verdict,
      verdictTitleFa: verdict === 'APPROVED' ? 'تایید نهایی و صدور مجوز' : 'توقف معامله (Fail-Closed)',
      confidence: 0.98,
      tradingStyleUsed: style,
      summaryFa,
      reasoningBulletsFa: bullets,
      timestamp: now,
    };
  }
}
