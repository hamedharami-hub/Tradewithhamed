#!/usr/bin/env python3
import json, math, random, sys
from pathlib import Path

INPUTS = sys.argv[1:] or ['data/runs/stage3-gbpusd-provider-benchmark.json','data/runs/stage3-eurusd-provider-benchmark-v2.json','data/runs/stage3-xauusd-provider-benchmark-v2.json']
OUTPUT = Path('data/runs/stage7-hybrid-depth-analysis.json')
ITER = 20000

def quantile(x,p):
    x=sorted(x); i=(len(x)-1)*p; a=math.floor(i); b=math.ceil(i); return x[a]+(x[b]-x[a])*(i-a)
def mean(x): return sum(x)/len(x) if x else 0.0
def bootstrap_diff(a,b,seed):
    if not a or not b: return {'nA':len(a),'nB':len(b),'meanDiff':None,'ci95':[None,None],'probabilityA_better':None}
    r=random.Random(seed); diffs=[]
    for _ in range(ITER): diffs.append(mean([r.choice(a) for _ in a])-mean([r.choice(b) for _ in b]))
    return {'nA':len(a),'nB':len(b),'meanDiff':round(mean(a)-mean(b),4),'ci95':[round(quantile(diffs,.025),4),round(quantile(diffs,.975),4)],'probabilityA_better':round(sum(v>0 for v in diffs)/ITER,4)}
def beta_summary(w,l,seed):
    r=random.Random(seed); samples=[]
    for _ in range(ITER):
        # Marsaglia-Tsang-free gamma via sums of exponentials for integer counts.
        def gamma_int(k): return sum(-math.log(max(1e-12,r.random())) for _ in range(k))
        x=gamma_int(w+1); y=gamma_int(l+1); samples.append(x/(x+y))
    return {'posterior':'Beta(wins+1,losses+1)','mean':round((w+1)/(w+l+2),4),'ci95':[round(quantile(samples,.025),4),round(quantile(samples,.975),4)],'probability_gt_50pct':round(sum(v>.5 for v in samples)/ITER,4)}

def load(path): return json.loads(Path(path).read_text())
result={'version':'stage7-hybrid-depth-v1','iterations':ITER,'method':'Trade-level bootstrap plus Beta(1,1) posterior; not a proof of causality or non-overfitting.','symbols':{},'warnings':[]}
for idx,path in enumerate(INPUTS):
    d=load(path); sym=d.get('symbol',Path(path).stem); runs=d.get('runs',{}); review=d.get('candidateReview',{}).get('modes',{})
    h=runs.get('HYBRID',{}); off=runs.get('OFF',{}); det=runs.get('DETERMINISTIC',{})
    hp=review.get('HYBRID',{}).get('tradePnls',[]); op=review.get('OFF',{}).get('tradePnls',[]); dp=review.get('DETERMINISTIC',{}).get('tradePnls',[])
    hw=int(h.get('winningTrades',sum(x>0 for x in hp))); hl=int(h.get('losingTrades',sum(x<=0 for x in hp)))
    hr=review.get('HYBRID',{}); total_candidates=int(d.get('candidateReview',{}).get('candidateCount',0)); reviewed=int(hr.get('reviewed',0)); approved=int(hr.get('approved',0));
    result['symbols'][sym]={'hybrid':{'trades':len(hp),'wins':hw,'losses':hl,'winRate':h.get('winRatePercent'),'netProfit':h.get('netProfit'),'posteriorWinRate':beta_summary(hw,hl,100+idx)},'differences':{'hybridMinusOffPnl':bootstrap_diff(hp,op,200+idx),'hybridMinusDeterministicPnl':bootstrap_diff(hp,dp,300+idx)},'selection':{'candidateCount':total_candidates,'reviewed':reviewed,'approved':approved,'approvalRateAmongReviewed':round(approved/reviewed,4) if reviewed else None,'candidateToTradeRate':round(len(hp)/total_candidates,4) if total_candidates else None,'rejectionReasons':hr.get('reasons',{})},'interpretation':['Hybrid has a selection effect: it changes which candidates reach execution, not only the label of the same trades.','With fewer than 30 trades, posterior intervals and bootstrap differences remain unstable.']}
result['warnings']=['The benchmark review cap was 12 candidates in the source artifacts.','Hybrid is not causally comparable to OFF unless the same candidate set, costs, and execution timestamps are replayed.','Do not promote Hybrid until each mode has at least 30 closed trades and a fresh OOS fold.']
OUTPUT.parent.mkdir(parents=True,exist_ok=True); OUTPUT.write_text(json.dumps(result,indent=2)); print(json.dumps({'output':str(OUTPUT),'symbols':list(result['symbols'])},indent=2))
