import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/server/http';
import { requireOperator } from '@/lib/server/route-guards';
import { CTraderDemoGateway } from '@/lib/gateway/ctrader-gateway';
import { registerDemoExecutionBridge } from '@/lib/server/demo-execution-bridge';
import { AutoReconciliationService } from '@/lib/server/auto-reconciliation-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  registerDemoExecutionBridge();
  const gateway = CTraderDemoGateway.getInstance();
  return successResponse(request, { status: gateway.getStatus(), quotes: gateway.getQuotes(), reconciliation: AutoReconciliationService.getInstance().getStatus() });
}

export async function POST(request: NextRequest) {
  registerDemoExecutionBridge();
  const guard = requireOperator(request);
  if (guard) return guard;
  const gateway = CTraderDemoGateway.getInstance();
  try {
    const body = await request.json() as { action?: string };
    if (body.action === 'start') return successResponse(request, { status: gateway.start() });
    if (body.action === 'stop') return successResponse(request, { status: gateway.stop(), reconciliation: AutoReconciliationService.getInstance().getStatus() });
    return errorResponse(request, 'BAD_REQUEST', 'action باید start یا stop باشد.', 400);
  } catch {
    return errorResponse(request, 'BAD_REQUEST', 'بدنه درخواست نامعتبر است.', 400);
  }
}
