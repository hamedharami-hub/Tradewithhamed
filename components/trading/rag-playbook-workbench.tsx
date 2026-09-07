// components/trading/rag-playbook-workbench.tsx
// میز کار تعاملی کتابچه استراتژی S0 و موتور بازیابی معنایی محلی (Local Semantic RAG)
// کاملاً کلاینت‌ساید، بدون وابستگی به کلود یا هوش‌های مصنوعی ابری، دو زبانه و طراحی M3

'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Cpu,
  RefreshCw,
  Compass,
  FileText,
  HelpCircle,
  ExternalLink,
  Brain,
  Tag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  S0_KNOWLEDGE_BASE,
  S0KnowledgeChunk,
  S0KnowledgeCategory,
} from '@/lib/core/s0-knowledge-base';
import { LocalRAGEngine, RAGSearchResult } from '@/lib/core/local-rag-engine';
import { DEFAULT_W5_TRADES } from '@/lib/contracts/w5-journal-analytics';

export const RAGPlaybookWorkbench: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>('S0-RULE-02');
  const [sandboxInput, setSandboxInput] = useState('سوییپ نقدینگی سقف آسیا و ورود با FVG در سشن لندن با نسبت ریسک ۲');
  const [showSandbox, setShowSandbox] = useState(true);
  const [isJournalSynced, setIsJournalSynced] = useState(true);

  // همگام‌سازی معاملات ژورنال W5 با موتور وکتور محلی
  React.useEffect(() => {
    if (isJournalSynced) {
      LocalRAGEngine.registerJournalTrades(DEFAULT_W5_TRADES);
    } else {
      LocalRAGEngine.clearDynamicChunks();
    }
  }, [isJournalSynced]);

  // پیش‌تنظیم‌های سناریو جهت تست سریع
  const scenarioPresets = [
    {
      title: 'سوییپ + FVG استاندارد',
      query: 'سوییپ نقدینگی و هانت استاپ با شکست ساختار BOS و ورود در FVG',
    },
    {
      title: 'سودآور با سوییپ آسیا (TR-101)',
      query: 'جاروب نقدینگی کف آسیا با خروج در سقف FVG ۴ ساعته',
    },
    {
      title: 'معامله قبل سشن بهینه (TR-102)',
      query: 'شکست سقف ساختار یورو قبل از زمان بهینه سشن و استاپ بدون دستکاری',
    },
    {
      title: 'ریسک بالا پیش از اخبار FOMC',
      query: 'معامله با ریسک ۳ درصد در فاصله ۵ دقیقه‌ای بیانیه نرخ بهره و اسلیپیج بالا',
    },
    {
      title: 'تله روانی فومو و انتقام',
      query: 'ورود مجدد با مارکت اردر بعد از ضرر برای جبران سریع باخت و فومو',
    },
    {
      title: 'رنج متراکم فرسایشی',
      query: 'نوسان قیمت در رنج خسته‌کننده بدون روند در سشن آسیا',
    },
  ];

  // کلیه بخش‌های پایگاه دانش (شامل رکوردهای پویای ژورنال)
  const currentChunks = useMemo(() => {
    return isJournalSynced ? LocalRAGEngine.getAllChunks() : LocalRAGEngine.getAllChunks();
  }, [isJournalSynced]);

  // جستجوی زنده RAG
  const searchResults: RAGSearchResult[] = useMemo(() => {
    const activeQuery = searchQuery.trim();
    const categoryFilter = selectedCategory === 'ALL' ? undefined : (selectedCategory as S0KnowledgeCategory);

    if (!activeQuery) {
      // نمایش همه یا فیلتر دسته‌بندی
      let list = currentChunks;
      if (categoryFilter) {
        list = list.filter(c => c.category === categoryFilter);
      }
      return list.map(chunk => ({
        chunk,
        score: 100,
        matchedTerms: [],
        highlightSnippetFa: chunk.contentFa.slice(0, 160) + '...',
      }));
    }

    return LocalRAGEngine.search(activeQuery, {
      topK: 20,
      minScore: 5,
      category: categoryFilter,
    });
  }, [searchQuery, selectedCategory, currentChunks]);

  // نتایج آزمایشگاه سناریو
  const sandboxResults = useMemo(() => {
    if (!sandboxInput.trim()) return [];
    return isJournalSynced
      ? LocalRAGEngine.search(sandboxInput, { topK: 3, minScore: 10 })
      : LocalRAGEngine.search(sandboxInput, { topK: 3, minScore: 10 });
  }, [sandboxInput, isJournalSynced]);

  const categories = [
    { key: 'ALL', label: `همه بخش‌ها (${currentChunks.length})`, count: currentChunks.length },
    { key: 'CORE_RULE', label: 'قوانین اصلی S0', count: currentChunks.filter(c => c.category === 'CORE_RULE').length },
    { key: 'RISK_POLICY', label: 'مدیریت ریسک', count: currentChunks.filter(c => c.category === 'RISK_POLICY').length },
    { key: 'JOURNAL_LESSON', label: `درس‌های ژورنال (${currentChunks.filter(c => c.category === 'JOURNAL_LESSON').length})`, count: currentChunks.filter(c => c.category === 'JOURNAL_LESSON').length },
    { key: 'PSYCHOLOGY', label: 'روانشناسی و انضباط', count: currentChunks.filter(c => c.category === 'PSYCHOLOGY').length },
  ];

  const getCategoryBadge = (cat: S0KnowledgeCategory, chunkId?: string) => {
    if (chunkId && chunkId.startsWith('JOURNAL-')) {
      return { label: 'معامله واقعی ژورنال W5', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
    }
    switch (cat) {
      case 'CORE_RULE':
        return { label: 'قاعده اصلی S0', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
      case 'RISK_POLICY':
        return { label: 'سیاست ریسک', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' };
      case 'JOURNAL_LESSON':
        return { label: 'درس ژورنال', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      case 'PSYCHOLOGY':
        return { label: 'انضباط روانی', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
      default:
        return { label: 'قاعده سیستم', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* هدر صفحه و نشانگر معماری RAG */}
      <div className="bg-[#161a22] border border-[#272d3b] rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">کتابچه استراتژی S0 و بازیابی معنایی محلی (Local Semantic RAG)</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ۱۰۰٪ محلی / درون مرورگر
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                موتور هوشمند جستجوی برداری و استناددهی قطعی به قوانین پرایس‌اکشن و تجارب ژورنال، بدون ارسال داده به کلود
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsJournalSynced(!isJournalSynced)}
              className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors ${
                isJournalSynced
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-[#1b202c] text-gray-400 border-[#2b3345] hover:border-purple-500/30'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isJournalSynced ? 'همگام با ژورنال W5 (فعال)' : 'اتصال به ژورنال W5'}</span>
            </button>
            <button
              onClick={() => setShowSandbox(!showSandbox)}
              className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors ${
                showSandbox
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-[#1b202c] text-gray-300 border-[#2b3345] hover:border-cyan-500/30'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{showSandbox ? 'بستن آزمایشگاه RAG' : 'آزمایشگاه سنجش سناریو'}</span>
            </button>
          </div>
        </div>

        {/* جعبه آزمایشگاه سنجش زنده سناریو (RAG Scenario Sandbox) */}
        {showSandbox && (
          <div className="mt-4 pt-4 border-t border-[#272d3b]/80 bg-[#12161f]/60 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>شبیه‌ساز ارزیابی متن باز معامله با RAG محلی:</span>
              </div>
              <span className="text-[11px] text-gray-400">تطابق کوسینوسی زیر ۵ میلی‌ثانیه</span>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={sandboxInput}
                  onChange={e => setSandboxInput(e.target.value)}
                  placeholder="سناریوی معاملاتی خود را به فارسی یا انگلیسی بنویسید..."
                  className="flex-1 bg-[#1b202c] border border-[#2b3345] rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/60"
                />
                <button
                  onClick={() => setSandboxInput('')}
                  className="px-3 py-2 bg-[#1b202c] hover:bg-[#222837] text-gray-400 rounded-xl text-xs border border-[#2b3345]"
                >
                  پاکسازی
                </button>
              </div>

              {/* دکمه‌های سناریوهای سریع */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-gray-400">سناریوهای آماده:</span>
                {scenarioPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSandboxInput(preset.query)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-[#181d28] hover:bg-[#202736] text-gray-300 border border-[#272d3b] transition-colors"
                  >
                    {preset.title}
                  </button>
                ))}
              </div>

              {/* نمایش ۳ نتیجه منطبق با بالاترین امتیاز در شبیه‌ساز */}
              {sandboxResults.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#272d3b]/50">
                  <div className="text-xs font-medium text-gray-300 mb-2">قوانین و درس‌های کشف‌شده در سناریوی فوق:</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {sandboxResults.map((hit, idx) => {
                      const badge = getCategoryBadge(hit.chunk.category, hit.chunk.id);
                      return (
                        <div
                          key={idx}
                          className="bg-[#171c26] border border-[#272d3b] rounded-xl p-2.5 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.color}`}>
                                {hit.chunk.id}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-mono font-bold text-cyan-400">{hit.score}%</span>
                                <span className="text-[10px] text-gray-400">تطابق</span>
                              </div>
                            </div>
                            <div className="text-xs font-semibold text-white line-clamp-1">{hit.chunk.titleFa}</div>
                            <div className="text-[11px] text-gray-400 mt-1 line-clamp-2">{hit.highlightSnippetFa}</div>
                          </div>
                          {hit.matchedTerms.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-[#272d3b]/50">
                              {hit.matchedTerms.slice(0, 3).map((term, tIdx) => (
                                <span key={tIdx} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                                  {term}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* نوار جستجو و فیلتر دسته‌بندی‌ها */}
      <div className="bg-[#161a22] border border-[#272d3b] rounded-2xl p-3.5 shadow-sm space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="جستجوی هوشمند در تمام قوانین و تجارب S0 (مثال: سوییپ، FVG، حد ضرر، سشن نیویورک، فومو)..."
            className="w-full bg-[#1b202c] border border-[#2b3345] rounded-xl pr-10 pl-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/60"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-2.5 text-xs text-gray-400 hover:text-white"
            >
              پاکسازی
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                selectedCategory === cat.key
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                  : 'bg-[#1b202c] text-gray-400 border-[#272d3b] hover:border-gray-600'
              }`}
            >
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* نتایج و کارت‌های پایگاه دانش */}
      <div className="space-y-3">
        {searchResults.length === 0 ? (
          <div className="bg-[#161a22] border border-[#272d3b] rounded-2xl p-8 text-center">
            <HelpCircle className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <div className="text-sm font-semibold text-gray-300">موردی یافت نشد</div>
            <div className="text-xs text-gray-500 mt-1">
              عبارت جستجو را تغییر دهید یا فیلتر دسته‌بندی را روی «همه بخش‌ها» قرار دهید.
            </div>
          </div>
        ) : (
          searchResults.map(result => {
            const chunk = result.chunk;
            const isExpanded = expandedChunkId === chunk.id;
            const badge = getCategoryBadge(chunk.category, chunk.id);

            return (
              <div
                key={chunk.id}
                className={`bg-[#161a22] border rounded-2xl transition-all ${
                  isExpanded ? 'border-emerald-500/40 shadow-md' : 'border-[#272d3b] hover:border-[#384154]'
                }`}
              >
                {/* سربرگ کارت */}
                <div
                  onClick={() => setExpandedChunkId(isExpanded ? null : chunk.id)}
                  className="p-4 cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <span className={`text-xs px-2.5 py-1 rounded-lg border font-mono font-bold ${badge.color}`}>
                        {chunk.id}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{chunk.titleFa}</h3>
                        {searchQuery && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                            {result.score}% تطابق
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 font-sans" dir="ltr">
                        {chunk.titleEn}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className={`text-[11px] px-2.5 py-1 rounded-full border ${badge.color}`}>
                      {badge.label}
                    </span>
                    <button className="p-1 text-gray-400 hover:text-white">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* بدنه تفصیلی کارت در حالت باز */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-[#272d3b]/80 space-y-4">
                    {/* شرح کامل فارسی و انگلیسی */}
                    <div className="space-y-2">
                      <div className="text-xs leading-relaxed text-gray-200 bg-[#1b202c]/60 p-3 rounded-xl border border-[#2b3345]/60">
                        {chunk.contentFa}
                      </div>
                      <div className="text-xs leading-relaxed text-gray-400 bg-[#141822] p-3 rounded-xl border border-[#222837]" dir="ltr">
                        {chunk.contentEn}
                      </div>
                    </div>

                    {/* برچسب‌ها (Tags) */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-gray-400 ml-1" />
                      {chunk.tags.map((tag, tIdx) => (
                        <span
                          key={tIdx}
                          onClick={e => {
                            e.stopPropagation();
                            setSearchQuery(tag);
                          }}
                          className="text-[11px] px-2 py-0.5 rounded-lg bg-[#1f2636] hover:bg-emerald-500/20 hover:text-emerald-300 text-gray-300 cursor-pointer border border-[#2b3447] transition-colors"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* چک‌لیست اقدامات قبل از اجرا */}
                      <div className="bg-[#12161f] border border-[#272d3b] rounded-xl p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>چک‌لیست تأیید اجرا (Execution Checklist):</span>
                        </div>
                        <ul className="space-y-1.5 text-xs text-gray-300">
                          {chunk.executionChecklist.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-emerald-500 font-bold">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* شروط ابطال و خط قرمزها */}
                      <div className="bg-[#1a1419] border border-rose-900/40 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-rose-400 mb-2">
                          <AlertTriangle className="w-4 h-4" />
                          <span>شروط ابطال ایده (Invalidation Triggers):</span>
                        </div>
                        <ul className="space-y-1.5 text-xs text-gray-300">
                          {chunk.invalidationTriggers.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-rose-500 font-bold">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
