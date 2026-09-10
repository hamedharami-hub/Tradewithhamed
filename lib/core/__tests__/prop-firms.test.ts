// lib/core/__tests__/prop-firms.test.ts
// آزمون‌های اعتبارسنجی قوانین و پیش‌تنظیمات چالش‌های پراپ‌فرم بین‌المللی

import {
  PropFirmId,
  PROP_FIRM_PRESETS,
  DEFAULT_PROP_FIRM_ID,
} from '../../contracts/prop-firms';

export interface PropFirmTestResult {
  name: string;
  passed: boolean;
  details?: string;
}

export function runPropFirmsSuite(): PropFirmTestResult[] {
  const results: PropFirmTestResult[] = [];

  // تست ۱: وجود پیش‌تنظیمات استاندارد چهارگانه
  const requiredPresets: PropFirmId[] = [
    'FTMO_NORMAL',
    'THE5ERS_HIGH_STAKES',
    'FUNDEDNEXT_STELLAR',
    'PERSONAL_STRICT',
  ];
  const allPresetsExist = requiredPresets.every(id => !!PROP_FIRM_PRESETS[id]);
  results.push({
    name: 'All 4 Prop Firm Presets Exist',
    passed: allPresetsExist,
    details: `Checked presets: ${requiredPresets.join(', ')}`,
  });

  // تست ۲: صحت نسبت دراوداون روزانه به کل دراوداون (Daily DD <= Max DD)
  let ddRatiosValid = true;
  for (const id of requiredPresets) {
    const p = PROP_FIRM_PRESETS[id];
    if (p.dailyDrawdownPercent > p.maxDrawdownPercent || p.dailyDrawdownPercent <= 0) {
      ddRatiosValid = false;
      break;
    }
  }
  results.push({
    name: 'Drawdown Math Invariants (Daily DD <= Max DD)',
    passed: ddRatiosValid,
    details: 'Verified daily loss limits are strictly less than or equal to total max drawdown',
  });

  // تست ۳: تأیید مشخصات عددی چالش FTMO (۵٪ روزانه / ۱۰٪ کل)
  const ftmo = PROP_FIRM_PRESETS.FTMO_NORMAL;
  const ftmoAccurate =
    ftmo.dailyDrawdownPercent === 5.0 &&
    ftmo.maxDrawdownPercent === 10.0 &&
    ftmo.profitTargetPercent === 10.0 &&
    ftmo.prohibitNewsTrading === true;
  results.push({
    name: 'FTMO Standard Parameters Match Challenge Specs',
    passed: ftmoAccurate,
    details: `FTMO dailyDD=${ftmo.dailyDrawdownPercent}%, maxDD=${ftmo.maxDrawdownPercent}%, newsProhibited=${ftmo.prohibitNewsTrading}`,
  });

  // تست ۴: تأیید مشخصات چالش The5ers High Stakes (۴٪ روزانه / ۸٪ کل)
  const the5ers = PROP_FIRM_PRESETS.THE5ERS_HIGH_STAKES;
  const the5ersAccurate =
    the5ers.dailyDrawdownPercent === 4.0 &&
    the5ers.maxDrawdownPercent === 8.0 &&
    the5ers.profitTargetPercent === 8.0 &&
    the5ers.weekendHoldingAllowed === true;
  results.push({
    name: 'The5ers High Stakes Parameters Match Challenge Specs',
    passed: the5ersAccurate,
    details: `The5ers dailyDD=${the5ers.dailyDrawdownPercent}%, maxDD=${the5ers.maxDrawdownPercent}%, weekendHolding=${the5ers.weekendHoldingAllowed}`,
  });

  // تست ۵: ارزیابی محافظه‌کارانه بودن تنظیمات شخصی (سقف ریسک ۰٫۵٪ و افت ۳٪)
  const personal = PROP_FIRM_PRESETS.PERSONAL_STRICT;
  const personalStrictValid =
    personal.dailyDrawdownPercent === 3.0 &&
    personal.maxDrawdownPercent === 6.0 &&
    personal.maxRiskPerTradePercent <= 0.5;
  results.push({
    name: 'Personal Strict Capital Preservation Invariants',
    passed: personalStrictValid,
    details: `Personal dailyDD=${personal.dailyDrawdownPercent}%, riskPerTrade=${personal.maxRiskPerTradePercent}%`,
  });

  // تست ۶: صحت پیش‌فرض سیستم
  results.push({
    name: 'Default Prop Firm Is Set To Standard Preset',
    passed: DEFAULT_PROP_FIRM_ID === 'FTMO_NORMAL',
    details: `DEFAULT_PROP_FIRM_ID is ${DEFAULT_PROP_FIRM_ID}`,
  });

  return results;
}
