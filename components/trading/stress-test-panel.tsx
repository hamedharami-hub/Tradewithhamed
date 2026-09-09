'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Play, ShieldCheck } from 'lucide-react';

interface Scenario { id: string; nameFa: string; type: string; symbol: string; seed: number; }
interface Result { runId: string; scenarioId: string; scenarioNameFa: string; status: string; passed: boolean; maxDrawdownPercent: number; maxSpreadPips: number; duplicateOrdersPrevented: number; reconciliationRequired: number; invariantViolations: string[]; }

export function StressTestPanel() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('برای اجرای تست، نشست اپراتور لازم است.');

  const load = async () => {
    const response = await fetch('/api/stress-tests', { cache: 'no-store' });
    const payload = await response.json() as { data?: { scenarios: Scenario[]; results: Result[] }; error?: { message?: string } };
    if (!response.ok || !payload.data) { setMessage(payload.error?.message || 'دسترسی به سناریوها ممکن نیست.'); return; }
    setScenarios(payload.data.scenarios);
    setResults(payload.data.results);
    setSelected(current => current || payload.data?.scenarios[0]?.id || '');
    setMessage('سناریوهای بحرانی آماده اجرا هستند.');
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const run = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const response = await fetch('/api/stress-tests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: selected }),
      });
      const payload = await response.json() as { data?: Result; error?: { message?: string } };
      if (!response.ok || !payload.data) { setMessage(payload.error?.message || 'اجرای تست شکست خورد.'); return; }
      setResults(current => [payload.data as Result, ...current].slice(0, 5));
      setMessage(`تست «${payload.data.scenarioNameFa}» با وضعیت ${payload.data.status} پایان یافت.`);
    } finally { setRunning(false); }
  };

  const latest = results[0];
  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-3" dir="rtl">
      <header className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-cyan-500" /><div><h3 className="font-bold text-sm text-[var(--text-primary)]">آزمایش استرس بازار</h3><p className="text-[11px] text-[var(--text-muted)]">اجرای ایزوله در PAPER_REPLAY؛ بدون فراخوانی بروکر واقعی</p></div></div>
        <div className="flex gap-2"><select value={selected} onChange={event => setSelected(event.target.value)} className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg px-2 py-2 text-xs text-[var(--text-primary)]">{scenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.nameFa}</option>)}</select><button type="button" onClick={() => void run()} disabled={running || !selected} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs disabled:opacity-50"><Play className="w-3.5 h-3.5 inline ml-1" />{running ? 'در حال اجرا' : 'اجرا'}</button></div>
      </header>
      <p className="text-[11px] text-[var(--text-muted)]">{message}</p>
      {latest && <div className={`rounded-xl border p-3 ${latest.passed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
        <div className="flex justify-between items-center"><span className="text-xs font-bold text-[var(--text-primary)]">آخرین نتیجه: {latest.scenarioNameFa}</span><span className={`text-[10px] font-mono ${latest.passed ? 'text-emerald-500' : 'text-rose-500'}`}>{latest.status}</span></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-[10px] text-[var(--text-muted)]"><span>Drawdown: {latest.maxDrawdownPercent}%</span><span>Spread: {latest.maxSpreadPips} pip</span><span>Duplicate blocked: {latest.duplicateOrdersPrevented}</span><span>Reconcile: {latest.reconciliationRequired}</span></div>
        {latest.invariantViolations.length > 0 && <div className="mt-2 text-[10px] text-rose-500 flex gap-1"><AlertTriangle className="w-3 h-3" />{latest.invariantViolations.join(', ')}</div>}
      </div>}
    </section>
  );
}
