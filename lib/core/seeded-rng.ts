// lib/core/seeded-rng.ts
// موتور تولید اعداد شبه‌تصادفی قطعی و تکرارپذیر (Deterministic PRNG)
// مبتنی بر الگوریتم بهینه و ۳۲بیتی Mulberry32 بدون وابستگی به Math.random

export class SeededRNG {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed = 1337) {
    // نرمال‌سازی سید به عدد صحیح مثبت ۳۲ بیتی
    const safeSeed = Math.floor(Math.abs(seed)) % 0xffffffff || 1337;
    this.initialSeed = safeSeed;
    this.state = safeSeed;
  }

  public getSeed(): number {
    return this.initialSeed;
  }

  // تولید عدد اعشاری پیوسته در بازه [0, 1) با Mulberry32
  public next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // تولید عدد صحیح در بازه [min, max]
  public nextInt(min: number, max: number): number {
    const low = Math.ceil(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    return Math.floor(this.next() * (high - low + 1)) + low;
  }

  // بولین احتمالی
  public nextBoolean(probability = 0.5): boolean {
    return this.next() < probability;
  }

  // بُر زدن قطعی آرایه بدون تغییر آرایه ورودی (Immutability)
  public shuffle<T>(array: readonly T[]): T[] {
    const clone = [...array];
    for (let i = clone.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
  }

  // نمونه‌گیری تصادفی با جایگذاری (Bootstrap Sample)
  public sampleWithReplacement<T>(items: readonly T[], count: number): T[] {
    if (items.length === 0) return [];
    const samples: T[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(this.next() * items.length);
      samples.push(items[idx]);
    }
    return samples;
  }

  // استخراج یک عنصر
  public sample<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('نمی‌توان از آرایه خالی نمونه‌گیری کرد.');
    }
    const idx = Math.floor(this.next() * items.length);
    return items[idx];
  }

  // انشعاب یک مولد فرزند با سید مستقل برآمده از وضعیت فعلی
  public fork(): SeededRNG {
    const nextSeed = this.nextInt(1, 0x7fffffff);
    return new SeededRNG(nextSeed);
  }
}
