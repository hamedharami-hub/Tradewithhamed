import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HistoricalDataset, ResearchExperimentResult } from '@/lib/research/contracts';

const DATASET_DIRECTORY = path.join(process.cwd(), 'data', 'datasets');
const RUN_DIRECTORY = path.join(process.cwd(), 'data', 'runs');

function safeDatasetFileName(datasetId: string): string {
  if (!/^[A-Za-z0-9_.=-]+$/.test(datasetId)) throw new Error('شناسه دیتاست نامعتبر است.');
  return datasetId;
}

export class ResearchDatasetRepository {
  public static async list(): Promise<HistoricalDataset['manifest'][]> {
    try {
      const files = await fs.readdir(DATASET_DIRECTORY);
      const datasets = await Promise.all(files
        .filter(file => file.endsWith('.dataset.json'))
        .sort()
        .map(async file => {
          const raw = await fs.readFile(path.join(DATASET_DIRECTORY, file), 'utf8');
          const dataset = JSON.parse(raw) as HistoricalDataset;
          return dataset.manifest;
        }));
      return datasets.sort((left, right) => right.endTime - left.endTime);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  public static async loadById(datasetId: string): Promise<HistoricalDataset> {
    const allowed = safeDatasetFileName(datasetId);
    const manifests = await this.list();
    const manifest = manifests.find(item => item.datasetId === allowed);
    if (!manifest) throw new Error('دیتاست در مخزن محلی پژوهش پیدا نشد.');
    const files = await fs.readdir(DATASET_DIRECTORY);
    const matchedFile = files.find(file => file.endsWith('.dataset.json') && file.includes(manifest.contentSha256.slice(0, 12)) && file.includes(manifest.timeframe.toLowerCase()));
    if (!matchedFile) throw new Error('فایل دیتاست با مانیفست سازگار نیست.');
    return JSON.parse(await fs.readFile(path.join(DATASET_DIRECTORY, matchedFile), 'utf8')) as HistoricalDataset;
  }

  public static async saveRun(result: ResearchExperimentResult): Promise<string> {
    await fs.mkdir(RUN_DIRECTORY, { recursive: true });
    const fileName = `${safeDatasetFileName(result.manifest.experimentId)}.json`;
    const target = path.join(RUN_DIRECTORY, fileName);
    await fs.writeFile(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    return target;
  }
}
