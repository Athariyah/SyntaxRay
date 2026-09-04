/**
 * СинтексПруф · Антиплагиат.
 *
 * Лёгкая эвристика сходства исходников без внешних зависимостей:
 * нормализация (убрать комментарии/строки/пробелы) → токены →
 * шинглы (k=5) → коэффициент Жаккара.
 *
 * Устойчиво к переименованию переменных и переформатированию,
 * но не претендует на точность MOSS — это быстрый первый фильтр
 * для преподавателя («какие пары проверить вручную»).
 */

import { languageFamily } from "@/lib/languages";

function stripNoise(code: string, language: string): string {
  let s = code;
  // строковые и символьные литералы → плейсхолдер
  s = s.replace(/"(?:[^"\\\n]|\\.)*"/g, '"S"').replace(/'(?:[^'\\\n]|\\.)*'/g, "'C'");
  // комментарии
  const family = languageFamily(language);
  if (family === "python-like" || family === "ruby-like") {
    s = s.replace(/"""[\s\S]*?"""/g, " ").replace(/#[^\n]*/g, " ");
  } else if (language === "sql" || language === "haskell") {
    s = s.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  } else {
    s = s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  }
  // числа → плейсхолдер, всё в нижний регистр
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, "N").toLowerCase();
  return s;
}

function tokenize(normalized: string): string[] {
  return normalized.split(/[^a-zа-яё_]+/i).filter((t) => t.length > 1);
}

/** Множество шинглов длины k поверх токенов. */
export function fingerprint(code: string, language: string, k = 5): Set<string> {
  const tokens = tokenize(stripNoise(code, language));
  const out = new Set<string>();
  if (tokens.length < k) {
    if (tokens.length > 0) out.add(tokens.join(" "));
    return out;
  }
  for (let i = 0; i <= tokens.length - k; i += 1) {
    out.add(tokens.slice(i, i + k).join(" "));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function languageGroup(language: string): string {
  if (language === "c" || language === "cpp") return "c/cpp";
  if (language === "javascript" || language === "typescript") return "js/ts";
  if (language === "java" || language === "kotlin") return "jvm";
  return language;
}

/**
 * Сходство двух работ (0..1). Разные языковые группы не сравниваем.
 * Конкатенируем файлы каждой работы — порядок файлов не важен,
 * т.к. шинглы считаются множеством.
 */
export function similarityBetween(
  a: { language: string; contents: string[] },
  b: { language: string; contents: string[] },
): number {
  if (languageGroup(a.language) !== languageGroup(b.language)) return 0;
  const fa = new Set<string>();
  for (const c of a.contents) for (const s of fingerprint(c.slice(0, 30_000), a.language)) fa.add(s);
  const fb = new Set<string>();
  for (const c of b.contents) for (const s of fingerprint(c.slice(0, 30_000), b.language)) fb.add(s);
  return jaccard(fa, fb);
}

export interface SimilarPair {
  aId: string;
  aTitle: string;
  aAuthor: string;
  bId: string;
  bTitle: string;
  bAuthor: string;
  score: number;
}

/** Топ-N самых похожих пар среди работ. Сложность O(n²) — вызывайте на ≤30 работах. */
export function topSimilarPairs(
  works: Array<{ publicId: string; title: string; author: string; language: string; contents: string[] }>,
  topN = 5,
  threshold = 0.45,
): SimilarPair[] {
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < works.length; i += 1) {
    for (let j = i + 1; j < works.length; j += 1) {
      const a = works[i];
      const b = works[j];
      if (a.publicId === b.publicId) continue;
      const score = similarityBetween(a, b);
      if (score >= threshold) {
        pairs.push({
          aId: a.publicId,
          aTitle: a.title,
          aAuthor: a.author,
          bId: b.publicId,
          bTitle: b.title,
          bAuthor: b.author,
          score,
        });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, topN);
}

export function similarityVerdict(score: number): string {
  if (score >= 0.85) return "почти идентичны";
  if (score >= 0.7) return "очень похожи";
  if (score >= 0.55) return "заметно похожи";
  return "есть общие фрагменты";
}
