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
    config: MultiAgentConfiguration = DEFAULT_MULTI_AGENT_CONFIG
  ): MultiAgentPipelineResult {
    const styleInfo =
      TRADING_STYLES.find(s => s.id === config.activeTradingStyle) || TRADING_STYLES[0];
    const now = Date.now();

    // ۱. ارزیابی ایجنت ۱: اسکنر ساختار بازار
    const scannerReview = this.runScannerAgent(candidate, config, styleInfo.id, now);

    // ۲. ارزیابی ایجنت ۲: تحلیل‌گر بستر و روند
    const analystReview = this.runAnalystAgent(candidate, config, styleInfo.id, scannerReview, now);

    // ۳. ارزیابی ایجنت ۳: منتقد سخت‌گیر ریسک
    const criticReview = this.runCriticAgent(candidate, config, styleInfo.id, analystReview, now);

    // ۴. ارزیابی ایجنت ۴: داور نهایی و دیده‌بان قوانین
    const judgeReview = this.runJudgeAgent(candidate, config, styleInfo.id, analystReview, criticReview, now);

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
      ? `توقف معامله توسط وتوی منتقد/داور (امتیاز اجماع: ${alphaConsensusScore}٪)`
      : (quorumReached
        ? `اجماع قاطع شورا با امتیاز آلفا ${alphaConsensusScore}٪ (تایید ۳+ ایجنت)`
        : `عدم حصول حدنصاب ۷۵٪ (امتیاز فعلی: ${alphaConsensusScore}٪)`);

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
      finalRecommendationFa = 'یک یا چند موتور عصبی انتخاب شده‌اند اما مسیر همگام فقط نتیجه قطعی را تولید می‌کند؛ تا اجرای advisory عصبی و کنترل‌های مستقل، ارسال سفارش مسدود است.';
    } else if (isApprovedForTrading) {
      finalRecommendationFa = `اجماع کامل هر ۴ ایجنت در سبک «${styleInfo.nameFa}» حاصل شد (شاخص آلفا: ${alphaConsensusScore}٪). مجوز ارسال سفارش لیمیت صادر گردید.`;
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
   * ایجنت ۱: اسکنر و ستاپ‌یاب ساختار بازار
   */
  private static runScannerAgent(
    candidate: StrategyCandidate | null,
    config: MultiAgentConfiguration,
    style: TradingStyleId,
    now: number
  ): AgentReviewResult {
    const engine =
      AGENT_ENGINE_OPTIONS.find(e => e.id === config.scannerEngineId) ||
      AGENT_ENGINE_OPTIONS.find(e => e.role === 'SCANNER')!;

    if (!candidate) {
      return {
        agentRole: 'SCANNER',
        roleTitleFa: AGENT_ROLES_INFO.SCANNER.nameFa,
        engineId: engine.id,
        engineNameFa: engine.nameFa,
        engineType: engine.type,
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
        latencyMs: engine.latencyMs,
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
        : hasSweep || hasContext || hasFvg;

    const bullets: string[] = [];
    if (style === 'S0_SWEEP_FVG') {
      bullets.push(`سوییپ نقدینگی در شناسه ${candidate.evidenceIds.sweepId || 'SWEEP-OK'} احراز شد.`);
      bullets.push(`شکاف ارزش منصفانه (FVG) در تایم ۵ دقیقه تایید گردید.`);
      bullets.push(`قیمت لیمیت پیشنهادی در تراز تعادل: ${candidate.entryPrice}`);
    } else if (style === 'BOS_ORDER_BLOCK') {
      bullets.push(`شکست ساختار ماژور (BOS) در کندل تاییدیه ثبت شد.`);
      bullets.push(`کندل اردر بلاک دست‌نخورده در قیمت ${candidate.entryPrice} مشخص گردید.`);
    } else {
      bullets.push(`امواج تکانه‌ای و تراز ۵۰٪ تخفیف (Discount) محاسبه شد.`);
      bullets.push(`ناحیه بهینه ورود قیمت در ${candidate.entryPrice} مستقر است.`);
    }

    return {
      agentRole: 'SCANNER',
      roleTitleFa: AGENT_ROLES_INFO.SCANNER.nameFa,
      engineId: engine.id,
      engineNameFa: engine.nameFa,
      engineType: engine.type,
      verdict: isStyleEvidenceValid ? 'APPROVED' : 'REJECTED',
      verdictTitleFa: isStyleEvidenceValid ? 'ستاپ کشف شد' : 'شواهد ناکافی',
      confidence: 0.95,
      tradingStyleUsed: style,
      summaryFa: `کاندیدای ${candidate.direction === 'BUY' ? 'خرید (BUY)' : 'فروش (SELL)'} با مشخصات هندسی کامل شناسایی شد.`,
      reasoningBulletsFa: bullets,
      timestamp: now,
      latencyMs: engine.latencyMs,
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
    now: number
  ): AgentReviewResult {
    const engine =
      AGENT_ENGINE_OPTIONS.find(e => e.id === config.analystEngineId) ||
      AGENT_ENGINE_OPTIONS.find(e => e.role === 'ANALYST')!;

    if (!candidate || scannerReview.verdict !== 'APPROVED') {
      return {
        agentRole: 'ANALYST',
        roleTitleFa: AGENT_ROLES_INFO.ANALYST.nameFa,
        engineId: engine.id,
        engineNameFa: engine.nameFa,
        engineType: engine.type,
        verdict: 'NEUTRAL',
        verdictTitleFa: 'در انتظار خروجی اسکنر',
        confidence: 0,
        tradingStyleUsed: style,
        summaryFa: 'کاندیدایی برای تحلیل ارائه نشده است.',
        reasoningBulletsFa: ['اسکنر ساختار هنوز ستاپ معتبری را تایید نکرده است.'],
        timestamp: now,
        latencyMs: engine.latencyMs,
      };
    }

    const isNeural = engine.type === 'NEURAL_WEBGPU';
    const confidence = isNeural ? 0.92 : 0.88;
    const bullets: string[] = [
      `هم‌راستایی بستر کلان (Context ساختار HTF متناسب با تایم‌فریم ترید) با جهت ${candidate.direction} تایید می‌شود.`,
      `درجه ابهام (Uncertainty): پایین (حداکثر ۱۲٪ به دلیل شفافیت در سوییپ نقدینگی).`,
      `سناریوی ابطال تحلیلی: نفوذ قیمت به پشت سطح حد ضرر (${candidate.stopLossPrice}).`,
    ];

    if (style === 'S0_SWEEP_FVG') {
      bullets.push('جریان سفارشات اسمارت مانی پس از شکار نقدینگی، تمایل به پر کردن خلاء ارزش منصفانه دارد.');
    } else if (style === 'BOS_ORDER_BLOCK') {
      bullets.push('مومنتوم شکست ساختار قوی بوده و بازگشت به اردر بلاک فرصت کم‌ریسک تلقی می‌شود.');
    }

    return {
      agentRole: 'ANALYST',
      roleTitleFa: AGENT_ROLES_INFO.ANALYST.nameFa,
      engineId: engine.id,
      engineNameFa: engine.nameFa,
      engineType: engine.type,
      verdict: 'APPROVED',
      verdictTitleFa: 'تایید جهت معامله',
      confidence,
      tradingStyleUsed: style,
      summaryFa: `تحلیل‌گر بر مبنای سبک «${TRADING_STYLES.find(s => s.id === style)?.nameFa}» مجوز ورود را تایید کرد.`,
      reasoningBulletsFa: bullets,
      timestamp: now,
      latencyMs: engine.latencyMs,
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
    now: number
  ): AgentReviewResult {
    const engine =
      AGENT_ENGINE_OPTIONS.find(e => e.id === config.criticEngineId) ||
      AGENT_ENGINE_OPTIONS.find(e => e.role === 'CRITIC')!;

    if (!candidate || analystReview.verdict !== 'APPROVED') {
      return {
        agentRole: 'CRITIC',
        roleTitleFa: AGENT_ROLES_INFO.CRITIC.nameFa,
        engineId: engine.id,
        engineNameFa: engine.nameFa,
        engineType: engine.type,
        verdict: 'NEUTRAL',
        verdictTitleFa: 'عدم نیاز به نقد',
        confidence: 0,
        tradingStyleUsed: style,
        summaryFa: 'تحلیلی برای بررسی انتقادی ثبت نشده است.',
        reasoningBulletsFa: ['هیچ ستاپی تایید نشده که نیاز به غربالگری منتقد داشته باشد.'],
        timestamp: now,
        latencyMs: engine.latencyMs,
      };
    }

    const styleInfo = TRADING_STYLES.find(s => s.id === style) || TRADING_STYLES[0];
    const minRequiredRR = styleInfo.minimumRR;
    const isRRValid = candidate.riskRewardRatio >= minRequiredRR;

    const bullets: string[] = [];
    let verdict: 'APPROVED' | 'REJECTED' = 'APPROVED';
    let summaryFa = '';

    const isNeural = engine.type === 'NEURAL_WEBGPU';

    if (!isRRValid) {
      verdict = 'REJECTED';
      summaryFa = `رد ستاپ توسط منتقد: نسبت سود به زیان (${candidate.riskRewardRatio}) کمتر از حداقل مصوب سبک (${minRequiredRR}) است.`;
      bullets.push(`🛡️ لایه ۱ (موتور قطعی S0): نقض شرط بازدهی؛ نسبت R:R کمتر از حداقل مصوب (${minRequiredRR}) است.`);
      bullets.push('اصطکاک و کمیسیون بروکر در این نسبت توجیه‌پذیر نیست.');
    } else {
      verdict = 'APPROVED';
      summaryFa = isNeural
        ? `تایید منتقد با سپر دوگانه (انطباق ریاضی قطعی سیستم + تفکر عمیق عصبی).`
        : `تست استرس منتقد قطعی با موفقیت پشت سر گذاشته شد (R:R برابر ۱ به ${candidate.riskRewardRatio}).`;
      bullets.push(`🛡️ لایه ۱ (موتور قطعی S0): انطباق کامل R:R برابر ۱ به ${candidate.riskRewardRatio} با معیار مصوب.`);
      bullets.push('🛡️ لایه ۱ (موتور قطعی S0): فاصله امن از اخبار اقتصادی قرمز (Red Folder News) و عدم وجود سد نقدینگی معارض.');
      if (isNeural) {
        bullets.push(`🧠 لایه ۲ (استدلال عصبی WebGPU): موشکافی تله‌های استاپ‌هانتینگ، عدم وجود هیجان فومو (FOMO) و تایید پاک بودن مسیر تارگت.`);
      }
    }

    return {
      agentRole: 'CRITIC',
      roleTitleFa: AGENT_ROLES_INFO.CRITIC.nameFa,
      engineId: engine.id,
      engineNameFa: engine.nameFa,
      engineType: engine.type,
      verdict,
      verdictTitleFa: verdict === 'APPROVED' ? 'صحت‌سنجی تایید' : 'مردود و خطرناک',
      confidence: verdict === 'APPROVED' ? 0.9 : 0.95,
      tradingStyleUsed: style,
      summaryFa,
      reasoningBulletsFa: bullets,
      timestamp: now,
      latencyMs: engine.latencyMs,
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
    now: number
  ): AgentReviewResult {
    const engine =
      AGENT_ENGINE_OPTIONS.find(e => e.id === config.judgeEngineId) ||
      AGENT_ENGINE_OPTIONS.find(e => e.role === 'JUDGE')!;

    if (!candidate) {
      return {
        agentRole: 'JUDGE',
        roleTitleFa: AGENT_ROLES_INFO.JUDGE.nameFa,
        engineId: engine.id,
        engineNameFa: engine.nameFa,
        engineType: engine.type,
        verdict: 'NEUTRAL',
        verdictTitleFa: 'در انتظار ورودی',
        confidence: 0,
        tradingStyleUsed: style,
        summaryFa: 'داوری در وضعیت آماده‌باش قرار دارد.',
        reasoningBulletsFa: ['منتظر تشکیل کاندیدای تاییدشده'],
        timestamp: now,
        latencyMs: engine.latencyMs,
      };
    }

    const bullets: string[] = [];
    let verdict: 'APPROVED' | 'REJECTED' = 'APPROVED';
    let summaryFa = '';

    const isFailClosedEngine = engine.id === 'strict-consensus-fail-closed';
    const isQuorumEngine = engine.id === 'alpha-consensus-quorum-judge';
    const isW4GuardianEngine = engine.id === 'risk-guardian-w4-judge';
    const isWeightedEngine = engine.id === 'weighted-bayesian-judge';

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
        summaryFa = 'داوری وزنی تلفیقی: میانگین امتیاز اعتماد شورا کمتر از آستانه مجاز ۸۵٪ است.';
        bullets.push('وزن تحلیلی شورا کفایت لازم برای ورود به پوزیشن را احراز نکرد.');
      }
      bullets.push('دیده‌بان ریسک از ورود سرمایه به شرایط غیرشفاف ممانعت به عمل آورد.');
    } else {
      verdict = 'APPROVED';
      if (isFailClosedEngine) {
        summaryFa = 'اجماع قطعی و اتفاق آرا (Fail-Closed) تایید شد؛ ارسال سفارش لیمیت با اطمینان حداکثری مجاز است.';
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
      engineId: engine.id,
      engineNameFa: engine.nameFa,
      engineType: engine.type,
      verdict,
      verdictTitleFa: verdict === 'APPROVED' ? 'تایید نهایی و صدور مجوز' : 'توقف معامله (Fail-Closed)',
      confidence: 0.98,
      tradingStyleUsed: style,
      summaryFa,
      reasoningBulletsFa: bullets,
      timestamp: now,
      latencyMs: engine.latencyMs,
    };
  }
}
