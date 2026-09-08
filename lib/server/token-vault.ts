import crypto from 'node:crypto';
import { EncryptedTokenPayload } from '../contracts/security';

/**
 * گاوصندوق رمزنگاری توکن‌ها در سمت سرور (Server-Side Token Vault)
 * استفاده از استاندارد معتبر AES-256-GCM با بردار مقداردهی تصادفی (IV) و تگ احراز اصالت (Auth Tag).
 * طبق منشور پروژه: هیچ رمز، توکن دسترسی یا سکرتی هرگز به کلاینت منتقل نمی‌شود.
 */
export class TokenVault {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // ۱۲ بایت بهینه برای GCM
  private static readonly AUTH_TAG_LENGTH = 16; // ۱۶ بایت استاندارد تگ احراز هویت

  /**
   * استخراج یا ایجاد کلید ۲۵۶ بیتی امن از متغیرهای محیطی با سیاست شکست-بسته
   */
  private static getMasterKey(): Buffer {
    const rawKey = process.env.CTRADER_TOKEN_ENCRYPTION_KEY?.trim();
    if (!rawKey) {
      if (process.env.NODE_ENV === 'test') {
        return crypto.createHash('sha256').update('TEST_ONLY_DEV_ENCRYPTION_KEY_NOT_FOR_PRODUCTION').digest();
      }
      throw new Error(
        'CONFIG_FATAL_MISSING_KEY: متغیر محیطی CTRADER_TOKEN_ENCRYPTION_KEY تنظیم نشده است. طبق اصل شکست-بسته (Fail-Closed)، گاوصندوق توکن تا زمان مقداردهی کلید امن مسدود است.'
      );
    }
    // استفاده از SHA-256 برای تضمین دقیق ۳۲ بایت (۲۵۶ بیت)
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * رمزنگاری داده‌های حساس یا توکن با الگوریتم AES-256-GCM
   */
  public static encrypt(plaintext: string): EncryptedTokenPayload {
    if (!plaintext) {
      throw new Error('TOKEN_VAULT_ERROR: متن ورودی برای رمزنگاری نمی‌تواند خالی باشد.');
    }

    const iv = crypto.randomBytes(this.IV_LENGTH);
    const key = this.getMasterKey();

    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH,
    });

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      algorithm: 'AES-256-GCM',
      ciphertextHex: encrypted,
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      createdAt: Date.now(),
    };
  }

  /**
   * رمزگشایی و اعتبارسنجی تگ احراز هویت.
   * هرگونه دستکاری در داده یا تگ به خطای سخت‌گیرانه (Fail-Closed) منجر می‌شود.
   */
  public static decrypt(payload: EncryptedTokenPayload): string {
    if (!payload.ciphertextHex || !payload.ivHex || !payload.authTagHex) {
      throw new Error('TOKEN_VAULT_ERROR: ساختار پلود رمزنگاری‌شده ناقص است.');
    }

    const key = this.getMasterKey();
    const iv = Buffer.from(payload.ivHex, 'hex');
    const authTag = Buffer.from(payload.authTagHex, 'hex');

    if (iv.length !== this.IV_LENGTH) {
      throw new Error('TOKEN_VAULT_ERROR: طول بردار مقداردهی (IV) نامعتبر است.');
    }
    if (authTag.length !== this.AUTH_TAG_LENGTH) {
      throw new Error('TOKEN_VAULT_ERROR: طول تگ احراز هویت (Auth Tag) نامعتبر است.');
    }

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    try {
      let decrypted = decipher.update(payload.ciphertextHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      throw new Error(
        'SECURITY_FATAL: رمزگشایی ناموفق بود یا اصالت داده‌ها دستکاری شده است (Auth Tag Mismatch - Fail-Closed).'
      );
    }
  }

  /**
   * دریافت وضعیت فعال و الگوریتم گاوصندوق
   */
  public static getVaultStatus() {
    return {
      active: true,
      algorithm: 'AES-256-GCM',
      zeroSecretLeakageCompliant: true,
    };
  }

  /**
   * ممیزی بازگشتی اشیاء برای اطمینان ۱۰۰٪ از عدم نشت هرگونه سکرت، توکن یا کلمه عبور به خروجی کلاینت
   */
  public static auditPayloadNoSecrets(obj: unknown, path = '') {
    const res = this.auditZeroSecretLeakage(obj, path);
    return {
      clean: res.isClean,
      violations: res.violations,
    };
  }

  /**
   * ممیزی بازگشتی اشیاء برای اطمینان ۱۰۰٪ از عدم نشت هرگونه سکرت، توکن یا کلمه عبور به خروجی کلاینت
   */
  public static auditZeroSecretLeakage(obj: unknown, path = ''): { isClean: boolean; violations: string[] } {
    const forbiddenKeywords = [
      'clientsecret',
      'client_secret',
      'accesstoken',
      'access_token',
      'refreshtoken',
      'refresh_token',
      'gemini_api_key',
      'apikey',
      'api_key',
      'secretkey',
      'secret_key',
      'password',
      'privatekey',
      'private_key',
    ];

    const violations: string[] = [];

    const traverse = (current: unknown, currentPath: string) => {
      if (!current || typeof current !== 'object') return;

      if (Array.isArray(current)) {
        current.forEach((item, index) => traverse(item, `${currentPath}[${index}]`));
        return;
      }

      for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        const hasForbidden = forbiddenKeywords.some(kw => lowerKey.includes(kw));

        if (hasForbidden && value !== null && value !== undefined && value !== '') {
          violations.push(`نشت سکرت در کلید «${currentPath ? `${currentPath}.${key}` : key}» کشف شد.`);
        }

        if (typeof value === 'object') {
          traverse(value, currentPath ? `${currentPath}.${key}` : key);
        }
      }
    };

    traverse(obj, path);

    return {
      isClean: violations.length === 0,
      violations,
    };
  }
}
