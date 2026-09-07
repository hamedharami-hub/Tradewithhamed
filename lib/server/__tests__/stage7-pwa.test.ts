import {
  validatePwaManifest,
  evaluateSessionStability,
  evaluateFoldableLayout,
} from '../../core/pwa-session-validator';
import { PwaManifestContract, DeviceSessionStability } from '../../contracts/pwa';

export interface Stage7TestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runStage7PwaTests(): Promise<Stage7TestResult[]> {
  const results: Stage7TestResult[] = [];

  // ۱. آزمون انطباق استانداردهای مانیفست وب‌اپلیکیشن پیش‌رونده (PWA Manifest Standards)
  try {
    const validManifest: PwaManifestContract = {
      id: '/',
      name: 'Hamed Trading Lab',
      short_name: 'TradingLab',
      description: 'سامانه شخصی تحلیل و معامله آزمایشی cTrader برای ویندوز و اندروید',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#09090b',
      theme_color: '#09090b',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };

    const res = validatePwaManifest(validManifest);
    const passed =
      res.isValid &&
      res.summary.isShortNameCompliant &&
      res.summary.isStandalone &&
      res.summary.has192Icon &&
      res.summary.has512Icon &&
      res.summary.hasMaskableIcon;

    results.push({
      name: 'PWA Web App Manifest Standards Compliance',
      passed,
      details: `اعتبارسنجی مانیفست: وضعیت=${res.isValid} | نام کوتاه: ${validManifest.short_name} (${validManifest.short_name.length} کاراکتر) | حالت=${validManifest.display}`,
    });
  } catch (err) {
    results.push({
      name: 'PWA Web App Manifest Standards Compliance',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. آزمون کنترل سخت‌گیرانه رد مانیفست نامعتبر (Fail-Closed Manifest Validation)
  try {
    const invalidManifest: Partial<PwaManifestContract> = {
      name: 'Test App',
      display: 'browser', // غیر standalone
      icons: [], // بدون آیکون
    };

    const res = validatePwaManifest(invalidManifest);
    const passed = !res.isValid && res.errors.length >= 2;

    results.push({
      name: 'Manifest Failure Detection & Strict Safeguards',
      passed,
      details: `خطاهای کشف‌شده: ${res.errors.length} مورد (${res.errors.join(' | ')})`,
    });
  } catch (err) {
    results.push({
      name: 'Manifest Failure Detection & Strict Safeguards',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. آزمون ضربان قلب دستگاه مجری و پایداری نشست (Device Executor Session Heartbeat)
  try {
    const now = Date.now();
    const activeSession: DeviceSessionStability = {
      deviceId: 'PIXEL-9-PRO-FOLD-SN-7890',
      deviceType: 'PIXEL_FOLD',
      isDesignatedExecutor: true,
      lastHeartbeatTimestamp: now - 5000, // ۵ ثانیه قبل
      isSessionActive: true,
      isBackgroundSuspensionRisk: false,
    };

    const activeRes = evaluateSessionStability(activeSession, now);

    const staleSession: DeviceSessionStability = {
      ...activeSession,
      lastHeartbeatTimestamp: now - 35000, // ۳۵ ثانیه قبل (بیات و منقضی)
    };
    const staleRes = evaluateSessionStability(staleSession, now);

    const nonExecutorSession: DeviceSessionStability = {
      ...activeSession,
      isDesignatedExecutor: false,
    };
    const nonExecRes = evaluateSessionStability(nonExecutorSession, now);

    const passed =
      activeRes.isValid === true &&
      staleRes.isValid === false &&
      nonExecRes.isValid === false;

    results.push({
      name: 'Designated Device Executor & Heartbeat Stability Guard',
      passed,
      details: `نشست فعال: ${activeRes.isValid} | نشست منقضی: ${staleRes.isValid} (${staleRes.reason}) | دستگاه غیرمجاز: ${nonExecRes.isValid}`,
    });
  } catch (err) {
    results.push({
      name: 'Designated Device Executor & Heartbeat Stability Guard',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. آزمون ممانعت از ارسال سفارش در شرایط تعلیق پس‌زمینه اندروید/وب (Background Suspension Fail-Closed)
  try {
    const now = Date.now();
    const suspendedSession: DeviceSessionStability = {
      deviceId: 'ANDROID-PWA-DEV-1',
      deviceType: 'ANDROID_PHONE',
      isDesignatedExecutor: true,
      lastHeartbeatTimestamp: now - 2000,
      isSessionActive: true,
      isBackgroundSuspensionRisk: true, // وب در پس‌زمینه معلق شده است
    };

    const res = evaluateSessionStability(suspendedSession, now);
    const passed = res.isValid === false && (res.reason?.includes('پس‌زمینه') ?? false);

    results.push({
      name: 'Android Background Web Suspension Safety Guard (Fail-Closed)',
      passed,
      details: `وضعیت مسدودسازی امن: ${!res.isValid} | دلیل: ${res.reason}`,
    });
  } catch (err) {
    results.push({
      name: 'Android Background Web Suspension Safety Guard (Fail-Closed)',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. آزمون واکنش‌پذیری نمایشگرهای تاشو (Pixel 9 Pro Fold Layout & Dual-Pane Metrics)
  try {
    // ابعاد نمایشگر تاشو پیکسل در حالت باز (تقریباً 1080x1200 با نسبت ۱٫۱)
    const foldLayout = evaluateFoldableLayout(980, 1080);
    // ابعاد موبایل معمولی عمودی
    const phoneLayout = evaluateFoldableLayout(390, 844);

    const passed =
      foldLayout.isFoldableDevice === true &&
      foldLayout.paneMode === 'DUAL_PANE_EXPANDED' &&
      phoneLayout.isFoldableDevice === false &&
      phoneLayout.paneMode === 'SINGLE_PANE';

    results.push({
      name: 'Foldable Device Layout & Dual-Pane Adaptability (Pixel 9 Pro Fold)',
      passed,
      details: `حالت فولد (${foldLayout.viewportWidth}x${foldLayout.viewportHeight}): ${foldLayout.paneMode} | حالت موبایل ساده (${phoneLayout.viewportWidth}x${phoneLayout.viewportHeight}): ${phoneLayout.paneMode}`,
    });
  } catch (err) {
    results.push({
      name: 'Foldable Device Layout & Dual-Pane Adaptability (Pixel 9 Pro Fold)',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
