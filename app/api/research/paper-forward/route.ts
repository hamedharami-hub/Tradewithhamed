import { NextRequest } from 'next/server';
import type { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import { PaperForwardRunner } from '@/lib/research/paper-forward-runner';
import { errorResponse, finiteNumber, readJsonObject, requiredString, successResponse } from '@/lib/server/http';
import { requireOperatorAndRateLimit } from '@/lib/server/route-guards';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseSymbol(value: unknown): SymbolId {
  const symbol = requiredString(value, 'symbol', 16).toUpperCase();
  if (symbol !== 'EURUSD' && symbol !== 'XAUUSD') throw new Error('symbol فقط می‌تواند EURUSD یا XAUUSD باشد.');
  return symbol;
}

function parseTimeframe(value: unknown): Timeframe {
  const timeframe = requiredString(value, 'timeframe', 4).toUpperCase() as Timeframe;
  if (!['1M', '5M', '15M', '1H', '4H', 'D1'].includes(timeframe)) throw new Error('timeframe نامعتبر است.');
  return timeframe;
}

function parseCandle(value: unknown): Candle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('candle باید یک شیء معتبر باشد.');
  const item = value as Record<string, unknown>;
  const timestamp = finiteNumber(item.timestamp, 'candle.timestamp', { min: 1 });
  const open = finiteNumber(item.open, 'candle.open', { min: 0 });
  const high = finiteNumber(item.high, 'candle.high', { min: 0 });
  const low = finiteNumber(item.low, 'candle.low', { min: 0 });
  const close = finiteNumber(item.close, 'candle.close', { min: 0 });
  const volume = finiteNumber(item.volume ?? 0, 'candle.volume', { min: 0 });
  if (high < Math.max(open, close) || low > Math.min(open, close) || high < low) throw new Error('OHLC کندل نامعتبر است.');
  if (item.isClosed !== true) throw new Error('paper-forward فقط candle.isClosed=true را قبول می‌کند.');
  return { timestamp, open, high, low, close, volume, isClosed: true };
}

export async function GET(request: NextRequest) {
  const guard = requireOperatorAndRateLimit(request, 'JOURNAL');
  if (guard) return guard;
  try {
    const symbol = parseSymbol(request.nextUrl.searchParams.get('symbol') || 'EURUSD');
    const timeframe = parseTimeframe(request.nextUrl.searchParams.get('timeframe') || '5M');
    return successResponse(request, { snapshot: PaperForwardRunner.getSnapshot(symbol, timeframe) });
  } catch (error) {
    return errorResponse(request, 'BAD_REQUEST', error instanceof Error ? error.message : 'درخواست نامعتبر است.', 400);
  }
}

export async function POST(request: NextRequest) {
  const guard = requireOperatorAndRateLimit(request, 'JOURNAL');
  if (guard) return guard;
  try {
    const body = await readJsonObject(request);
    const action = requiredString(body.action, 'action', 16);
    const symbol = parseSymbol(body.symbol);
    const timeframe = parseTimeframe(body.timeframe);
    if (action === 'start') return successResponse(request, { snapshot: PaperForwardRunner.start({ symbol, timeframe, aiMode: body.agentic === true ? 'AGENTIC_OFFLINE' : 'OFF' }) });
    if (action === 'stop') return successResponse(request, { snapshot: PaperForwardRunner.stop(symbol, timeframe) });
    if (action === 'ingest') {
      const existing = PaperForwardRunner.getSnapshot(symbol, timeframe);
      if (body.agentic === true || existing?.state.aiMode === 'AGENTIC_OFFLINE') {
        return successResponse(request, { snapshot: await PaperForwardRunner.ingestClosedBarWithAgents(symbol, timeframe, parseCandle(body.candle)) });
      }
      return successResponse(request, { snapshot: PaperForwardRunner.ingestClosedBar(symbol, timeframe, parseCandle(body.candle)) });
    }
    return errorResponse(request, 'BAD_REQUEST', 'action باید start، ingest یا stop باشد.', 400);
  } catch (error) {
    return errorResponse(request, 'BAD_REQUEST', error instanceof Error ? error.message : 'درخواست نامعتبر است.', 400);
  }
}
