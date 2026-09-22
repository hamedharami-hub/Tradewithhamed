// lib/core/strategy-legacy-adapters.ts
// آداپتورهای تبدیل و همگام‌سازی سبک‌ها و استراتژی‌های موجود به فرمت نسخه‌دار StrategyDefinition
// تضمین سازگاری ۱۰۰٪ با ۵ سبک معاملاتی Core و ۶ استراتژی موتور Research

import type { StrategyDefinition } from '../contracts/strategy-definition';
import { STRATEGY_DEFINITION_SCHEMA_VERSION } from '../contracts/strategy-definition';
import type { TradingStyleType } from '../contracts/regimes';
import type { StrategyVariantId } from '../research/contracts';
import { calculateStrategyHash } from './strategy-definition-serializer';
import type { RuleParameters } from '../research/strategy-rules';
import { DEFAULT_RULE_PARAMETERS, RESEARCH_RULE_VERSION } from '../research/strategy-rules';

export class StrategyLegacyAdapters {
  /**
   * تبدیل ۶ استراتژی موتور Research به StrategyDefinition متعارف
   */
  public static createResearchVariantDefinition(
    variant: StrategyVariantId,
    overrides: Partial<RuleParameters> = {}
  ): StrategyDefinition {
    const params: RuleParameters = { ...DEFAULT_RULE_PARAMETERS, ...overrides };
    const createdAt = 1711000000000;

    let def: StrategyDefinition;

    switch (variant) {
      case 'S0_SWEEP_ONLY':
        def = {
          schemaVersion: STRATEGY_DEFINITION_SCHEMA_VERSION,
          definitionId: 'STRAT_RESEARCH_S0_SWEEP_ONLY',
          definitionVersion: '1.0.0',
          nameFa: 'تحقیقاتی S0: سوییپ نقدینگی محض',
          nameEn: 'Research S0 Sweep Only',
          descriptionFa: 'استراتژی بر مبنای نفوذ شدو فراتر از سووینگ‌های کلیدی و بازگشت کلوز به داخل سطح.',
          family: 'SMC',
          tags: ['SMC', 'SWEEP', 'RESEARCH'],
          status: 'VALID',
          executionTimeframe: '15M',
          requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
          trigger: {
            groupId: 'grp_sweep_trigger',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_sweep_1',
                ruleId: 'SMC_LIQUIDITY_SWEEP',
                ruleVersion: '1.0.0',
                parameters: {
                  minPenetrationPips: params.minSweepPenetrationAtr,
                  reclaimMode: 'CLOSE_RECLAIM',
                },
                enabled: true,
              },
            ],
          },
          entry: {
            instanceId: 'inst_entry_market',
            ruleId: 'EXEC_MARKET',
            ruleVersion: '1.0.0',
            parameters: { orderType: 'MARKET' },
          },
          risk: {
            instanceId: 'inst_risk_atr',
            ruleId: 'RISK_ATR',
            ruleVersion: '1.0.0',
            parameters: {
              stopLossAtrBuffer: params.stopLossAtrBuffer,
              targetRiskReward: params.targetRiskReward,
              expiryBars: params.expiryBars,
            },
          },
          exit: {
            groupId: 'grp_exit',
            operator: 'ANY',
            rules: [],
          },
          metadata: {
            author: 'Antigravity Research Core',
            createdAt,
            updatedAt: createdAt,
            deterministicHash: '',
            notesFa: 'تولیدشده توسط StrategyLegacyAdapters از نسخه Research S0',
          },
          migratedFromLegacyId: 'S0_SWEEP_ONLY',
        };
        break;

      case 'S0_SWEEP_FVG':
        def = {
          schemaVersion: STRATEGY_DEFINITION_SCHEMA_VERSION,
          definitionId: 'STRAT_RESEARCH_S0_SWEEP_FVG',
          definitionVersion: '1.0.0',
          nameFa: 'تحقیقاتی S0: ترکیب سوییپ نقدینگی و FVG',
          nameEn: 'Research S0 Sweep + FVG',
          descriptionFa: 'سوییپ نقدینگی سووینگ‌های تاییدشده همراه با تاییدیه تشکیل گپ ارزش منصفانه.',
          family: 'SMC',
          tags: ['SMC', 'SWEEP', 'FVG', 'RESEARCH'],
          status: 'VALID',
          executionTimeframe: '15M',
          requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
          setup: {
            groupId: 'grp_fvg_setup',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_fvg_setup',
                ruleId: 'SMC_FVG',
                ruleVersion: '1.0.0',
                parameters: {
                  measurementMode: 'WICK_TO_WICK',
                  minGapPips: params.minFvgSizeAtr,
                },
                enabled: true,
              },
            ],
          },
          trigger: {
            groupId: 'grp_sweep_trigger',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_sweep_trigger',
                ruleId: 'SMC_LIQUIDITY_SWEEP',
                ruleVersion: '1.0.0',
                parameters: {
                  minPenetrationPips: params.minSweepPenetrationAtr,
                  reclaimMode: 'CLOSE_RECLAIM',
                },
                enabled: true,
              },
            ],
          },
          entry: {
            instanceId: 'inst_entry_market',
            ruleId: 'EXEC_MARKET',
            ruleVersion: '1.0.0',
            parameters: { orderType: 'MARKET' },
          },
          risk: {
            instanceId: 'inst_risk_atr',
            ruleId: 'RISK_ATR',
            ruleVersion: '1.0.0',
            parameters: {
              stopLossAtrBuffer: params.stopLossAtrBuffer,
              targetRiskReward: params.targetRiskReward,
              expiryBars: params.expiryBars,
            },
          },
          exit: {
            groupId: 'grp_exit',
            operator: 'ANY',
            rules: [],
          },
          metadata: {
            author: 'Antigravity Research Core',
            createdAt,
            updatedAt: createdAt,
            deterministicHash: '',
            notesFa: 'تولیدشده توسط StrategyLegacyAdapters از نسخه Research S0_SWEEP_FVG',
          },
          migratedFromLegacyId: 'S0_SWEEP_FVG',
        };
        break;

      case 'BOS_ORDER_BLOCK_V1':
        def = {
          schemaVersion: STRATEGY_DEFINITION_SCHEMA_VERSION,
          definitionId: 'STRAT_RESEARCH_BOS_ORDER_BLOCK_V1',
          definitionVersion: '1.0.0',
          nameFa: 'تحقیقاتی: شکست ساختار و اردر بلاک (BOS + OB)',
          nameEn: 'Research BOS + Order Block V1',
          descriptionFa: 'شکست ساختار سووینگ‌های تاییدشده همراه با نقطه توقف اردر بلاک.',
          family: 'SMC',
          tags: ['SMC', 'BOS', 'ORDER_BLOCK'],
          status: 'VALID',
          executionTimeframe: '15M',
          requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
          trigger: {
            groupId: 'grp_bos_trigger',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_bos_trigger',
                ruleId: 'SMC_BOS',
                ruleVersion: '1.0.0',
                parameters: { breakMode: 'CLOSE_BREAK', bufferPips: 0 },
                enabled: true,
              },
            ],
          },
          entry: {
            instanceId: 'inst_entry_market',
            ruleId: 'EXEC_MARKET',
            ruleVersion: '1.0.0',
            parameters: { orderType: 'MARKET' },
          },
          risk: {
            instanceId: 'inst_risk_atr',
            ruleId: 'RISK_ATR',
            ruleVersion: '1.0.0',
            parameters: {
              stopLossAtrBuffer: params.stopLossAtrBuffer,
              targetRiskReward: params.targetRiskReward,
              expiryBars: params.expiryBars,
            },
          },
          exit: {
            groupId: 'grp_exit',
            operator: 'ANY',
            rules: [],
          },
          metadata: {
            author: 'Antigravity Research Core',
            createdAt,
            updatedAt: createdAt,
            deterministicHash: '',
          },
          migratedFromLegacyId: 'BOS_ORDER_BLOCK_V1',
        };
        break;

      case 'FVG_EQUILIBRIUM_V1':
        def = {
          schemaVersion: STRATEGY_DEFINITION_SCHEMA_VERSION,
          definitionId: 'STRAT_RESEARCH_FVG_EQUILIBRIUM_V1',
          definitionVersion: '1.0.0',
          nameFa: 'تحقیقاتی: بازگشت به تعادل ۵۰٪ FVG',
          nameEn: 'Research FVG Equilibrium V1',
          descriptionFa: 'ورود بر مبنای پولبک و لمس سطح ۵۰٪ شکاف ارزش منصفانه قبلی.',
          family: 'SMC',
          tags: ['SMC', 'FVG', 'EQUILIBRIUM'],
          status: 'VALID',
          executionTimeframe: '15M',
          requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
          trigger: {
            groupId: 'grp_fvg_mid_trigger',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_fvg_mid_trigger',
                ruleId: 'SMC_FVG_MIDPOINT',
                ruleVersion: '1.0.0',
                parameters: { lookbackBars: params.expiryBars, direction: 'BUY' },
                enabled: true,
              },
            ],
          },
          entry: {
            instanceId: 'inst_entry_market',
            ruleId: 'EXEC_MARKET',
            ruleVersion: '1.0.0',
            parameters: { orderType: 'MARKET' },
          },
          risk: {
            instanceId: 'inst_risk_atr',
            ruleId: 'RISK_ATR',
            ruleVersion: '1.0.0',
            parameters: {
              stopLossAtrBuffer: params.stopLossAtrBuffer,
              targetRiskReward: params.targetRiskReward,
              expiryBars: params.expiryBars,
            },
          },
          exit: {
            groupId: 'grp_exit',
            operator: 'ANY',
            rules: [],
          },
          metadata: {
            author: 'Antigravity Research Core',
            createdAt,
            updatedAt: createdAt,
            deterministicHash: '',
          },
          migratedFromLegacyId: 'FVG_EQUILIBRIUM_V1',
        };
        break;

      case 'MEAN_REVERSION_V1':
        def = {
          schemaVersion: STRATEGY_DEFINITION_SCHEMA_VERSION,
          definitionId: 'STRAT_RESEARCH_MEAN_REVERSION_V1',
          definitionVersion: '1.0.0',
          nameFa: 'تحقیقاتی: بازگشت به میانگین با Z-Score',
          nameEn: 'Research Mean Reversion V1',
          descriptionFa: 'ورود بر مبنای انحراف معیار قیمتی فراتر از ۲ سیگما نسبت به میانگین ۲۰ کندل قبل.',
          family: 'STAT_ARB',
          tags: ['MEAN_REVERSION', 'Z_SCORE'],
          status: 'VALID',
          executionTimeframe: '15M',
          requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
          trigger: {
            groupId: 'grp_zscore_trigger',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_zscore_trigger',
                ruleId: 'TECH_ZSCORE',
                ruleVersion: '1.0.0',
                parameters: {
                  lookback: params.meanReversionLookback,
                  threshold: params.meanReversionEntryZScore,
                  direction: 'BUY',
                },
                enabled: true,
              },
            ],
          },
          entry: {
            instanceId: 'inst_entry_market',
            ruleId: 'EXEC_MARKET',
            ruleVersion: '1.0.0',
            parameters: { orderType: 'MARKET' },
          },
          risk: {
            instanceId: 'inst_risk_atr',
            ruleId: 'RISK_ATR',
            ruleVersion: '1.0.0',
            parameters: {
              stopLossAtrBuffer: params.stopLossAtrBuffer,
              targetRiskReward: params.targetRiskReward,
              expiryBars: params.expiryBars,
            },
          },
          exit: {
            groupId: 'grp_exit',
            operator: 'ANY',
            rules: [],
          },
          metadata: {
            author: 'Antigravity Research Core',
            createdAt,
            updatedAt: createdAt,
            deterministicHash: '',
          },
          migratedFromLegacyId: 'MEAN_REVERSION_V1',
        };
        break;

      case 'TREND_BREAKOUT_55_EMA200_V1':
        def = {
          schemaVersion: STRATEGY_DEFINITION_SCHEMA_VERSION,
          definitionId: 'STRAT_RESEARCH_TREND_BREAKOUT_55_EMA200_V1',
          definitionVersion: '1.0.0',
          nameFa: 'تحقیقاتی: شکست کانال ۵۵ دوره‌ای دانچیان با فیلتر EMA200',
          nameEn: 'Research Trend Breakout 55 + EMA200 V1',
          descriptionFa: 'شکست سقف/کف ۵۵ کندل گذشته مشروط به هم‌راستایی شیب میانگین متحرک ۲۰۰ دوره‌ای.',
          family: 'TREND',
          tags: ['TREND', 'DONCHIAN', 'EMA'],
          status: 'VALID',
          executionTimeframe: '15M',
          requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
          context: {
            groupId: 'grp_ema_slope_context',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_ema_slope',
                ruleId: 'TECH_EMA_SLOPE',
                ruleVersion: '1.0.0',
                parameters: {
                  period: params.trendEmaPeriod,
                  requiredDirection: 'RISING',
                },
                enabled: true,
              },
            ],
          },
          trigger: {
            groupId: 'grp_donchian_trigger',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_donchian_breakout',
                ruleId: 'TECH_DONCHIAN_BREAKOUT',
                ruleVersion: '1.0.0',
                parameters: {
                  period: params.trendChannelLookback,
                  requiredBreakout: 'UP',
                },
                enabled: true,
              },
            ],
          },
          entry: {
            instanceId: 'inst_entry_market',
            ruleId: 'EXEC_MARKET',
            ruleVersion: '1.0.0',
            parameters: { orderType: 'MARKET' },
          },
          risk: {
            instanceId: 'inst_risk_atr',
            ruleId: 'RISK_ATR',
            ruleVersion: '1.0.0',
            parameters: {
              stopLossAtrBuffer: params.trendStopAtrMultiple,
              targetRiskReward: params.trendTargetAtrMultiple / params.trendStopAtrMultiple,
              expiryBars: params.expiryBars,
            },
          },
          exit: {
            groupId: 'grp_exit',
            operator: 'ANY',
            rules: [],
          },
          metadata: {
            author: 'Antigravity Research Core',
            createdAt,
            updatedAt: createdAt,
            deterministicHash: '',
          },
          migratedFromLegacyId: 'TREND_BREAKOUT_55_EMA200_V1',
        };
        break;

      default:
        throw new Error(`واریانت ناشناخته استراتژی Research: ${variant}`);
    }

    def.metadata.deterministicHash = calculateStrategyHash(def);

    return def;
  }

  /**
   * تبدیل ۵ سبک معاملاتی Core به StrategyDefinition متعارف
   */
  public static createLegacyStyleDefinition(
    style: TradingStyleType,
    overrides: Record<string, unknown> = {}
  ): StrategyDefinition {
    const createdAt = 1711000000000;
    let def: StrategyDefinition;

    switch (style) {
      case 'SCALP_M1_M5':
        def = {
          schemaVersion: STRATEGY_DEFINITION_SCHEMA_VERSION,
          definitionId: 'STRAT_CORE_SCALP_M1_M5',
          definitionVersion: '1.0.0',
          nameFa: 'سبک اسکلپینگ سریع (M1-M5)',
          nameEn: 'Fast Scalping M1-M5',
          descriptionFa: 'استراتژی مومنتوم سریع مبتنی بر بازگشت‌ها و نوسانات فشرده تایم‌فریم‌های ۱ و ۵ دقیقه.',
          family: 'SCALP',
          tags: ['SCALP', 'MOMENTUM', 'M1', 'M5'],
          status: 'VALID',
          executionTimeframe: '5M',
          requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
          context: {
            groupId: 'grp_scalp_context',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_scalp_ema_pos',
                ruleId: 'TECH_EMA_POSITION',
                ruleVersion: '1.0.0',
                parameters: { period: 50, requiredPosition: 'ABOVE' },
              },
            ],
          },
          trigger: {
            groupId: 'grp_scalp_trigger',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_scalp_donchian',
                ruleId: 'TECH_DONCHIAN_BREAKOUT',
                ruleVersion: '1.0.0',
                parameters: { period: 10, requiredBreakout: 'UP' },
              },
            ],
          },
          entry: {
            instanceId: 'inst_entry',
            ruleId: 'EXEC_MARKET',
            ruleVersion: '1.0.0',
            parameters: { orderType: 'MARKET' },
          },
          risk: {
            instanceId: 'inst_risk',
            ruleId: 'RISK_ATR',
            ruleVersion: '1.0.0',
            parameters: { stopLossAtrBuffer: 0.2, targetRiskReward: 1.5, expiryBars: 6 },
          },
          exit: {
            groupId: 'grp_exit',
            operator: 'ANY',
            rules: [],
          },
          metadata: {
            author: 'Antigravity Core',
            createdAt,
            updatedAt: createdAt,
            deterministicHash: '',
          },
          migratedFromLegacyId: 'SCALP_M1_M5',
        };
        break;

      case 'SMC_INTRADAY':
        def = this.createResearchVariantDefinition('S0_SWEEP_FVG');
        def.definitionId = 'STRAT_CORE_SMC_INTRADAY';
        def.nameFa = 'سبک اسمارت مانی درون‌روز (SMC Intraday)';
        def.nameEn = 'SMC Intraday Standard';
        def.migratedFromLegacyId = 'SMC_INTRADAY';
        break;

      case 'TREND_BREAKOUT':
        def = this.createResearchVariantDefinition('TREND_BREAKOUT_55_EMA200_V1');
        def.definitionId = 'STRAT_CORE_TREND_BREAKOUT';
        def.nameFa = 'سبک شکست روند (Trend Breakout)';
        def.nameEn = 'Trend Breakout Standard';
        def.migratedFromLegacyId = 'TREND_BREAKOUT';
        break;

      case 'SWING_MACRO':
        def = {
          schemaVersion: STRATEGY_DEFINITION_SCHEMA_VERSION,
          definitionId: 'STRAT_CORE_SWING_MACRO',
          definitionVersion: '1.0.0',
          nameFa: 'سبک سووینگ کلان (Swing Macro)',
          nameEn: 'Macro Swing Trend',
          descriptionFa: 'معاملات سووینگ بلندمدت هماهنگ با ساختار کلان بازار و تایم‌فریم‌های ۴ ساعته و روزانه.',
          family: 'SWING',
          tags: ['SWING', 'MACRO', 'D1', 'H4'],
          status: 'VALID',
          executionTimeframe: '4H',
          contextTimeframes: ['D1'],
          requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
          context: {
            groupId: 'grp_macro_ema_context',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_macro_ema',
                ruleId: 'TECH_EMA_POSITION',
                ruleVersion: '1.0.0',
                parameters: { period: 200, requiredPosition: 'ABOVE' },
              },
            ],
          },
          trigger: {
            groupId: 'grp_macro_bos_trigger',
            operator: 'ALL',
            rules: [
              {
                instanceId: 'inst_macro_bos',
                ruleId: 'SMC_BOS',
                ruleVersion: '1.0.0',
                parameters: { breakMode: 'CLOSE_BREAK', bufferPips: 0 },
              },
            ],
          },
          entry: {
            instanceId: 'inst_entry',
            ruleId: 'EXEC_MARKET',
            ruleVersion: '1.0.0',
            parameters: { orderType: 'MARKET' },
          },
          risk: {
            instanceId: 'inst_risk',
            ruleId: 'RISK_ATR',
            ruleVersion: '1.0.0',
            parameters: { stopLossAtrBuffer: 0.5, targetRiskReward: 3.0, expiryBars: 24 },
          },
          exit: {
            groupId: 'grp_exit',
            operator: 'ANY',
            rules: [],
          },
          metadata: {
            author: 'Antigravity Core',
            createdAt,
            updatedAt: createdAt,
            deterministicHash: '',
          },
          migratedFromLegacyId: 'SWING_MACRO',
        };
        break;

      case 'MEAN_REVERSION':
        def = this.createResearchVariantDefinition('MEAN_REVERSION_V1');
        def.definitionId = 'STRAT_CORE_MEAN_REVERSION';
        def.nameFa = 'سبک بازگشت به میانگین آماری (Mean Reversion)';
        def.nameEn = 'Mean Reversion Standard';
        def.migratedFromLegacyId = 'MEAN_REVERSION';
        break;

      default:
        throw new Error(`سبک معاملاتی ناشناخته: ${style}`);
    }

    def.metadata.deterministicHash = calculateStrategyHash(def);

    return def;
  }

  /**
   * تابع عمومی مهاجرت از شناسه قدیمی به StrategyDefinition
   */
  public static migrateLegacyToDefinition(legacyId: string): StrategyDefinition {
    // بررسی آیا واریانت Research است
    const researchVariants: StrategyVariantId[] = [
      'S0_SWEEP_ONLY',
      'S0_SWEEP_FVG',
      'BOS_ORDER_BLOCK_V1',
      'FVG_EQUILIBRIUM_V1',
      'MEAN_REVERSION_V1',
      'TREND_BREAKOUT_55_EMA200_V1',
    ];
    if (researchVariants.includes(legacyId as StrategyVariantId)) {
      return this.createResearchVariantDefinition(legacyId as StrategyVariantId);
    }

    // بررسی آیا سبک Core است
    const coreStyles: TradingStyleType[] = [
      'SCALP_M1_M5',
      'SMC_INTRADAY',
      'TREND_BREAKOUT',
      'SWING_MACRO',
      'MEAN_REVERSION',
    ];
    if (coreStyles.includes(legacyId as TradingStyleType)) {
      return this.createLegacyStyleDefinition(legacyId as TradingStyleType);
    }

    throw new Error(`شناسه استراتژی قدیمی '${legacyId}' معتبر نیست.`);
  }
}
