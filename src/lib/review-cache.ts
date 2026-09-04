import type { ReviewContentData } from "@/components/review/review-content";

const KEY_PREFIX = "sr:review:";

function cacheKey(publicId: string): string {
  return `${KEY_PREFIX}${publicId}`;
}

/**
 * Временное хранилище только что созданного ревью (sessionStorage).
 *
 * На Vercel без DATABASE_URL встроенная PGlite живёт внутри одного
 * инстанса функции: POST /api/submissions пишет в одну песочницу,
 * а страница /review читает из другой (пустой). Чтобы только что
 * запущенное ревью не показывало 404, результат передаём через
 * сессию браузера и показываем его как фолбэк.
 */
export function saveReview(payload: ReviewContentData): void {
  try {
    sessionStorage.setItem(cacheKey(payload.publicId), JSON.stringify(payload));
  } catch {
    /* приватный режим / переполнение — молча пропускаем */
  }
}

export function readReview(publicId: string): ReviewContentData | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(publicId));
    return raw ? (JSON.parse(raw) as ReviewContentData) : null;
  } catch {
    return null;
  }
}
