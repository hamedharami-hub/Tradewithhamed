#!/usr/bin/env python3
import json
import math
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
INPUTS = [
    ROOT / 'data/runs/stage3-gbpusd-provider-benchmark.json',
    ROOT / 'data/runs/stage3-eurusd-provider-benchmark-v2.json',
    ROOT / 'data/runs/stage3-xauusd-provider-benchmark-v2.json',
]
OUTPUT = ROOT / 'data/runs/stage5-winrate-ci95.png'
MODES = ['OFF', 'DETERMINISTIC', 'ONLINE', 'HYBRID', 'WEBLLM']
LABELS = {'OFF': 'OFF', 'DETERMINISTIC': 'Deterministic', 'ONLINE': 'Online', 'HYBRID': 'Hybrid', 'WEBLLM': 'WebLLM\n(blocked)'}
COLORS = {'OFF': '#64748b', 'DETERMINISTIC': '#2563eb', 'ONLINE': '#7c3aed', 'HYBRID': '#059669', 'WEBLLM': '#cbd5e1'}

def wilson(wins: int, total: int, z: float = 1.959963984540054):
    if total <= 0:
        return float('nan'), float('nan'), float('nan')
    p = wins / total
    den = 1 + z*z/total
    center = (p + z*z/(2*total)) / den
    half = z * math.sqrt((p*(1-p) + z*z/(4*total))/total) / den
    return p, max(0.0, center-half), min(1.0, center+half)

series = []
for path in INPUTS:
    payload = json.loads(path.read_text())
    symbol = payload['symbol']
    for mode in MODES:
        run = payload['runs'].get(mode, {})
        n = int(run.get('totalTrades') or 0)
        wins = int(run.get('winningTrades') or 0)
        p, lo, hi = wilson(wins, n)
        series.append({'symbol': symbol, 'mode': mode, 'n': n, 'wins': wins, 'p': p, 'lo': lo, 'hi': hi, 'measured': n > 0})

symbols = [p.stem.split('-')[1].upper() for p in INPUTS]
fig, axes = plt.subplots(1, len(symbols), figsize=(16, 6), sharey=True)
if len(symbols) == 1:
    axes = [axes]
for ax, symbol in zip(axes, symbols):
    rows = [r for r in series if r['symbol'] == symbol]
    x = np.arange(len(MODES))
    values = [0 if math.isnan(r['p']) else r['p']*100 for r in rows]
    lower = [0 if math.isnan(r['lo']) else (r['p']-r['lo'])*100 for r in rows]
    upper = [0 if math.isnan(r['hi']) else (r['hi']-r['p'])*100 for r in rows]
    bars = ax.bar(x, values, color=[COLORS[m] for m in MODES], alpha=0.9, width=0.68)
    for i, r in enumerate(rows):
        if r['measured']:
            ax.errorbar(i, values[i], yerr=[[lower[i]], [upper[i]]], fmt='none', ecolor='#0f172a', capsize=5, linewidth=1.5)
            ax.text(i, min(99, values[i]+max(4, upper[i]+2)), f"n={r['n']}", ha='center', va='bottom', fontsize=8)
        else:
            ax.text(i, 3, 'N/A\nGPU run', ha='center', va='bottom', fontsize=8, color='#475569')
    ax.set_title(symbol, fontsize=13, weight='bold')
    ax.set_xticks(x, [LABELS[m] for m in MODES], fontsize=8)
    ax.set_ylim(0, 100)
    ax.grid(axis='y', linestyle=':', alpha=0.35)
    ax.set_axisbelow(True)
axes[0].set_ylabel('Win Rate (%) with Wilson 95% CI')
fig.suptitle('Stage 5 AI Benchmark — Win Rate and 95% Confidence Intervals', fontsize=15, weight='bold')
fig.text(0.5, 0.01, 'Intervals are Wilson binomial intervals from closed-trade wins/losses. WebLLM is N/A because the real GPU browser run was blocked; no simulated Win Rate is plotted.', ha='center', fontsize=9, color='#334155')
fig.tight_layout(rect=[0, 0.05, 1, 0.94])
fig.savefig(OUTPUT, dpi=180, bbox_inches='tight')
print(json.dumps({'output': str(OUTPUT), 'rows': len(series), 'webllm_measured': False}, indent=2))
