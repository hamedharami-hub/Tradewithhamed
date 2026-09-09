import { NextRequest } from 'next/server';
import { createBaselineFromManifest } from '@/lib/research/default-config';
import { ResearchExperimentEngine } from '@/lib/research/experiment-engine';
import { errorResponse, readJsonObject, requiredString, successResponse } from '@/lib/server/http';
import { ResearchDatasetRepository } from '@/lib/server/research-dataset-repository';
import { requireOperatorAndRateLimit } from '@/lib/server/route-guards';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const guard = requireOperatorAndRateLimit(request, 'JOURNAL');
  if (guard) return guard;
  try {
    return successResponse(request, { datasets: await ResearchDatasetRepository.list() });
  } catch (error) {
    console.error('[research-experiments:list]', error);
    return errorResponse(request, 'INTERNAL_ERROR', 'فهرست دیتاست‌های پژوهش قابل‌دریافت نیست.', 500);
  }
}

export async function POST(request: NextRequest) {
  const guard = requireOperatorAndRateLimit(request, 'JOURNAL');
  if (guard) return guard;
  try {
    const body = await readJsonObject(request);
    const datasetId = requiredString(body.datasetId, 'datasetId', 160);
    const dataset = await ResearchDatasetRepository.loadById(datasetId);
    if (dataset.manifest.status === 'REJECTED' || !dataset.manifest.canonicalSymbol) {
      return errorResponse(request, 'CONFLICT', 'این دیتاست برای اجرای paper/backtest قابل معامله نیست؛ وضعیت کیفیت یا نگاشت نماد را بررسی کنید.', 409);
    }
    const config = createBaselineFromManifest(dataset.manifest);
    const result = ResearchExperimentEngine.run(dataset, config);
    const runPath = await ResearchDatasetRepository.saveRun(result);
    return successResponse(request, { result, runPath: runPath.replace(process.cwd(), '') });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('دیتاست') || error.message.includes('datasetId'))) {
      return errorResponse(request, 'BAD_REQUEST', error.message, 400);
    }
    console.error('[research-experiments:run]', error);
    return errorResponse(request, 'INTERNAL_ERROR', 'اجرای آزمایش تاریخی با خطا مواجه شد.', 500);
  }
}
