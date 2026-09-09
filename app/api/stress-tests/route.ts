import { NextRequest } from 'next/server';
import { errorResponse, readJsonObject, requiredString, finiteNumber, successResponse } from '@/lib/server/http';
import { requireOperatorAndRateLimit } from '@/lib/server/route-guards';
import { StressTestService } from '@/lib/server/stress-test-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const guard = requireOperatorAndRateLimit(request, 'JOURNAL');
  if (guard) return guard;
  return successResponse(request, {
    scenarios: StressTestService.listScenarios(),
    results: StressTestService.listResults(),
  });
}

export async function POST(request: NextRequest) {
  const guard = requireOperatorAndRateLimit(request, 'JOURNAL');
  if (guard) return guard;
  try {
    const body = await readJsonObject(request);
    const scenarioId = requiredString(body.scenarioId, 'scenarioId', 120);
    const seed = body.seed === undefined ? undefined : finiteNumber(body.seed, 'seed');
    return successResponse(request, StressTestService.run(scenarioId, seed));
  } catch (error) {
    return errorResponse(request, 'BAD_REQUEST', error instanceof Error ? error.message : 'درخواست سناریو نامعتبر است.', 400);
  }
}
