import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6" dir="rtl">
      <h2 className="text-xl font-bold text-slate-800 mb-2">صفحه مورد نظر یافت نشد (۴۰۴)</h2>
      <p className="text-sm text-slate-500 mb-4">مسیر درخواست‌شده در سامانه وجود ندارد.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
      >
        بازگشت به میز کار معاملاتی
      </Link>
    </div>
  );
}
