import {
  PwaManifestContract,
  PwaManifestValidationResult,
  DeviceSessionStability,
  FoldableLayoutMetrics,
} from '../contracts/pwa';

export function validatePwaManifest(manifest: Partial<PwaManifestContract>): PwaManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.id) {
    errors.push('شناسه اپلیکیشن (id) در مانیفست الزامی است.');
  }

  if (!manifest.name || manifest.name.trim().length === 0) {
    errors.push('نام کامل اپلیکیشن (name) الزامی است.');
  }

  const shortName = manifest.short_name || '';
  const isShortNameCompliant = shortName.length > 0 && shortName.length <= 12;
  if (!shortName) {
    errors.push('نام کوتاه اپلیکیشن (short_name) الزامی است.');
  } else if (shortName.length > 12) {
    warnings.push(`نام کوتاه (${shortName}) بیش از ۱۲ کاراکتر است و در صفحه اصلی اندروید کوتاه خواهد شد.`);
  }

  const isStandalone = manifest.display === 'standalone';
  if (!isStandalone) {
    errors.push(`حالت نمایش باید standalone باشد؛ مقدار فعلی: ${manifest.display}`);
  }

  const icons = manifest.icons || [];
  const has192 = icons.some(i => i.sizes === '192x192' && i.type === 'image/png');
  const has512 = icons.some(i => i.sizes === '512x512' && i.type === 'image/png');
  const hasMaskable = icons.some(i => i.purpose?.includes('maskable'));

  if (!has192) {
    errors.push('آیکون با وضوح 192x192 از نوع image/png یافت نشد.');
  }
  if (!has512) {
    errors.push('آیکون با وضوح 512x512 از نوع image/png یافت نشد.');
  }
  if (!hasMaskable) {
    warnings.push('آیکون دارای purpose: maskable برای انطباق کامل با آیکون‌های متغیر اندروید یافت نشد.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary: {
      hasId: !!manifest.id,
      isShortNameCompliant,
      isStandalone,
      hasMaskableIcon: hasMaskable,
      has192Icon: has192,
      has512Icon: has512,
    },
  };
}

export function evaluateSessionStability(
  session: Partial<DeviceSessionStability>,
  currentTime: number = Date.now()
): { isValid: boolean; reason?: string } {
  if (!session.deviceId) {
    return { isValid: false, reason: 'شناسه دستگاه مجری ثبت نشده است (Fail-Closed).' };
  }

  if (!session.isDesignatedExecutor) {
    return {
      isValid: false,
      reason: 'این دستگاه به عنوان مجری مجاز ثبت سفارشات انتخاب نشده است.',
    };
  }

  const lastHeartbeat = session.lastHeartbeatTimestamp || 0;
  const elapsedMs = currentTime - lastHeartbeat;

  // اگر ضربان قلب دستگاه بیش از ۳۰ ثانیه قطع باشد، نشست منقضی فرض شده و سفارش مسدود می‌شود
  if (elapsedMs > 30000) {
    return {
      isValid: false,
      reason: `ارتباط زنده با دستگاه مجری قطع شده است (${Math.round(elapsedMs / 1000)} ثانیه بی‌حرکتی). برای امنیت معامله مسدود شد.`,
    };
  }

  if (session.isBackgroundSuspensionRisk) {
    return {
      isValid: false,
      reason: 'سیستم‌عامل ممکن است تب وب را در پس‌زمینه معلق کرده باشد؛ اجرای سفارشات منوط به فعال بودن پیش‌زمینه است.',
    };
  }

  return { isValid: true };
}

export function evaluateFoldableLayout(viewportWidth: number, viewportHeight: number): FoldableLayoutMetrics {
  const aspectRatio = viewportWidth / (viewportHeight || 1);

  // Pixel 9 Pro Fold و تبلت‌های تاشو در حالت باز شده عموماً دارای نسبت ابعاد نزدیک به مربع یا عریض هستند
  const isFoldableWideScreen = viewportWidth >= 700 && viewportWidth <= 1200 && aspectRatio >= 0.9 && aspectRatio <= 1.35;
  const isLargeDesktop = viewportWidth > 1200;

  const isFoldableDevice = isFoldableWideScreen;
  const isDualPaneActive = isFoldableWideScreen || isLargeDesktop;

  return {
    isFoldableDevice,
    isDualPaneActive,
    paneMode: isDualPaneActive ? 'DUAL_PANE_EXPANDED' : 'SINGLE_PANE',
    viewportWidth,
    viewportHeight,
    aspectRatio: Number(aspectRatio.toFixed(2)),
  };
}
