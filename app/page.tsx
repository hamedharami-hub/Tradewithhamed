'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  BookOpen,
  FlaskConical,
  Globe,
  ArrowLeft,
  Lock,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0a0d14] text-zinc-100 flex flex-col font-sans select-none" dir="rtl">
      {/* سربرگ معرفی سامانه */}
      <header className="w-full bg-[#0d111a] border-b border-[#1c2230] px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm sm:text-base text-zinc-100">Tradewithhamed</span>
              <span className="text-[10px] text-zinc-500 mr-2 font-mono">سامانه معاملات شخصی</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#141926] border border-[#232c40] text-zinc-300 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>۳ محیط مستقل و تفکیک‌شده</span>
          </div>
        </div>
      </header>

      {/* بخش اصلی: ۳ انتخاب روشن برای شروع */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 flex flex-col justify-center space-y-8">
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <h1 className="text-xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
            می‌خواهید چه کاری انجام دهید؟
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            برای شروع، یکی از سه محیط زیر را انتخاب کنید. هر محیط داده، حساب و کارکرد کاملاً مستقلی دارد:
          </p>
        </div>

        {/* سه انتخاب اصلی */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* ۱. تمرین با داده نمونه */}
          <div className="bg-[#0f131f] border border-amber-500/30 hover:border-amber-500/70 rounded-3xl p-5 flex flex-col justify-between space-y-5 transition-all shadow-xl hover:shadow-amber-500/5 group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BookOpen className="w-6 h-6" />
                </div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                  ۱۰۰٪ آفلاین
                </span>
              </div>

              <div>
                <h2 className="text-base font-bold text-zinc-100">۱. تمرین با دادهٔ نمونه</h2>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  آموزش و تمرین پرایس‌اکشن روی چارت بازپخش کندل به کندل با حساب فرضی.
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-[#1d2538] text-xs">
                <div>
                  <span className="text-zinc-500 text-[11px] block">چه کاری انجام می‌دهد؟</span>
                  <span className="text-zinc-300 text-[11px] font-medium leading-relaxed block mt-0.5">
                    بازپخش کندل‌ها، ثبت معامله آزمایشی و مدیریت حد ضرر/سود در شبیه‌ساز.
                  </span>
                </div>

                <div>
                  <span className="text-zinc-500 text-[11px] block">چه پیش‌نیازی دارد؟</span>
                  <span className="text-emerald-400 text-[11px] font-bold block mt-0.5">
                    بدون هیچ پیش‌نیاز (آمادهٔ استفاده فوری بدون اینترنت).
                  </span>
                </div>

                <div className="pt-1">
                  <span className="text-zinc-500 text-[11px] block">ارسال سفارش به بروکر:</span>
                  <div className="flex items-center gap-1 text-rose-400 font-bold text-[11px] mt-0.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>خیر (معاملات فقط در حافظهٔ موقت مرورگر ثبت می‌شوند).</span>
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/practice"
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md group-hover:shadow-amber-500/20"
            >
              <span>ورود به محیط تمرین</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>

          {/* ۲. بررسی استراتژی روی گذشته */}
          <div className="bg-[#0f131f] border border-purple-500/30 hover:border-purple-500/70 rounded-3xl p-5 flex flex-col justify-between space-y-5 transition-all shadow-xl hover:shadow-purple-500/5 group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FlaskConical className="w-6 h-6" />
                </div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-bold border border-purple-500/30">
                  بک‌تست و آمار
                </span>
              </div>

              <div>
                <h2 className="text-base font-bold text-zinc-100">۲. بررسی استراتژی روی گذشته</h2>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  آزمایش علمی استراتژی‌ها روی داده‌های تاریخی واقعی و سنجش ریسک با مونت‌کارلو.
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-[#1d2538] text-xs">
                <div>
                  <span className="text-zinc-500 text-[11px] block">چه کاری انجام می‌دهد؟</span>
                  <span className="text-zinc-300 text-[11px] font-medium leading-relaxed block mt-0.5">
                    بک‌تست چندسبکه، سنجش افت سرمایه، شبیه‌سازی ۱۰۰۰ مسیره و ممیزی داده.
                  </span>
                </div>

                <div>
                  <span className="text-zinc-500 text-[11px] block">چه پیش‌نیازی دارد؟</span>
                  <span className="text-purple-300 text-[11px] font-bold block mt-0.5">
                    انتخاب یکی از دیتاست‌های تاریخی آماده یا بارگذاری فایل CSV.
                  </span>
                </div>

                <div className="pt-1">
                  <span className="text-zinc-500 text-[11px] block">ارسال سفارش به بروکر:</span>
                  <div className="flex items-center gap-1 text-rose-400 font-bold text-[11px] mt-0.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>خیر (محاسبات کاملاً تحلیلی و در مرورگر شماست).</span>
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/research"
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md group-hover:shadow-purple-500/20"
            >
              <span>ورود به بررسی استراتژی</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>

          {/* ۳. اتصال به حساب دموی بروکر */}
          <div className="bg-[#0f131f] border border-emerald-500/30 hover:border-emerald-500/70 rounded-3xl p-5 flex flex-col justify-between space-y-5 transition-all shadow-xl hover:shadow-emerald-500/5 group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Globe className="w-6 h-6" />
                </div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30">
                  cTrader Demo
                </span>
              </div>

              <div>
                <h2 className="text-base font-bold text-zinc-100">۳. اتصال به حساب دموی بروکر</h2>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  مشاهده مظنه‌های زنده سرور دمو و ارسال سفارش آزمایشی با نظارت اپراتور.
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-[#1d2538] text-xs">
                <div>
                  <span className="text-zinc-500 text-[11px] block">چه کاری انجام می‌دهد؟</span>
                  <span className="text-zinc-300 text-[11px] font-medium leading-relaxed block mt-0.5">
                    دریافت قیمت‌های زنده، ارسال امن سفارش به بروکر دمو و مدیریت صندوق خروجی.
                  </span>
                </div>

                <div>
                  <span className="text-zinc-500 text-[11px] block">چه پیش‌نیازی دارد؟</span>
                  <span className="text-cyan-400 text-[11px] font-bold block mt-0.5">
                    کلید دسترسی اپراتور و اتصال اینترنت به فید دمو.
                  </span>
                </div>

                <div className="pt-1">
                  <span className="text-zinc-500 text-[11px] block">ارسال سفارش به بروکر:</span>
                  <div className="flex items-center gap-1 text-emerald-400 font-bold text-[11px] mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>بله (سفارش به حساب آزمایشی cTrader Demo ارسال می‌شود).</span>
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/demo"
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md group-hover:shadow-emerald-500/20"
            >
              <span>ورود به دموی بروکر</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
