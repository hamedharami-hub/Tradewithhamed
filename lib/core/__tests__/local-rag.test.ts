// lib/core/__tests__/local-rag.test.ts
// مجموعه آزمون‌های جامع موتور بازیابی معنایی محلی (Local Semantic RAG)
// تایید پردازش ۱۰۰٪ کلاینت‌ساید، جستجوی دو زبانه و استناددهی به قوانین S0

import { LocalRAGEngine } from '../local-rag-engine';
import { S0_KNOWLEDGE_BASE } from '../s0-knowledge-base';
import { SequentialAnalystCriticEngine } from '../sequential-analyst-critic';
import { BENCHMARK_EVALUATION_CORPUS_120 } from '../evaluation-corpus-120';
import { DEFAULT_W5_TRADES } from '../../contracts/w5-journal-analytics';

export interface LocalRAGTestResult {
  name: string;
  passed: boolean;
  details: string;
}

export function runLocalRAGTests(): LocalRAGTestResult[] {
  const results: LocalRAGTestResult[] = [];

  // تست ۱: بررسی تعداد و ساختار پایگاه دانش S0
  try {
    LocalRAGEngine.initialize();
    const totalChunks = S0_KNOWLEDGE_BASE.length;
    const coreRules = S0_KNOWLEDGE_BASE.filter(c => c.category === 'CORE_RULE');
    const journalLessons = S0_KNOWLEDGE_BASE.filter(c => c.category === 'JOURNAL_LESSON');

    const passed = totalChunks === 15 && coreRules.length >= 7 && journalLessons.length === 5;
    results.push({
      name: '[Local RAG] S0 Knowledge Base Integrity & Chunks Count',
      passed,
      details: passed
        ? `پایگاه دانش با ${totalChunks} بخش (قوانین هسته: ${coreRules.length}، درس‌های ژورنال: ${journalLessons.length}) با موفقیت ایندکس شد.`
        : `تعداد بخش‌های پایگاه دانش نامعتبر است: ${totalChunks}`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] S0 Knowledge Base Integrity & Chunks Count',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۲: جستجوی معنایی فارسی برای سوییپ نقدینگی
  try {
    const hits = LocalRAGEngine.search('سوییپ نقدینگی و هانت استاپ', { topK: 3 });
    const topHit = hits[0];
    const passed = topHit && topHit.chunk.id === 'S0-RULE-02' && topHit.score >= 40;
    results.push({
      name: '[Local RAG] Persian Semantic Search: Liquidity Sweeps',
      passed: !!passed,
      details: passed
        ? `عبارت فارسی با امتیاز ${topHit.score}٪ به سند ${topHit.chunk.id} (${topHit.chunk.titleFa}) تطبیق داده شد.`
        : `عدم تطابق صحیح سوییپ نقدینگی: ${topHit?.chunk?.id || 'هیچ'}`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Persian Semantic Search: Liquidity Sweeps',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۳: جستجوی معنایی فارسی برای FVG و عدم تعادل
  try {
    const hits = LocalRAGEngine.search('شکاف قیمت FVG و عدم تعادل ارزش منصفانه', { topK: 3 });
    const topHit = hits[0];
    const passed = topHit && topHit.chunk.id === 'S0-RULE-04' && topHit.score >= 35;
    results.push({
      name: '[Local RAG] Persian Semantic Search: FVG Imbalance',
      passed: !!passed,
      details: passed
        ? `عبارت عدم تعادل با امتیاز ${topHit.score}٪ به ${topHit.chunk.id} تطبیق یافت.`
        : `شکست در کشف FVG: ${topHit?.chunk?.id || 'هیچ'}`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Persian Semantic Search: FVG Imbalance',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۴: جستجوی عبارات انگلیسی
  try {
    const hits = LocalRAGEngine.search('liquidity sweep stop hunt', { topK: 3 });
    const topHit = hits[0];
    const passed = topHit && topHit.chunk.id === 'S0-RULE-02' && topHit.score >= 40;
    results.push({
      name: '[Local RAG] English Query Vector Search',
      passed: !!passed,
      details: passed
        ? `کوئری انگلیسی با موفقیت سند ${topHit.chunk.id} را با امتیاز ${topHit.score}٪ بازیابی کرد.`
        : `شکست در جستجوی انگلیسی: ${topHit?.chunk?.id || 'هیچ'}`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] English Query Vector Search',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۵: اعمال فیلتر دسته‌بندی روی درس‌های ژورنال
  try {
    const hits = LocalRAGEngine.search('اخبار و اسلیپیج', {
      category: 'JOURNAL_LESSON',
      topK: 5,
    });
    const allAreLessons = hits.length > 0 && hits.every(h => h.chunk.category === 'JOURNAL_LESSON');
    const hasLesson03 = hits.some(h => h.chunk.id === 'S0-LESSON-03');
    const passed = allAreLessons && hasLesson03;
    results.push({
      name: '[Local RAG] Category Filter Enforcement',
      passed,
      details: passed
        ? `فیلتر JOURNAL_LESSON منحصراً ${hits.length} درس ژورنال با اولویت S0-LESSON-03 را برگرداند.`
        : 'فیلتر دسته‌بندی با خطا مواجه شد.',
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Category Filter Enforcement',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۶: بازشناسی مقاصد روانشناسی معاملاتی و فومو
  try {
    const hits = LocalRAGEngine.search('انتقام و فومو بعد از باخت معامله', { topK: 3 });
    const topHit = hits[0];
    const passed = topHit && topHit.chunk.id === 'S0-RULE-10' && topHit.chunk.category === 'PSYCHOLOGY';
    results.push({
      name: '[Local RAG] Psychology & Anti-FOMO Recognition',
      passed: !!passed,
      details: passed
        ? `موضوع انضباط روانی با سند ${topHit.chunk.id} (${topHit.chunk.titleFa}) شناسایی شد.`
        : `شکست در کشف قاعده روانشناسی: ${topHit?.chunk?.id || 'هیچ'}`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Psychology & Anti-FOMO Recognition',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۷: استخراج شواهد مستند (Grounding Context)
  try {
    const grounding = LocalRAGEngine.retrieveGroundingContext({
      symbol: 'XAUUSD',
      sweepDetected: true,
      fvgDetected: true,
      isNewsUpcoming: false,
      riskRewardRatio: 2.2,
    });
    const passed =
      grounding.groundedRuleIds.includes('S0-RULE-02') &&
      grounding.groundedRuleIds.includes('S0-RULE-04') &&
      grounding.groundingSummaryFa.includes('S0-RULE');
    results.push({
      name: '[Local RAG] Grounding Context Retrieval for Analyst',
      passed,
      details: passed
        ? `شواهد استنادیافته شامل: ${grounding.groundedRuleIds.join(', ')}`
        : 'عدم احراز شواهد مستند برای تحلیل‌گر',
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Grounding Context Retrieval for Analyst',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۸: یکپارچگی ارزیابی ترتیبی تحلیل‌گر و منتقد با RAG
  try {
    const testCase = BENCHMARK_EVALUATION_CORPUS_120[0];
    const evalResult = SequentialAnalystCriticEngine.evaluateCase(testCase);
    const passed =
      evalResult.ragGrounding !== undefined &&
      evalResult.ragGrounding.groundedRuleIds.length > 0 &&
      evalResult.analystReview.concise_reason.includes('مستند به');
    results.push({
      name: '[Local RAG] Sequential Analyst-Critic Integration',
      passed,
      details: passed
        ? `ارزیابی ترتیبی با شواهد مستند پایگاه دانش (${evalResult.ragGrounding?.groundedRuleIds.slice(0, 2).join(', ')}) تکمیل شد.`
        : 'فقدان شواهد مستند در نتیجه ارزیابی ترتیبی',
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Sequential Analyst-Critic Integration',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۹: سرعت و تاخیر بسیار کم (Latency < 10ms)
  try {
    const t0 = performance.now();
    for (let i = 0; i < 25; i++) {
      LocalRAGEngine.search('بررسی سشن لندن و کیلزون نیویورک با سوییپ نقدینگی');
    }
    const elapsed = performance.now() - t0;
    const avgMs = Number((elapsed / 25).toFixed(2));
    const passed = avgMs < 10;
    results.push({
      name: '[Local RAG] Sub-10ms Latency Benchmark',
      passed,
      details: passed
        ? `میانگین زمان اجرای هر جستجوی برداری ${avgMs} میلی‌ثانیه (بسیار سریع و بلادرنگ).`
        : `تاخیر بیش از حد مجاز: ${avgMs}ms`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Sub-10ms Latency Benchmark',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۱۰: ثبت پویای معاملات ژورنال W5 در پایگاه دانش محلی RAG
  try {
    LocalRAGEngine.registerJournalTrades(DEFAULT_W5_TRADES);
    const allChunks = LocalRAGEngine.getAllChunks();
    const dynamicCount = LocalRAGEngine.getDynamicChunkCount();
    const passed = dynamicCount === DEFAULT_W5_TRADES.length && allChunks.length === 15 + DEFAULT_W5_TRADES.length;
    results.push({
      name: '[Local RAG] Dynamic Journal Trades Registration',
      passed,
      details: passed
        ? `تعداد ${dynamicCount} معامله واقعی ژورنال با موفقیت به پایگاه وکتور اضافه شد (کل بخش‌ها: ${allChunks.length}).`
        : `خطا در ثبت پویای معاملات: ${dynamicCount}`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Dynamic Journal Trades Registration',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۱۱: جستجوی معنایی و بازیابی معامله واقعی TR-102 از ژورنال
  try {
    const hits = LocalRAGEngine.search('معامله یورو قبل از زمان بهینه سشن با حد ضرر', { topK: 3 });
    const foundTR102 = hits.some(h => h.chunk.id === 'JOURNAL-TR-102');
    results.push({
      name: '[Local RAG] Real Journal Trade Semantic Retrieval',
      passed: foundTR102,
      details: foundTR102
        ? 'معامله واقعی JOURNAL-TR-102 با موفقیت از طریق جستجوی معنایی یادداشت ژورنال بازیابی شد.'
        : `معامله TR-102 در نتایج جستجو یافت نشد (برترین نتیجه: ${hits[0]?.chunk.id || 'هیچ'}).`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Real Journal Trade Semantic Retrieval',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۱۲: پاکسازی و بازگشت به حالت مرجع
  try {
    LocalRAGEngine.clearDynamicChunks();
    const baseCount = LocalRAGEngine.getAllChunks().length;
    const passed = baseCount === 15;
    results.push({
      name: '[Local RAG] Dynamic Chunks Safe Cleanup',
      passed,
      details: passed
        ? 'پایگاه دانش پس از پاکسازی با موفقیت به ۱۵ بخش مرجع بازگشت.'
        : `تعداد بخش‌ها پس از پاکسازی نامعتبر است: ${baseCount}`,
    });
  } catch (e) {
    results.push({
      name: '[Local RAG] Dynamic Chunks Safe Cleanup',
      passed: false,
      details: (e as Error).message,
    });
  }

  return results;
}
