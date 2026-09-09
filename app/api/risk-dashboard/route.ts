import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requestIdFrom, successResponse } from '@/lib/server/http';
import { requireOperatorAndRateLimit } from '@/lib/server/route-guards';
import { buildRiskDashboardSnapshot } from '@/lib/server/risk-dashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const guardResponse = requireOperatorAndRateLimit(request, 'JOURNAL');
  if (guardResponse) return guardResponse;

  try {
    return successResponse(request, buildRiskDashboardSnapshot());
  } catch (error) {
    const requestId = requestIdFrom(request);
    console.error('[risk-dashboard]', { requestId, error });
    return errorResponse(request, 'INTERNAL_ERROR', 'تهیه داشبورد ریسک با خطا مواجه شد.', 500);
  }
}
