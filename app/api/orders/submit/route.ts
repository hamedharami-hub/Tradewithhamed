import { NextRequest, NextResponse } from 'next/server';
import { CTraderOMS } from '@/lib/server/ctrader-oms';
import { OrderSubmissionRequest } from '@/lib/contracts/execution';
import { RateLimiter } from '@/lib/server/rate-limiter';
import { getOperatorSession } from '@/lib/server/operator-session';
import { registerDemoExecutionBridge } from '@/lib/server/demo-execution-bridge';
import { CTraderDemoGateway } from '@/lib/gateway/ctrader-gateway';

// نمادهای دارای پشتیبانی رسمی در Gateway و پل اتصال دمو
const SUPPORTED_GATEWAY_SYMBOLS = ['XAUUSD', 'EURUSD'];
// حداکثر زمان کهنگی مجاز به ثانیه/میلی‌ثانیه تحمیل‌شده توسط سرور (۵ ثانیه)
const SERVER_MAX_STALENESS_MS = 5000;

export async function POST(request: NextRequest) {
  registerDemoExecutionBridge();
  if (!getOperatorSession(request)) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHENTICATED_SESSION: ثبت سفارش به نشست اپراتور نیاز دارد.' },
      { status: 401 }
    );
  }

  const clientIp = RateLimiter.extractClientIdentifier(request.headers);
  const rateLimitResult = RateLimiter.checkLimit('ORDER_SUBMIT', clientIp);

  if (!rateLimitResult.allowed) {
    return RateLimiter.createBlockedResponse(rateLimitResult);
  }

  try {
    const body = (await request.json()) as OrderSubmissionRequest & {
      simulateTimeout?: boolean;
      simulateRejection?: boolean;
      simulateMissingProtection?: boolean;
      dataProvenance?: {
        originType?: string;
        originLabelFa?: string;
        lastReceivedAt?: number;
        stalenessThresholdMs?: number;
      };
    };

    // ۱. بررسی محیط: ثبت سفارش فقط در محیط BROKER_DEMO مجاز است
    if (body.environment !== 'BROKER_DEMO') {
      return NextResponse.json(
        {
          success: false,
          error: `ENVIRONMENT_DISALLOWED: محیط «${body.environment || 'نامشخص'}» مجوز ثبت سفارش در بروکر را ندارد. محیط‌های تمرین و پژوهش فاقد دسترسی به بروکر هستند.`,
        },
        { status: 403 }
      );
    }

    // ۲. اعتبارسنجی مستقل سرور: وضعیت دروازه اتصال بروکر دمو (Gateway Connection & Status)
    const gateway = CTraderDemoGateway.getInstance();
    const gatewayStatus = gateway.getStatus();

    if (!gatewayStatus.configured) {
      return NextResponse.json(
        {
          success: false,
          error: 'GATEWAY_NOT_CONFIGURED: اتصال بروکر در سرور پیکربندی نشده است. ارسال سفارش مسدود است.',
        },
        { status: 503 }
      );
    }

    if (!gatewayStatus.connected || gatewayStatus.state !== 'SUBSCRIBED') {
      return NextResponse.json(
        {
          success: false,
          error: `GATEWAY_NOT_READY: ارتباط زنده سرور با دروازه cTrader برقرار نیست (وضعیت فعلی: ${gatewayStatus.state}).`,
        },
        { status: 503 }
      );
    }

    // ۳. بررسی نمادهای مجاز با پیکربندی سرور
    if (!SUPPORTED_GATEWAY_SYMBOLS.includes(body.symbol)) {
      return NextResponse.json(
        {
          success: false,
          error: `SYMBOL_NOT_SUPPORTED: نماد «${body.symbol}» در دروازه بروکر دمو پشتیبانی نمی‌شود. نمادهای مجاز: ${SUPPORTED_GATEWAY_SYMBOLS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // ۴. اعتبارسنجی مستقل مظنه سرور (Server-Side Quote & Quality Verification)
    const serverQuotes = gateway.getQuotes();
    const serverQuote = serverQuotes[body.symbol.toUpperCase()];

    if (!serverQuote) {
      return NextResponse.json(
        {
          success: false,
          error: `BROKER_QUOTE_UNAVAILABLE: مظنه قیمت لحظه‌ای از بروکر برای نماد ${body.symbol} در دسترس نیست.`,
        },
        { status: 400 }
      );
    }

    // ۵. اعتبارسنجی کهنگی و کیفیت داده تحمیل‌شده توسط سرور (سرور به threshold کلاینت تکیه نمی‌کند)
    const serverNow = Date.now();
    const quoteAgeMs = serverNow - serverQuote.receivedAt;

    if (
      serverQuote.quality !== 'LIVE' ||
      quoteAgeMs > SERVER_MAX_STALENESS_MS ||
      serverQuote.timestamp > serverNow + 2000
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `STALE_SERVER_DATA_REJECTED: داده‌های مظنه بروکر منقضی یا بی‌کیفیت هستند (کیفیت: ${serverQuote.quality}، کهنگی: ${quoteAgeMs}ms). معامله روی مظنه منقضی مسدود است.`,
        },
        { status: 400 }
      );
    }

    // ۶. اعتبارسنجی جهت معامله
    if (body.direction !== 'BUY' && body.direction !== 'SELL') {
      return NextResponse.json(
        { success: false, error: 'INVALID_DIRECTION: جهت معامله باید دقیقاً BUY یا SELL باشد.' },
        { status: 400 }
      );
    }

    // ۷. اعتبارسنجی فیلدهای عددی، شناسه و حجم معامله
    if (
      !body.intentId ||
      !body.idempotencyKey ||
      !Number.isFinite(body.limitPrice) ||
      !Number.isFinite(body.stopLossPrice) ||
      !Number.isFinite(body.takeProfitPrice) ||
      !Number.isFinite(body.volumeLots) ||
      body.volumeLots < 0.01 ||
      body.volumeLots > 50.0 ||
      body.limitPrice <= 0 ||
      body.stopLossPrice <= 0 ||
      body.takeProfitPrice <= 0
    ) {
      return NextResponse.json(
        { success: false, error: 'پارامترهای ارسالی برای ثبت سفارش ناقص یا غیرمعتبر (NaN/منفی/خارج از محدوده حجم یا قیمت) هستند.' },
        { status: 400 }
      );
    }

    if (!body.executorSessionId || body.executorEpoch === undefined || !Number.isFinite(body.executorEpoch)) {
      return NextResponse.json(
        { success: false, error: 'شناسه نشست و ایپاک مجری الزامی است (احراز هویت تک‌مجری).' },
        { status: 403 }
      );
    }

    // ۸. محدودسازی پرچم‌های شبیه‌سازی خطا (تنها در محیط‌های غیرپروداکشن و تست مجاز هستند)
    const isProduction = process.env.NODE_ENV === 'production';
    const simulationOptions = isProduction
      ? {}
      : {
          simulateTimeout: body.simulateTimeout,
          simulateRejection: body.simulateRejection,
          simulateMissingProtection: body.simulateMissingProtection,
        };

    const res = await CTraderOMS.submitOrder(
      {
        intentId: body.intentId,
        idempotencyKey: body.idempotencyKey,
        symbol: body.symbol,
        direction: body.direction,
        volumeLots: body.volumeLots,
        limitPrice: body.limitPrice,
        stopLossPrice: body.stopLossPrice,
        takeProfitPrice: body.takeProfitPrice,
        userConfirmationTimestamp: body.userConfirmationTimestamp || Date.now(),
        environment: body.environment,
        executorSessionId: body.executorSessionId,
        executorEpoch: body.executorEpoch,
        deviceLabel: body.deviceLabel,
      },
      simulationOptions
    );

    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'خطای غیرمنتظره در سرور OMS',
      },
      { status: 500 }
    );
  }
}
