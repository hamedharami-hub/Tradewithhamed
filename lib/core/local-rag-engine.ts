// lib/core/local-rag-engine.ts
// موتور بازیابی معنایی محلی و آفلاین (In-Browser Local Semantic RAG)
// ۱۰۰٪ مستقل، بدون نیاز به سرور یا کلیدهای API ابری، پشتیبانی کامل از زبان فارسی و انگلیسی
// طبق بخش‌های ۱، ۲ و ۱۶ سند معماری v4.0

import { S0_KNOWLEDGE_BASE, S0KnowledgeChunk, S0KnowledgeCategory } from './s0-knowledge-base';

export interface RAGSearchResult {
  chunk: S0KnowledgeChunk;
  score: number; // شباهت کسینوسی در مقیاس ۰ الی ۱۰۰ درصد
  matchedTerms: string[];
  highlightSnippetFa: string;
}

export interface GroundingContext {
  groundedRuleIds: string[];
  groundingSummaryFa: string;
  retrievedChunks: S0KnowledgeChunk[];
}

export class LocalRAGEngine {
  private static idfMap: Map<string, number> = new Map();
  private static chunkVectors: Map<string, Map<string, number>> = new Map();
  private static chunkNorms: Map<string, number> = new Map();
  private static isInitialized = false;

  // واژگان تخصصی مالی با وزن تقویت‌شده برای بازشناسی دقیق قصد معامله‌گر
  private static readonly DOMAIN_BOOST_TERMS: Record<string, number> = {
    // اصطلاحات فارسی
    'سوییپ': 2.5,
    'نقدینگی': 2.2,
    'استاپ': 2.0,
    'استاپ‌هانت': 2.5,
    'ضرر': 1.8,
    'ریسک': 2.2,
    'ساختار': 2.0,
    'شکست': 1.9,
    'شکاف': 2.2,
    'اف‌وی‌جی': 2.5,
    'عدم‌تعادل': 2.0,
    'مومنتوم': 2.0,
    'اخبار': 2.4,
    'سی‌پی‌آی': 2.5,
    'ان‌اف‌پی': 2.5,
    'نرخ‌بهره': 2.5,
    'فدرال': 2.0,
    'لیمیت': 2.0,
    'مارکت': 1.8,
    'اسلیپیج': 2.2,
    'بافر': 1.8,
    'سشن': 2.0,
    'کیل‌زون': 2.2,
    'لندن': 2.0,
    'نیویورک': 2.0,
    'آسیا': 1.8,
    'دراودان': 2.4,
    'سرمایه': 1.8,
    'فومو': 2.5,
    'انتقام': 2.5,
    'روانشناسی': 2.0,
    'رنج': 1.8,
    'تایم‌فریم': 1.8,

    // English Terms
    'sweep': 2.5,
    'liquidity': 2.2,
    'stop': 2.0,
    'hunt': 2.2,
    'stophunt': 2.5,
    'loss': 1.8,
    'risk': 2.2,
    'structure': 2.0,
    'bos': 2.5,
    'choch': 2.5,
    'fvg': 2.5,
    'imbalance': 2.2,
    'momentum': 2.0,
    'displacement': 2.2,
    'news': 2.4,
    'cpi': 2.5,
    'nfp': 2.5,
    'fomc': 2.5,
    'limit': 2.0,
    'slippage': 2.2,
    'buffer': 1.8,
    'session': 2.0,
    'killzone': 2.2,
    'london': 2.0,
    'drawdown': 2.4,
    'fomo': 2.5,
    'revenge': 2.5,
    'consolidation': 1.9,
    'timeframe': 1.8,
  };

  /**
   * مقداردهی اولیه ایندکس برداری و محاسبات TF-IDF به صورت درون‌حافظه‌ای
   */
  public static initialize(): void {
    if (this.isInitialized) return;

    const totalDocs = S0_KNOWLEDGE_BASE.length;
    const docFrequency: Map<string, number> = new Map();

    // ۱. استخراج واژه‌ها و محاسبه فرکانس اسناد (Doc Frequency)
    const docTermsMap: Map<string, string[]> = new Map();

    for (const chunk of S0_KNOWLEDGE_BASE) {
      const fullText = [
        chunk.titleFa,
        chunk.titleEn,
        chunk.contentFa,
        chunk.contentEn,
        ...chunk.tags,
        ...chunk.invalidationTriggers,
        ...chunk.executionChecklist,
      ].join(' ');

      const terms = this.tokenize(fullText);
      docTermsMap.set(chunk.id, terms);

      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        docFrequency.set(term, (docFrequency.get(term) || 0) + 1);
      }
    }

    // ۲. محاسبه مقادیر IDF
    for (const [term, freq] of docFrequency.entries()) {
      // فرمول نرمالایز شده IDF
      const idf = Math.log(1 + (totalDocs - freq + 0.5) / (freq + 0.5));
      this.idfMap.set(term, Math.max(0.1, idf));
    }

    // ۳. ساخت بردارهای TF-IDF برای تک‌تک بخش‌های پایگاه دانش
    for (const chunk of S0_KNOWLEDGE_BASE) {
      const terms = docTermsMap.get(chunk.id) || [];
      const termFreqs: Map<string, number> = new Map();

      for (const term of terms) {
        termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
      }

      const vector: Map<string, number> = new Map();
      let sumSquares = 0;

      for (const [term, count] of termFreqs.entries()) {
        const idf = this.idfMap.get(term) || 0.1;
        const tf = count / terms.length;
        const boost = this.DOMAIN_BOOST_TERMS[term] || 1.0;
        const weight = tf * idf * boost * chunk.weight;

        vector.set(term, weight);
        sumSquares += weight * weight;
      }

      const norm = Math.sqrt(sumSquares) || 1.0;
      this.chunkVectors.set(chunk.id, vector);
      this.chunkNorms.set(chunk.id, norm);
    }

    this.isInitialized = true;
  }

  /**
   * نرمال‌سازی و توکنایز دو زبانه (فارسی و انگلیسی)
   */
  public static tokenize(text: string): string[] {
    if (!text) return [];

    // استانداردسازی حروف فارسی و عربی
    let clean = text
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '') // حذف اعراب
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[\u200C\u200B]/g, ' ') // تبدیل نیم‌فاصله به فاصله
      .replace(/[^\p{L}\p{N}\s_]/gu, ' '); // حذف علائم نگارشی

    const rawTokens = clean.split(/\s+/).filter(t => t.length >= 2);

    // توکن‌های کلمات و جفت‌کلمه‌ها (Bi-grams) برای دقت بیشتر در درک عبارات مرکب
    const tokens: string[] = [];
    for (let i = 0; i < rawTokens.length; i++) {
      tokens.push(rawTokens[i]);
      if (i < rawTokens.length - 1) {
        tokens.push(`${rawTokens[i]}_${rawTokens[i + 1]}`);
      }
    }

    return tokens;
  }

  /**
   * جستجوی معنایی محلی بر مبنای بردار کوسینوسی
   */
  public static search(
    query: string,
    options: {
      topK?: number;
      minScore?: number;
      category?: S0KnowledgeCategory;
    } = {}
  ): RAGSearchResult[] {
    this.initialize();

    const topK = options.topK ?? 5;
    const minScore = options.minScore ?? 10; // حداقل ۱۰ درصد تطابق
    const queryTokens = this.tokenize(query);

    if (queryTokens.length === 0) {
      return S0_KNOWLEDGE_BASE.slice(0, topK).map(chunk => ({
        chunk,
        score: 100,
        matchedTerms: [],
        highlightSnippetFa: chunk.contentFa.slice(0, 160) + '...',
      }));
    }

    // ساخت بردار کوئری
    const queryVector: Map<string, number> = new Map();
    let querySumSquares = 0;

    const termFreqs: Map<string, number> = new Map();
    for (const token of queryTokens) {
      termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
    }

    for (const [term, count] of termFreqs.entries()) {
      const idf = this.idfMap.get(term) || 0.5;
      const tf = count / queryTokens.length;
      const boost = this.DOMAIN_BOOST_TERMS[term] || 1.0;
      const weight = tf * idf * boost;

      queryVector.set(term, weight);
      querySumSquares += weight * weight;
    }

    const queryNorm = Math.sqrt(querySumSquares) || 1.0;
    const results: RAGSearchResult[] = [];

    // مقایسه کسینوسی با تمام اسناد موجود در ایندکس
    for (const chunk of S0_KNOWLEDGE_BASE) {
      if (options.category && chunk.category !== options.category) {
        continue;
      }

      const docVector = this.chunkVectors.get(chunk.id);
      const docNorm = this.chunkNorms.get(chunk.id) || 1.0;
      if (!docVector) continue;

      let dotProduct = 0;
      const matchedTerms: string[] = [];

      for (const [term, qWeight] of queryVector.entries()) {
        const dWeight = docVector.get(term);
        if (dWeight !== undefined) {
          dotProduct += qWeight * dWeight;
          matchedTerms.push(term.replace('_', ' '));
        }
      }

      // محاسبه شباهت کسینوسی (۰ تا ۱۰۰ درصد)
      const rawCosine = dotProduct / (queryNorm * docNorm);
      // مقیاس‌دهی غیرخطی برای نمایش ارگونومیک به کاربر
      const score = Math.min(100, Math.round(Math.pow(rawCosine, 0.7) * 100));

      if (score >= minScore) {
        // ایجاد قطعه هایلایت هوشمند
        const snippet = this.generateHighlightSnippet(chunk.contentFa, matchedTerms);

        results.push({
          chunk,
          score,
          matchedTerms: Array.from(new Set(matchedTerms)),
          highlightSnippetFa: snippet,
        });
      }
    }

    // مرتب‌سازی نزولی بر اساس امتیاز تطابق
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * تولید متن کوتاه همراه با متن تطبیق‌یافته
   */
  private static generateHighlightSnippet(content: string, terms: string[]): string {
    if (!terms.length) {
      return content.slice(0, 150) + '...';
    }

    const firstTerm = terms[0];
    const index = content.indexOf(firstTerm);
    if (index === -1) {
      return content.slice(0, 150) + '...';
    }

    const start = Math.max(0, index - 40);
    const end = Math.min(content.length, index + 110);
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    return snippet;
  }

  /**
   * دریافت یک سند خاص بر اساس شناسه منحصر‌به‌فرد
   */
  public static getChunkById(id: string): S0KnowledgeChunk | undefined {
    return S0_KNOWLEDGE_BASE.find(c => c.id === id);
  }

  /**
   * استخراج شواهد مستند برای موتور تحلیل‌گر و منتقد (Sequential Analyst-Critic Grounding)
   * با ورودی اسنپ‌شات معاملاتی، قواعد و درس‌های مرتبط استخراج و استناددهی می‌شوند.
   */
  public static retrieveGroundingContext(scenario: {
    symbol: string;
    direction?: string;
    sweepDetected?: boolean;
    fvgDetected?: boolean;
    isNewsUpcoming?: boolean;
    riskRewardRatio?: number;
  }): GroundingContext {
    this.initialize();

    const queryParts: string[] = [scenario.symbol];

    if (scenario.sweepDetected) {
      queryParts.push('سوییپ نقدینگی استاپ هانت liquidity sweep');
    }
    if (scenario.fvgDetected) {
      queryParts.push('شکاف ارزش منصفانه عدم تعادل fvg imbalance');
    }
    if (scenario.isNewsUpcoming) {
      queryParts.push('اخبار رویداد مهم cpi fomc nfp اسلیپیج');
    }
    if (scenario.riskRewardRatio && scenario.riskRewardRatio < 1.5) {
      queryParts.push('ریسک به ریوارد حد ضرر زیان');
    }

    const searchHits = this.search(queryParts.join(' '), { topK: 3, minScore: 15 });

    const groundedRuleIds = searchHits.map(hit => hit.chunk.id);
    const retrievedChunks = searchHits.map(hit => hit.chunk);

    const summaries = searchHits.map(
      hit => `[${hit.chunk.id} (${hit.score}%)] ${hit.chunk.titleFa}`
    );

    const groundingSummaryFa = summaries.length > 0
      ? `شواهد استناد یافته در پایگاه دانش S0: ${summaries.join(' | ')}`
      : 'هیچ قاعده متناظر صریحی در پایگاه دانش محلی برای وضعیت جاری یافت نشد.';

    return {
      groundedRuleIds,
      groundingSummaryFa,
      retrievedChunks,
    };
  }
}
