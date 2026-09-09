import { StressScenario } from './contracts';

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'xauusd-flash-crash-5pct',
    nameFa: 'سقوط ناگهانی ۵ درصدی طلا',
    type: 'FLASH_CRASH',
    symbol: 'XAUUSD',
    seed: 20260909,
    parameters: { shockPercent: 5, spreadPips: 18, maxRiskPercent: 0.25 },
  },
  {
    id: 'eurusd-stale-feed-10s',
    nameFa: 'قدیمی‌شدن فید یورو برای ۱۰ ثانیه',
    type: 'STALE_FEED',
    symbol: 'EURUSD',
    seed: 20260910,
    parameters: { staleAfterMs: 5000, outageMs: 10000, maxRiskPercent: 0.25 },
  },
  {
    id: 'xauusd-duplicate-submit',
    nameFa: 'ارسال تکراری سفارش طلا',
    type: 'DUPLICATE_SUBMIT',
    symbol: 'XAUUSD',
    seed: 20260911,
    parameters: { attempts: 5, maxRiskPercent: 0.25 },
  },
  {
    id: 'eurusd-broker-timeout',
    nameFa: 'تایم‌اوت بروکر و بازتطبیق اجباری',
    type: 'BROKER_TIMEOUT',
    symbol: 'EURUSD',
    seed: 20260912,
    parameters: { timeoutMs: 3000, maxRiskPercent: 0.25 },
  },
];

export function getStressScenario(scenarioId: string): StressScenario | undefined {
  return STRESS_SCENARIOS.find(scenario => scenario.id === scenarioId);
}
