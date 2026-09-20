import { DataOriginType } from './provenance';

export type AppEnvironment = 'PRACTICE' | 'RESEARCH' | 'DEMO';

export interface EnvironmentConfig {
  id: AppEnvironment;
  titleFa: string;
  badgeFa: string;
  descriptionFa: string;
  route: '/practice' | '/research' | '/demo';
  allowedOrigins: DataOriginType[];
  allowBrokerWrite: boolean;
  storageKeyPrefix: string;
}

export const ENVIRONMENTS_CONFIG: Record<AppEnvironment, EnvironmentConfig> = {
  PRACTICE: {
    id: 'PRACTICE',
    titleFa: 'محیط تمرین و یادگیری',
    badgeFa: 'تمرین محلی (آفلاین)',
    descriptionFa: 'داده‌های نمونه تستی، حساب مجازی کلاینت و اجرای امن در مرورگر بدون اتصال به شبکه.',
    route: '/practice',
    allowedOrigins: ['SAMPLE_FIXTURE'],
    allowBrokerWrite: false,
    storageKeyPrefix: 'tradewithhamed_practice_',
  },
  RESEARCH: {
    id: 'RESEARCH',
    titleFa: 'میز پژوهش و بک‌تست تاریخی',
    badgeFa: 'پژوهش تاریخی',
    descriptionFa: 'دیتاست‌های تاریخی چندساله، آزمون‌های Walk-Forward، شبیه‌سازی مونت‌کارلو و بارگذاری CSV کاربر.',
    route: '/research',
    allowedOrigins: ['BUNDLED_HISTORICAL', 'USER_IMPORTED_CSV'],
    allowBrokerWrite: false,
    storageKeyPrefix: 'tradewithhamed_research_',
  },
  DEMO: {
    id: 'DEMO',
    titleFa: 'دموی آزمایشی cTrader',
    badgeFa: 'cTrader Demo',
    descriptionFa: 'فید مستقیم داده‌های آزمایشی بروکر، اعتبارسنجی نشست اپراتور و ثبت امن در صندوق تراکنش‌ها.',
    route: '/demo',
    allowedOrigins: ['BROKER_DEMO_FEED'],
    allowBrokerWrite: true,
    storageKeyPrefix: 'tradewithhamed_demo_',
  },
};
