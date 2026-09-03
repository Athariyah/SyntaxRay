/** Определение языка по расширению файла + фильтр «интересных» файлов. */

const EXT_MAP: Record<string, string> = {
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  py: "python",
  pyw: "python",
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXT_MAP);

export function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plaintext";
}

export function isAnalyzableFile(path: string): boolean {
  if (!path) return false;
  const normalized = path.replace(/\\/g, "/");
  if (normalized.endsWith("/")) return false;
  if (/(^|\/)(node_modules|\.git|__pycache__|venv|build|dist|cmake-build[^/]*)\//i.test(normalized)) {
    return false;
  }
  if (/(^|\/)__MACOSX\//.test(normalized)) return false;
  return detectLanguage(normalized) !== "plaintext";
}

/** Обобщённый язык всей заявки. */
export function aggregateLanguage(languages: string[]): string {
  const unique = Array.from(new Set(languages.filter((l) => l !== "plaintext")));
  if (unique.length === 0) return "plaintext";
  if (unique.length === 1) return unique[0];
  if (unique.every((l) => l === "c" || l === "cpp")) return "cpp";
  return "mixed";
}

/** Monaco использует те же идентификаторы, но подстрахуемся. */
export function monacoLanguage(language: string): string {
  if (language === "c" || language === "cpp") return "cpp";
  if (language === "python") return "python";
  return "plaintext";
}
