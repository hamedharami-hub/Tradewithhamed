// lib/ai/web-llm.worker.ts
// وب‌ورکر اختصاصی WebLLM برای اجرای پردازش‌های عصبی خارج از ترد اصلی UI
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// راه‌اندازی هندلر رسمی WebLLM
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
