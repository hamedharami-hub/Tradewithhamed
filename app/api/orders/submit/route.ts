import { NextRequest, NextResponse } from 'next/server';
import { CTraderOMS } from '@/lib/server/ctrader-oms';
import { OrderSubmissionRequest } from '@/lib/contracts/execution';
import { RateLimiter } from '@/lib/server/rate-limiter';
import { getOperatorSession } from '@/lib/server/operator-session';
import { registerDemoExecutionBridge } from '@/lib/server/demo-execution-bridge';

export async function POST(request: NextRequest) {
  registerDemoExecutionBridge();
  if (!getOperatorSession(request)) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED_SESSION: ثبت سفارش به نشست اپراتور نیاز دارد.' }, { status: 401 });
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

    // ۲. بررسی منشأ داده: سفارش به بروکر دمو فقط روی فید داده مستقیم بروکر دمو مجاز است
    if (!body.dataProvenance || body.dataProvenance.originType !== 'BROKER_DEMO_FEED') {
      return NextResponse.json(
        {
          success: false,
          error: `INVALID_DATA_ORIGIN: ثبت سفارش بروکر با منبع «${body.dataProvenance?.originLabelFa || body.dataProvenance?.originType || 'نامعتبر'}» مسدود است. استفاده از داده‌های نمونه یا ساختگی برای معامله در بروکر مجاز نیست.`,
        },
        { status: 400 }
      );
    }

    // ۳. بررسی تازگی داده: سفارش بر روی داده منقضی یا قطع‌شده مسدود می‌شود
    const now = Date.now();
    const lastReceived = body.dataProvenance.lastReceivedAt || 0;
    const threshold = body.dataProvenance.stalenessThresholdMs || 300_000;
    if (now - lastReceived > threshold) {
      return NextResponse.json(
        {
          success: false,
          error: `STALE_DATA_REJECTED: داده‌های فید بروکر منقضی شده‌اند (${Math.round((now - lastReceived) / 1000)} ثانیه قبل). معامله روی داده قدیمی یا در زمان قطعی مسدود است.`,
        },
        { status: 400 }
      );
    }

    // ۴. بررسی نمادهای مجاز
    const allowedSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
    if (!allowedSymbols.includes(body.symbol)) {
      return NextResponse.json(
        { success: false, error: `SYMBOL_NOT_SUPPORTED: نماد ${body.symbol} در محیط دمو پشتیبانی نمی‌شود.` },
        { status: 400 }
      );
    }

    if (
      !body.intentId ||
      !body.idempotencyKey ||
      !Number.isFinite(body.limitPrice) ||
      !Number.isFinite(body.stopLossPrice) ||
      !Number.isFinite(body.volumeLots) ||
      body.volumeLots < 0.01 ||
      body.limitPrice <= 0 ||
      body.stopLossPrice <= 0
    ) {
      return NextResponse.json(
        { error: 'پارامترهای ارسالی برای ثبت سفارش ناقص یا غیرمعتبر (NaN/منفی/کمتر از حداقل لات) هستند.' },
        { status: 400 }
      );
    }

    if (!body.executorSessionId || body.executorEpoch === undefined || !Number.isFinite(body.executorEpoch)) {
      return NextResponse.json(
        { error: 'شناسه نشست و ایپاک مجری الزامی است (احراز هویت تک‌مجری).' },
        { status: 403 }
      );
    }

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
      {
        simulateTimeout: body.simulateTimeout,
        simulateRejection: body.simulateRejection,
        simulateMissingProtection: (body as any).simulateMissingProtection,
      }
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
