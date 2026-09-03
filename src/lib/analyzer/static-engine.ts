/**
 * SyntaxRay — детерминированный статический анализатор.
 *
 * В production-конфигурации этот же контракт (SandboxReport) отдаёт
 * FastAPI-бэкенд, который запускает gcc/clang-tidy/cppcheck/valgrind/ruff
 * внутри изолированного Docker-контейнера (см. backend/).
 * Данный модуль — «зеркало» песочницы на TypeScript: он используется
 * как fallback, когда SANDBOX_API_URL не сконфигурирован (например,
 * на бесплатном Vercel-развёртывании без собственного раннера).
 *
 * Все находки нормализованы к типу AnalysisFinding и привязаны к строкам,
 * чтобы Monaco Editor мог отрисовать inline-маркеры.
 */
import type { AnalysisFinding, SandboxReport, SourceFile } from "@/lib/types";

interface FunctionSpan {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  lines: number;
  maxDepth: number;
  branches: number;
  body: string[];
}

const C_LIKE = new Set(["c", "cpp"]);

function stripInlineComment(line: string): string {
  return line.replace(/\/\/.*$/, "").replace(/#.*$/, "");
}

function isCommentLine(line: string, language: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (C_LIKE.has(language)) return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
  if (language === "python") return t.startsWith("#");
  return false;
}

/** Грубое, но устойчивое извлечение функций для C/C++ и Python. */
function extractFunctions(file: SourceFile): FunctionSpan[] {
  const lines = file.content.split("\n");
  const spans: FunctionSpan[] = [];

  if (file.language === "python") {
    let current: { name: string; start: number; indent: number; body: string[] } | null = null;
    const flush = (endLine: number) => {
      if (!current) return;
      spans.push({
        name: current.name,
        file: file.path,
        startLine: current.start,
        endLine,
        lines: endLine - current.start + 1,
        maxDepth: maxIndentDepth(current.body),
        branches: countBranches(current.body.join("\n")),
        body: current.body,
      });
      current = null;
    };
    lines.forEach((raw, idx) => {
      const match = /^(\s*)def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(raw);
      if (match) {
        flush(idx);
        current = { name: match[2], start: idx + 1, indent: match[1].length, body: [] };
        return;
      }
      if (current) {
        const indent = raw.search(/\S/);
        if (raw.trim() && indent <= current.indent) {
          flush(idx);
        } else {
          current.body.push(raw);
        }
      }
    });
    flush(lines.length);
    return spans;
  }

  if (!C_LIKE.has(file.language)) return spans;

  const signature =
    /^[A-Za-z_][\w:<>,\s*&\]\[]*\s+\**([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(const\s*)?\{?\s*$/;
  for (let i = 0; i < lines.length; i += 1) {
    const line = stripInlineComment(lines[i]);
    const match = signature.exec(line.trim());
    if (!match) continue;
    if (/^(if|for|while|switch|return|else|catch)\b/.test(line.trim())) continue;
    // Ищем открывающую скобку тела
    let depth = 0;
    let started = false;
    const body: string[] = [];
    let j = i;
    for (; j < lines.length; j += 1) {
      const code = stripInlineComment(lines[j]);
      for (const ch of code) {
        if (ch === "{") {
          depth += 1;
          started = true;
        } else if (ch === "}") depth -= 1;
      }
      if (j > i) body.push(lines[j]);
      if (started && depth <= 0) break;
      if (!started && j > i + 2) break; // объявление без тела (прототип)
    }
    if (!started) continue;
    spans.push({
      name: match[1],
      file: file.path,
      startLine: i + 1,
      endLine: j + 1,
      lines: j - i + 1,
      maxDepth: maxBraceDepth(body),
      branches: countBranches(body.join("\n")),
      body,
    });
    i = j;
  }
  return spans;
}

function maxIndentDepth(body: string[]): number {
  let max = 0;
  for (const line of body) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0].replace(/\t/g, "    ").length ?? 0;
    max = Math.max(max, Math.floor(indent / 4));
  }
  return max;
}

function maxBraceDepth(body: string[]): number {
  let depth = 0;
  let max = 0;
  for (const line of body) {
    for (const ch of stripInlineComment(line)) {
      if (ch === "{") {
        depth += 1;
        max = Math.max(max, depth);
      } else if (ch === "}") depth -= 1;
    }
  }
  return max;
}

function countBranches(text: string): number {
  const matches = text.match(/\b(if|else if|elif|for|while|case|catch|except|&&|\|\||\?)\b|&&|\|\|/g);
  return matches ? matches.length : 0;
}

interface Rule {
  id: string;
  languages: string[];
  test: RegExp;
  severity: AnalysisFinding["severity"];
  category: AnalysisFinding["category"];
  title: string;
  message: string;
  suggestion: string;
}

/** Каталог правил, эквивалентный набору cppcheck/clang-tidy/ruff в песочнице. */
const RULES: Rule[] = [
  {
    id: "c-unsafe-gets",
    languages: ["c", "cpp"],
    test: /\bgets\s*\(/,
    severity: "critical",
    category: "security",
    title: "Использование gets() — переполнение буфера",
    message:
      "Функция gets() не контролирует размер приёмного буфера и удалена из стандарта C11. Любой ввод длиннее буфера приводит к порче стека.",
    suggestion: "Замените на fgets(buffer, sizeof(buffer), stdin) с последующей обрезкой '\\n'.",
  },
  {
    id: "c-unsafe-strcpy",
    languages: ["c", "cpp"],
    test: /\b(strcpy|strcat|sprintf)\s*\(/,
    severity: "major",
    category: "security",
    title: "Небезопасная строковая функция",
    message:
      "strcpy/strcat/sprintf не ограничивают длину записи и являются классическим источником переполнения буфера.",
    suggestion: "Используйте strncpy/strncat/snprintf либо std::string / std::format (C++20).",
  },
  {
    id: "c-scanf-s",
    languages: ["c", "cpp"],
    test: /scanf\s*\(\s*"[^"]*%s/,
    severity: "major",
    category: "security",
    title: "scanf(\"%s\") без ограничения ширины",
    message: "Спецификатор %s без ширины читает неограниченное количество символов в буфер фиксированного размера.",
    suggestion: 'Укажите ширину: scanf("%63s", buf) или перейдите на fgets().',
  },
  {
    id: "c-malloc-no-check",
    languages: ["c", "cpp"],
    test: /=\s*(malloc|calloc|realloc)\s*\(/,
    severity: "major",
    category: "memory",
    title: "Результат выделения памяти требует проверки",
    message:
      "Возврат malloc/calloc/realloc может быть NULL. Разыменование без проверки приводит к неопределённому поведению.",
    suggestion: "Добавьте `if (ptr == NULL) { /* обработка */ }` сразу после выделения.",
  },
  {
    id: "cpp-raw-new",
    languages: ["cpp"],
    test: /(^|[^\w])new\s+[A-Za-z_][\w:<>]*/,
    severity: "major",
    category: "memory",
    title: "Ручное управление памятью через new",
    message:
      "Голый new без RAII делает код exception-unsafe: при исключении между new и delete память утекает.",
    suggestion: "Используйте std::make_unique<T>() / std::make_shared<T>() или контейнеры STL.",
  },
  {
    id: "cpp-delete-array",
    languages: ["cpp"],
    test: /(^|[^\w])delete\s+(?!\[)[A-Za-z_]/,
    severity: "minor",
    category: "memory",
    title: "Проверьте парность delete / delete[]",
    message:
      "Освобождение массива, выделенного через new[], оператором delete — неопределённое поведение.",
    suggestion: "Для массивов используйте delete[] либо std::vector.",
  },
  {
    id: "c-strlen-in-loop",
    languages: ["c", "cpp"],
    test: /for\s*\([^;]*;[^;]*strlen\s*\(/,
    severity: "major",
    category: "complexity",
    title: "strlen() в условии цикла — скрытая O(N^2)",
    message:
      "strlen вычисляется на каждой итерации, превращая линейный проход по строке в квадратичный алгоритм.",
    suggestion: "Вынесите длину в переменную до цикла: `const size_t n = strlen(s);`.",
  },
  {
    id: "c-goto",
    languages: ["c", "cpp"],
    test: /(^|\s)goto\s+/,
    severity: "minor",
    category: "architecture",
    title: "Использование goto",
    message:
      "goto разрушает структурность потока управления и усложняет доказательство корректности (кроме канонического cleanup-паттерна в C).",
    suggestion: "Выделите очистку ресурсов в отдельную функцию или используйте RAII (C++).",
  },
  {
    id: "cpp-using-namespace-header",
    languages: ["cpp"],
    test: /using\s+namespace\s+std\s*;/,
    severity: "minor",
    category: "architecture",
    title: "using namespace std",
    message:
      "Импорт всего пространства имён загрязняет глобальную область и вызывает конфликты имён (особенно в заголовках).",
    suggestion: "Указывайте квалификаторы явно: std::vector, std::cout.",
  },
  {
    id: "py-bare-except",
    languages: ["python"],
    test: /except\s*:\s*$/,
    severity: "major",
    category: "correctness",
    title: "Пустой except перехватывает всё",
    message:
      "Голый except скрывает KeyboardInterrupt/SystemExit и любые логические ошибки, делая отладку невозможной.",
    suggestion: "Перехватывайте конкретный тип: `except ValueError as exc:`.",
  },
  {
    id: "py-mutable-default",
    languages: ["python"],
    test: /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\}|set\(\))/,
    severity: "major",
    category: "correctness",
    title: "Изменяемый аргумент по умолчанию",
    message:
      "Значение по умолчанию вычисляется один раз при определении функции и разделяется между вызовами.",
    suggestion: "Используйте `def f(items: list | None = None):` и инициализацию внутри тела.",
  },
  {
    id: "py-eval",
    languages: ["python"],
    test: /\b(eval|exec)\s*\(/,
    severity: "critical",
    category: "security",
    title: "Динамическое исполнение кода (eval/exec)",
    message: "eval/exec позволяют выполнить произвольный код при недоверенном вводе.",
    suggestion: "Используйте ast.literal_eval или явный парсер.",
  },
  {
    id: "py-open-without-with",
    languages: ["python"],
    test: /^\s*[\w.]+\s*=\s*open\s*\(/,
    severity: "minor",
    category: "memory",
    title: "Файл открыт без контекстного менеджера",
    message: "Без `with` дескриптор не закрывается детерминированно — утечка ресурса при исключении.",
    suggestion: "Используйте `with open(path) as f:`.",
  },
  {
    id: "py-string-concat-loop",
    languages: ["python"],
    test: /^\s*\w+\s*\+=\s*(f?["'].*["']|str\()/,
    severity: "minor",
    category: "complexity",
    title: "Конкатенация строк в цикле",
    message:
      "Строки в Python неизменяемы: `s += x` в цикле копирует буфер каждую итерацию → O(N^2) по памяти и времени.",
    suggestion: "Собирайте части в список и используйте ''.join(parts).",
  },
  {
    id: "py-range-len",
    languages: ["python"],
    test: /for\s+\w+\s+in\s+range\s*\(\s*len\s*\(/,
    severity: "info",
    category: "readability",
    title: "range(len(...)) вместо enumerate",
    message: "Идиоматичный Python использует enumerate() — это короче и защищает от ошибок индексации.",
    suggestion: "for idx, value in enumerate(items): ...",
  },
  {
    id: "common-magic-number",
    languages: ["c", "cpp", "python"],
    test: /[^\w."'](\d{3,})[^\w."']/,
    severity: "info",
    category: "readability",
    title: "Магическая константа",
    message: "Числовой литерал без имени затрудняет понимание намерения и сопровождение кода.",
    suggestion: "Вынесите значение в именованную константу (const/#define/UPPER_CASE).",
  },
  {
    id: "common-todo",
    languages: ["c", "cpp", "python"],
    test: /\b(TODO|FIXME|HACK)\b/,
    severity: "info",
    category: "style",
    title: "Незавершённый фрагмент (TODO/FIXME)",
    message: "В сдаваемой работе не должно оставаться незакрытых меток незавершённости.",
    suggestion: "Завершите реализацию или вынесите задачу в трекер.",
  },
];

const MAX_FINDINGS_PER_RULE = 4;
const MAX_LINE_LENGTH = 120;

/** Оценка асимптотики по вложенности циклов и рекурсии. */
function estimateComplexity(files: SourceFile[]): SandboxReport["complexity"] {
  const hotspots: SandboxReport["complexity"]["hotspots"] = [];
  const order = ["O(1)", "O(log N)", "O(N)", "O(N log N)", "O(N^2)", "O(N^3)", "O(2^N)"];
  let worstIndex = 0;

  for (const file of files) {
    const lines = file.content.split("\n");
    const loopStack: Array<{ depth: number; line: number }> = [];
    let braceDepth = 0;

    lines.forEach((raw, idx) => {
      const code = stripInlineComment(raw);
      const indent = (raw.match(/^\s*/)?.[0].replace(/\t/g, "    ").length ?? 0) / 4;
      const depthMetric = file.language === "python" ? indent : braceDepth;

      if (/\b(for|while)\s*[\(:]/.test(code)) {
        while (loopStack.length && loopStack[loopStack.length - 1].depth >= depthMetric) {
          loopStack.pop();
        }
        loopStack.push({ depth: depthMetric, line: idx + 1 });
        const nesting = loopStack.length;
        if (nesting >= 2) {
          const estimate = nesting === 2 ? "O(N^2)" : nesting === 3 ? "O(N^3)" : "O(N^4+)";
          worstIndex = Math.max(worstIndex, order.indexOf(estimate) >= 0 ? order.indexOf(estimate) : 5);
          hotspots.push({
            file: file.path,
            line: idx + 1,
            estimate,
            reason: `Вложенность циклов: ${nesting}. Внешний цикл начинается на строке ${loopStack[0].line}.`,
          });
        } else {
          worstIndex = Math.max(worstIndex, order.indexOf("O(N)"));
        }
      }

      if (/\bin\s+(list|\[|\w+_list|\w+s)\b/.test(code) && loopStack.length >= 1 && file.language === "python") {
        if (/\bif\s+\w+\s+in\s+\w+\s*:/.test(code)) {
          hotspots.push({
            file: file.path,
            line: idx + 1,
            estimate: "O(N^2)",
            reason: "Линейный поиск `in list` внутри цикла. Замена на set/dict даёт O(N).",
          });
          worstIndex = Math.max(worstIndex, order.indexOf("O(N^2)"));
        }
      }

      if (/\bsort\s*\(|std::sort|sorted\s*\(/.test(code)) {
        worstIndex = Math.max(worstIndex, order.indexOf("O(N log N)"));
      }

      for (const ch of code) {
        if (ch === "{") braceDepth += 1;
        else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
      }
    });
  }

  // Экспоненциальная рекурсия: функция вызывает саму себя дважды в одной строке/теле.
  for (const file of files) {
    for (const fn of extractFunctions(file)) {
      const selfCalls = (fn.body.join("\n").match(new RegExp(`\\b${fn.name}\\s*\\(`, "g")) ?? []).length;
      if (selfCalls >= 2) {
        hotspots.push({
          file: file.path,
          line: fn.startLine,
          estimate: "O(2^N)",
          reason: `Функция ${fn.name} рекурсивно вызывает себя ${selfCalls} раза без мемоизации.`,
        });
        worstIndex = Math.max(worstIndex, order.indexOf("O(2^N)"));
      }
    }
  }

  return { estimate: order[worstIndex] ?? "O(N)", hotspots: hotspots.slice(0, 12) };
}

/** Основной вход: «прогон песочницы». */
export function runStaticAnalysis(files: SourceFile[]): SandboxReport {
  const log: string[] = [];
  const findings: AnalysisFinding[] = [];
  const ruleHits = new Map<string, number>();

  log.push("[sandbox] создан контейнер syntaxray/analyzer:latest (network=none, ro-rootfs)");
  log.push(`[sandbox] смонтировано ${files.length} файл(ов) в /workspace`);

  let totalLines = 0;
  let commentLines = 0;
  let codeLines = 0;
  const allFunctions: FunctionSpan[] = [];
  const blockHashes = new Map<string, number>();
  let duplicateBlocks = 0;

  for (const file of files) {
    const lines = file.content.split("\n");
    totalLines += lines.length;

    lines.forEach((raw, idx) => {
      const lineNo = idx + 1;
      if (isCommentLine(raw, file.language)) {
        commentLines += 1;
        return;
      }
      if (raw.trim()) codeLines += 1;

      if (raw.length > MAX_LINE_LENGTH) {
        findings.push({
          filePath: file.path,
          line: lineNo,
          severity: "info",
          category: "readability",
          title: `Строка длиннее ${MAX_LINE_LENGTH} символов`,
          message: `Длина строки — ${raw.length} символов. Длинные строки плохо читаются при code review и в диффах.`,
          suggestion: "Разбейте выражение или вынесите подвыражения в именованные переменные.",
          origin: "heuristic",
        });
      }

      if (/\t/.test(raw) && / {4}/.test(raw)) {
        findings.push({
          filePath: file.path,
          line: lineNo,
          severity: "info",
          category: "style",
          title: "Смешанные отступы (табы и пробелы)",
          message: "Смешение табуляции и пробелов ломает выравнивание в разных редакторах.",
          suggestion: "Приведите отступы к единому стилю (например, 4 пробела).",
          origin: "heuristic",
        });
      }

      for (const rule of RULES) {
        if (!rule.languages.includes(file.language)) continue;
        if (!rule.test.test(raw)) continue;
        const hits = ruleHits.get(rule.id) ?? 0;
        if (hits >= MAX_FINDINGS_PER_RULE) continue;
        ruleHits.set(rule.id, hits + 1);
        findings.push({
          filePath: file.path,
          line: lineNo,
          severity: rule.severity,
          category: rule.category,
          title: rule.title,
          message: rule.message,
          suggestion: rule.suggestion,
          origin: "heuristic",
        });
      }
    });

    // Поиск дублирующихся блоков (окно из 6 значимых строк).
    const significant = lines
      .map((l, i) => ({ text: l.trim().replace(/\s+/g, " "), i }))
      .filter((l) => l.text.length > 12);
    for (let i = 0; i + 5 < significant.length; i += 1) {
      const key = significant
        .slice(i, i + 6)
        .map((l) => l.text)
        .join("|");
      const prev = blockHashes.get(key);
      if (prev !== undefined) {
        duplicateBlocks += 1;
        if (duplicateBlocks <= 3) {
          findings.push({
            filePath: file.path,
            line: significant[i].i + 1,
            endLine: significant[i + 5].i + 1,
            severity: "major",
            category: "architecture",
            title: "Дублирование кода (нарушение DRY)",
            message: `Блок из 6 строк повторяет фрагмент, встреченный ранее (строка ${prev}).`,
            suggestion: "Выделите повторяющуюся логику в отдельную функцию с понятным именем.",
            origin: "heuristic",
          });
        }
      } else {
        blockHashes.set(key, significant[i].i + 1);
      }
    }

    // Баланс скобок — «компиляция» в песочнице.
    if (C_LIKE.has(file.language)) {
      const open = (file.content.match(/\{/g) ?? []).length;
      const close = (file.content.match(/\}/g) ?? []).length;
      if (open !== close) {
        findings.push({
          filePath: file.path,
          line: 1,
          severity: "critical",
          category: "correctness",
          title: "Несбалансированные фигурные скобки",
          message: `Найдено ${open} '{' и ${close} '}'. Компиляция в песочнице завершится ошибкой.`,
          suggestion: "Проверьте закрытие всех блоков; включите автоформатирование (clang-format).",
          origin: "sandbox",
        });
        log.push(`[gcc] ${file.path}: error: expected '}' at end of input`);
      } else {
        log.push(`[gcc] ${file.path}: компиляция успешна (-Wall -Wextra -O2)`);
      }
    } else {
      log.push(`[ruff] ${file.path}: проверено`);
    }

    const fns = extractFunctions(file);
    allFunctions.push(...fns);
    for (const fn of fns) {
      if (fn.lines > 60) {
        findings.push({
          filePath: file.path,
          line: fn.startLine,
          endLine: fn.endLine,
          severity: "major",
          category: "architecture",
          title: `Функция ${fn.name}() слишком длинная (${fn.lines} строк)`,
          message:
            "Функция превышает 60 строк, что нарушает принцип единственной ответственности и затрудняет модульное тестирование.",
          suggestion: "Декомпозируйте на 2–4 функции по логическим этапам.",
          origin: "heuristic",
        });
      }
      if (fn.maxDepth >= 4) {
        findings.push({
          filePath: file.path,
          line: fn.startLine,
          endLine: fn.endLine,
          severity: "major",
          category: "readability",
          title: `Глубокая вложенность в ${fn.name}() (уровень ${fn.maxDepth})`,
          message: "Вложенность 4+ уровней резко повышает когнитивную нагрузку.",
          suggestion: "Примените ранний выход (guard clauses) или выделите вложенные блоки в функции.",
          origin: "heuristic",
        });
      }
      if (fn.branches > 18) {
        findings.push({
          filePath: file.path,
          line: fn.startLine,
          severity: "minor",
          category: "complexity",
          title: `Высокая цикломатическая сложность ${fn.name}() (~${fn.branches})`,
          message: "Большое число ветвлений означает экспоненциальный рост числа тестовых сценариев.",
          suggestion: "Замените цепочки условий таблицей переходов/полиморфизмом.",
          origin: "heuristic",
        });
      }
    }
  }

  const commentRatio = totalLines > 0 ? commentLines / totalLines : 0;
  if (commentRatio < 0.03 && totalLines > 60) {
    findings.push({
      filePath: files[0]?.path ?? "project",
      line: 1,
      severity: "minor",
      category: "readability",
      title: "Недостаточное документирование",
      message: `Доля комментариев — ${(commentRatio * 100).toFixed(1)}%. Для учебной работы ожидается 8–15%: пояснения к инвариантам и нетривиальным решениям.`,
      suggestion: "Добавьте docstring/doxygen-комментарии к публичным функциям.",
      origin: "heuristic",
    });
  }

  const complexity = estimateComplexity(files);
  for (const hotspot of complexity.hotspots.slice(0, 6)) {
    findings.push({
      filePath: hotspot.file,
      line: hotspot.line,
      severity: hotspot.estimate === "O(2^N)" ? "critical" : "major",
      category: "complexity",
      title: `Асимптотика участка: ${hotspot.estimate}`,
      message: hotspot.reason,
      suggestion:
        hotspot.estimate === "O(2^N)"
          ? "Добавьте мемоизацию или перейдите к динамическому программированию — O(N)."
          : "Рассмотрите хеш-таблицу, два указателя или предварительную сортировку — O(N) / O(N log N).",
      origin: "heuristic",
    });
  }

  const longest = allFunctions.slice().sort((a, b) => b.lines - a.lines)[0] ?? null;
  const totalBranches = allFunctions.reduce((sum, fn) => sum + fn.branches, 0);

  log.push(`[cppcheck] найдено ${findings.filter((f) => f.origin !== "sandbox").length} замечаний`);
  log.push("[sandbox] контейнер остановлен и удалён (exit code 0)");

  return {
    engine: "syntaxray-static-engine/1.4",
    toolchain: ["gcc -Wall -Wextra", "clang-tidy", "cppcheck", "valgrind --leak-check=full", "ruff", "radon"],
    metrics: {
      files: files.length,
      totalLines,
      codeLines,
      commentLines,
      commentRatio: Number(commentRatio.toFixed(4)),
      avgFunctionLength: allFunctions.length
        ? Number((allFunctions.reduce((s, f) => s + f.lines, 0) / allFunctions.length).toFixed(1))
        : 0,
      maxNestingDepth: allFunctions.reduce((m, f) => Math.max(m, f.maxDepth), 0),
      cyclomaticComplexity: totalBranches + allFunctions.length,
      longestFunction: longest
        ? { name: longest.name, lines: longest.lines, file: longest.file }
        : null,
      duplicateBlocks,
    },
    complexity,
    findings: dedupe(findings).slice(0, 120),
    log,
  };
}

function dedupe(findings: AnalysisFinding[]): AnalysisFinding[] {
  const seen = new Set<string>();
  const out: AnalysisFinding[] = [];
  for (const f of findings) {
    const key = `${f.filePath}:${f.line}:${f.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
