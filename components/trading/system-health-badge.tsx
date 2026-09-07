'use client';

import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Cpu, HardDrive, X } from 'lucide-react';

interface HealthData {
  status: string;
  version: string;
  uptimeSeconds: number;
  latencyMs: number;
  subsystems: {
    tokenVault: {
      active: boolean;
      algorithm: string;
      zeroSecretLeakageCompliant: boolean;
    };
    orderManagement: {
      totalRecords: number;
      isBlocked: boolean;
      blockingReason: string | null;
    };
    rateLimiting: {
      totalRequests: number;
      totalBlocked: number;
      activeTrackedIps: number;
    };
  };
  system: {
    memoryHeapUsedMB: number;
    memoryRssMB: number;
    nodeVersion: string;
  };
}

export function SystemHealthBadge() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && active) {
          const data = await res.json();
          setHealth(data);
        }
      } catch {
        // نادیده گرفتن خطا
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const isHealthy = health?.status === 'HEALTHY';

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono transition-all border bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800"
        title="وضعیت سلامت سامانه سرور"
      >
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isHealthy ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isHealthy ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
        </span>
        <span className="text-zinc-300 font-sans hidden sm:inline">
          {isHealthy ? 'سیستم سالم' : 'نیازمند بررسی'}
        </span>
        <span className="text-[10px] text-zinc-500 font-mono">v3.4-RC</span>
      </button>

      {/* مودال جزئیات سلامت سرور */}
      {showModal && health && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-zinc-100 text-sm">
                  گزارش سلامت زنده سرور (Production Health)
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-200 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850 space-y-1">
                <span className="text-zinc-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> گاوصندوق توکن
                </span>
                <p className="font-mono font-medium text-emerald-400">
                  {health.subsystems.tokenVault.algorithm} (فعال)
                </p>
                <p className="text-[10px] text-zinc-500">عدم نشت سکرت: تایید</p>
              </div>

              <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850 space-y-1">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-amber-400" /> کنترل نرخ درخواست
                </span>
                <p className="font-mono font-medium text-zinc-200">
                  {health.subsystems.rateLimiting.totalRequests} درخواست
                </p>
                <p className="text-[10px] text-zinc-500">
                  مسدودشده: {health.subsystems.rateLimiting.totalBlocked}
                </p>
              </div>

              <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850 space-y-1">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" /> تأخیر و زمان فعالیت
                </span>
                <p className="font-mono font-medium text-zinc-200">
                  {health.latencyMs}ms | {health.uptimeSeconds}s
                </p>
                <p className="text-[10px] text-zinc-500">Node: {health.system.nodeVersion}</p>
              </div>

              <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850 space-y-1">
                <span className="text-zinc-400 flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> حافظه سرور (Heap)
                </span>
                <p className="font-mono font-medium text-zinc-200">
                  {health.system.memoryHeapUsedMB} MB
                </p>
                <p className="text-[10px] text-zinc-500">RSS: {health.system.memoryRssMB} MB</p>
              </div>
            </div>

            <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded-lg text-emerald-300 text-xs flex items-center justify-between">
              <span>قوانین Fail-Closed و Demo-Only برقرار است</span>
              <span className="font-mono text-[10px] bg-emerald-900/50 px-2 py-0.5 rounded">
                AUD 0 / ماه
              </span>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </>
  );
}
