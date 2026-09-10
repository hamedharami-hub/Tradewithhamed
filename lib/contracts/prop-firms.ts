// lib/contracts/prop-firms.ts
// مشخصات و پیش‌تنظیمات قوانین شرکت‌های پراپ‌فرم بین‌المللی (Prop-Firm Evaluation Rules)

export type PropFirmId =
  | 'FTMO_NORMAL'
  | 'THE5ERS_HIGH_STAKES'
  | 'FUNDEDNEXT_STELLAR'
  | 'PERSONAL_STRICT';

export interface PropFirmPreset {
  id: PropFirmId;
  nameFa: string;
  nameEn: string;
  dailyDrawdownPercent: number;      // حداکثر افت مجاز روزانه (Daily Loss Limit)
  maxDrawdownPercent: number;        // حداکثر افت کل مجاز سبد (Max Total Drawdown)
  profitTargetPercent: number;       // تارگت سود مرحله اول ارزیابی (Phase 1 Target)
  maxRiskPerTradePercent: number;    // ریسک پیشنهادی در هر معامله جهت حفظ حساب
  prohibitNewsTrading: boolean;      // ممنوعیت معامله در زمان اخبار پرریسک
  weekendHoldingAllowed: boolean;    // مجاز بودن باز نگه‌داشتن معامله در تعطیلات آخر هفته
  minTradingDays?: number;           // حداقل روزهای معاملاتی
  descriptionFa: string;
}

export const PROP_FIRM_PRESETS: Record<PropFirmId, PropFirmPreset> = {
  FTMO_NORMAL: {
    id: 'FTMO_NORMAL',
    nameFa: 'چالش استاندارد FTMO (۱۰٪ / ۵٪)',
    nameEn: 'FTMO Standard Challenge',
    dailyDrawdownPercent: 5.0,
    maxDrawdownPercent: 10.0,
    profitTargetPercent: 10.0,
    maxRiskPerTradePercent: 1.0,
    prohibitNewsTrading: true,
    weekendHoldingAllowed: false,
    minTradingDays: 4,
    descriptionFa: 'سقف افت روزانه ۵٪، افت کل ۱۰٪، تارگت سود ۱۰٪ فاز یک و ممنوعیت معامله در اخبار قرمز.',
  },
  THE5ERS_HIGH_STAKES: {
    id: 'THE5ERS_HIGH_STAKES',
    nameFa: 'چالش The5ers های‌استیکز (۸٪ / ۴٪)',
    nameEn: 'The5ers High Stakes',
    dailyDrawdownPercent: 4.0,
    maxDrawdownPercent: 8.0,
    profitTargetPercent: 8.0,
    maxRiskPerTradePercent: 0.75,
    prohibitNewsTrading: false,
    weekendHoldingAllowed: true,
    minTradingDays: 3,
    descriptionFa: 'سقف افت روزانه ۴٪، افت کل ۸٪ و تارگت سود ۸٪ با انعطاف نگه‌داری معاملات در آخر هفته.',
  },
  FUNDEDNEXT_STELLAR: {
    id: 'FUNDEDNEXT_STELLAR',
    nameFa: 'چالش FundedNext استلار (۱۰٪ / ۵٪)',
    nameEn: 'FundedNext Stellar 2-Step',
    dailyDrawdownPercent: 5.0,
    maxDrawdownPercent: 10.0,
    profitTargetPercent: 8.0,
    maxRiskPerTradePercent: 1.0,
    prohibitNewsTrading: true,
    weekendHoldingAllowed: true,
    minTradingDays: 5,
    descriptionFa: 'سقف افت روزانه ۵٪، افت کل ۱۰٪ و تارگت سود ۸٪ بر اساس تعادل اکوئیتی و بالانس.',
  },
  PERSONAL_STRICT: {
    id: 'PERSONAL_STRICT',
    nameFa: 'مدیریت سرمایه سخت‌گیرانه شخصی (۶٪ / ۳٪)',
    nameEn: 'Personal Strict Capital Preservation',
    dailyDrawdownPercent: 3.0,
    maxDrawdownPercent: 6.0,
    profitTargetPercent: 6.0,
    maxRiskPerTradePercent: 0.5,
    prohibitNewsTrading: true,
    weekendHoldingAllowed: false,
    descriptionFa: 'سقف افت روزانه ۳٪، افت کل ۶٪ و سقف ریسک ۰٫۵٪ جهت تضمین بقای بلندمدت حساب شخصی.',
  },
};

export const DEFAULT_PROP_FIRM_ID: PropFirmId = 'FTMO_NORMAL';
