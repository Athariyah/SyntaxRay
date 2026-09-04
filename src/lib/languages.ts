/** Определение языка по расширению файла + фильтр «интересных» файлов. */

export interface LanguageInfo {
  id: string;
  label: string;
  /** Идентификатор языка в Monaco Editor. */
  monaco: string;
  /** Семейство синтаксиса — влияет на парсинг комментариев/блоков и сравнение в антиплагиате. */
  family: "c-like" | "python-like" | "ruby-like" | "other";
  extensions: string[];
}

export const LANGUAGES: LanguageInfo[] = [
  { id: "c", label: "C", monaco: "c", family: "c-like", extensions: ["c", "h"] },
  { id: "cpp", label: "C++", monaco: "cpp", family: "c-like", extensions: ["cc", "cpp", "cxx", "hpp", "hh", "hxx", "ipp"] },
  { id: "python", label: "Python", monaco: "python", family: "python-like", extensions: ["py", "pyw", "pyi"] },
  { id: "java", label: "Java", monaco: "java", family: "c-like", extensions: ["java"] },
  { id: "kotlin", label: "Kotlin", monaco: "kotlin", family: "c-like", extensions: ["kt", "kts"] },
  { id: "csharp", label: "C#", monaco: "csharp", family: "c-like", extensions: ["cs"] },
  { id: "go", label: "Go", monaco: "go", family: "c-like", extensions: ["go"] },
  { id: "rust", label: "Rust", monaco: "rust", family: "c-like", extensions: ["rs"] },
  { id: "javascript", label: "JavaScript", monaco: "javascript", family: "c-like", extensions: ["js", "mjs", "cjs", "jsx"] },
  { id: "typescript", label: "TypeScript", monaco: "typescript", family: "c-like", extensions: ["ts", "mts", "cts", "tsx"] },
  { id: "php", label: "PHP", monaco: "php", family: "c-like", extensions: ["php"] },
  { id: "swift", label: "Swift", monaco: "swift", family: "c-like", extensions: ["swift"] },
  { id: "scala", label: "Scala", monaco: "scala", family: "c-like", extensions: ["scala", "sc"] },
  { id: "dart", label: "Dart", monaco: "dart", family: "c-like", extensions: ["dart"] },
  { id: "ruby", label: "Ruby", monaco: "ruby", family: "ruby-like", extensions: ["rb"] },
  { id: "shell", label: "Shell", monaco: "shell", family: "python-like", extensions: ["sh", "bash", "zsh"] },
  { id: "sql", label: "SQL", monaco: "sql", family: "other", extensions: ["sql"] },
  { id: "pascal", label: "Pascal", monaco: "pascal", family: "other", extensions: ["pas", "pp", "dpr"] },
  { id: "lua", label: "Lua", monaco: "lua", family: "ruby-like", extensions: ["lua"] },
  { id: "r", label: "R", monaco: "r", family: "python-like", extensions: ["r"] },
  { id: "perl", label: "Perl", monaco: "perl", family: "python-like", extensions: ["pl", "pm"] },
  { id: "haskell", label: "Haskell", monaco: "plaintext", family: "other", extensions: ["hs"] },
  { id: "matlab", label: "MATLAB", monaco: "plaintext", family: "other", extensions: ["m"] },
  { id: "fortran", label: "Fortran", monaco: "plaintext", family: "other", extensions: ["f", "f90", "f95"] },
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));
const EXT_MAP: Record<string, string> = {};
for (const l of LANGUAGES) for (const e of l.extensions) EXT_MAP[e] = l.id;

export const SUPPORTED_EXTENSIONS = Object.keys(EXT_MAP);

/** Человекочитаемый список расширений для подсказок в UI. */
export const SUPPORTED_EXTENSIONS_HINT =
  ".c .cpp .h .py .java .kt .cs .go .rs .js .ts .php .swift .rb .sql и др.";

export function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plaintext";
}

export function languageInfo(language: string): LanguageInfo | null {
  return BY_ID.get(language) ?? null;
}

export function languageLabel(language: string): string {
  if (language === "mixed") return "Смешанный";
  return BY_ID.get(language)?.label ?? language;
}

export function languageFamily(language: string): LanguageInfo["family"] | "unknown" {
  return BY_ID.get(language)?.family ?? "unknown";
}

export function isAnalyzableFile(path: string): boolean {
  if (!path) return false;
  const normalized = path.replace(/\\/g, "/");
  if (normalized.endsWith("/")) return false;
  if (
    /(^|\/)(node_modules|\.git|__pycache__|venv|\.venv|build|dist|target|out|vendor|\.idea|\.vscode|cmake-build[^/]*)\//i.test(
      normalized,
    )
  ) {
    return false;
  }
  if (/(^|\/)__MACOSX\//.test(normalized)) return false;
  if (/\.(min|bundle|d)\.(js|ts)$/i.test(normalized)) return false;
  return detectLanguage(normalized) !== "plaintext";
}

/** Обобщённый язык всей заявки. */
export function aggregateLanguage(languages: string[]): string {
  const unique = Array.from(new Set(languages.filter((l) => l !== "plaintext")));
  if (unique.length === 0) return "plaintext";
  if (unique.length === 1) return unique[0];
  if (unique.every((l) => l === "c" || l === "cpp")) return "cpp";
  if (unique.every((l) => l === "javascript" || l === "typescript")) return "typescript";
  return "mixed";
}

/** Идентификатор языка для Monaco Editor. */
export function monacoLanguage(language: string): string {
  return BY_ID.get(language)?.monaco ?? "plaintext";
}
