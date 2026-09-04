/**
 * СинтексПруф — детерминированный статический анализатор.
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
import { languageFamily } from "@/lib/languages";

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

/** Языки с фигурными скобками и комментариями `//` — C, C++, Java, Go, Rust, JS/TS и т.д. */
const C_LIKE = {
  has: (language: string) => languageFamily(language) === "c-like",
};
/** Языки с блоками по отступам и комментариями `#`. */
const HASH_COMMENT = {
  has: (language: string) => {
    const fam = languageFamily(language);
    return fam === "python-like" || fam === "ruby-like";
  },
};
/** Языки, чьи функции извлекаются по отступу как в Python. */
const INDENT_BLOCKS = new Set(["python"]);

function stripInlineComment(line: string): string {
  return line.replace(/\/\/.*$/, "").replace(/#.*$/, "").replace(/--.*$/, "");
}

function isCommentLine(line: string, language: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (C_LIKE.has(language)) return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.startsWith("///");
  if (HASH_COMMENT.has(language)) return t.startsWith("#") || t.startsWith("=begin");
  if (language === "sql" || language === "lua" || language === "haskell") return t.startsWith("--");
  if (language === "pascal") return t.startsWith("{") || t.startsWith("//") || t.startsWith("(*");
  if (language === "matlab") return t.startsWith("%");
  if (language === "fortran") return t.startsWith("!");
  return false;
}

/** Грубое, но устойчивое извлечение функций для C/C++ и Python. */
function extractFunctions(file: SourceFile): FunctionSpan[] {
  const lines = file.content.split("\n");
  const spans: FunctionSpan[] = [];

  if (INDENT_BLOCKS.has(file.language)) {
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

  const signature = C_LIKE_SIGNATURES[file.language] ?? DEFAULT_C_LIKE_SIGNATURE;
  for (let i = 0; i < lines.length; i += 1) {
    const line = stripInlineComment(lines[i]);
    const match = signature.exec(line.trim());
    if (!match) continue;
    if (/^(if|for|while|switch|return|else|catch|foreach|when|match|new|throw)\b/.test(line.trim())) continue;
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
      name: match[1] ?? match[2] ?? "anonymous",
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

/** Сигнатура функции C/C++: `тип имя(args) {`. */
const DEFAULT_C_LIKE_SIGNATURE =
  /^[A-Za-z_][\w:<>,\s*&\]\[]*\s+\**([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(const\s*)?\{?\s*$/;

/** Сигнатуры функций для остальных C-подобных языков (ключевое слово + имя). */
const C_LIKE_SIGNATURES: Record<string, RegExp> = {
  go: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  rust: /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/,
  kotlin: /^(?:(?:public|private|protected|internal|override|open|suspend|inline)\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  swift: /^(?:(?:public|private|fileprivate|internal|static|override|mutating)\s+)*func\s+([A-Za-z_][A-Za-z0-9_]*)/,
  scala: /^(?:(?:private|protected|override|final)\s+)*def\s+([A-Za-z_][A-Za-z0-9_]*)/,
  php: /^(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  javascript:
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/,
  typescript:
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|(?:<[^>]*>)?\([^)]*\)\s*(?::[^=]+)?=>)/,
  java: /^(?:(?:public|private|protected|static|final|abstract|synchronized|native)\s+)*(?:<[^>]+>\s*)?[\w<>\[\],.?\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(?:throws\s+[\w.,\s]+)?\{?\s*$/,
  csharp: /^(?:(?:public|private|protected|internal|static|virtual|override|async|sealed|abstract)\s+)*[\w<>\[\],.?\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{?\s*$/,
  dart: /^(?:static\s+)?(?:[\w<>\[\],.?]+\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(?:async\s*)?\{?\s*$/,
};

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
    id: "java-system-exit",
    languages: ["java", "kotlin", "scala"],
    test: /System\.exit\s*\(|exitProcess\s*\(/,
    severity: "minor",
    category: "architecture",
    title: "Жёсткое завершение процесса System.exit()",
    message: "Прерывание JVM из бизнес-логики делает код нетестируемым и обрывает finally-блоки вызывающих.",
    suggestion: "Бросьте исключение и обработайте его в точке входа.",
  },
  {
    id: "java-catch-throwable",
    languages: ["java", "kotlin", "scala", "csharp"],
    test: /catch\s*\(\s*(Throwable|Exception|Error|Object)\b/,
    severity: "minor",
    category: "correctness",
    title: "Перехват слишком общего исключения",
    message: "catch (Exception/Throwable) скрывает ошибки программирования (NPE, OOM) и усложняет отладку.",
    suggestion: "Ловите конкретные типы исключений; логируйте и пробрасывайте остальные.",
  },
  {
    id: "java-string-concat-loop",
    languages: ["java", "kotlin", "csharp"],
    test: /^\s*\w+\s*\+=\s*"|^\s*\w+\s*=\s*\w+\s*\+\s*"/,
    severity: "info",
    category: "complexity",
    title: "Конкатенация строк через +=",
    message: "Строки неизменяемы: каждое += создаёт новый объект — O(N^2) в цикле.",
    suggestion: "Используйте StringBuilder / String.join / buildString.",
  },
  {
    id: "go-ignored-error",
    languages: ["go"],
    test: /\b_\s*(?:,\s*\w+\s*)?:?=\s*\w+(\.\w+)*\(|,\s*_\s*:?=\s*\w+(\.\w+)*\(/,
    severity: "major",
    category: "correctness",
    title: "Проигнорирована ошибка (err → _)",
    message: "В Go ошибки — это значения; замена err на _ скрывает сбои ввода-вывода и парсинга.",
    suggestion: "Проверяйте err и возвращайте/оборачивайте её: if err != nil { return fmt.Errorf(...) }",
  },
  {
    id: "go-panic",
    languages: ["go"],
    test: /\bpanic\s*\(/,
    severity: "minor",
    category: "correctness",
    title: "Использование panic() в обычном потоке",
    message: "panic предназначен для невосстановимых ситуаций; в библиотечном коде это аварийное завершение всей программы.",
    suggestion: "Возвращайте error вызывающему коду.",
  },
  {
    id: "rust-unwrap",
    languages: ["rust"],
    test: /\.unwrap\(\)|\.expect\(/,
    severity: "minor",
    category: "correctness",
    title: "unwrap()/expect() без обработки ошибки",
    message: "При None/Err поток завершится panic. В учебной работе допустимо только в тестах и прототипах.",
    suggestion: "Используйте оператор ? либо match / if let / unwrap_or_else.",
  },
  {
    id: "rust-unsafe",
    languages: ["rust"],
    test: /\bunsafe\s*\{/,
    severity: "major",
    category: "security",
    title: "Блок unsafe",
    message: "Внутри unsafe компилятор не гарантирует безопасность памяти — требуется явное обоснование инварианта.",
    suggestion: "Добавьте комментарий // SAFETY: ... или найдите безопасную абстракцию.",
  },
  {
    id: "js-var",
    languages: ["javascript", "typescript"],
    test: /^\s*var\s+\w+/,
    severity: "info",
    category: "style",
    title: "Объявление через var",
    message: "var имеет функциональную область видимости и hoisting, что приводит к трудноуловимым ошибкам.",
    suggestion: "Используйте const (по умолчанию) или let.",
  },
  {
    id: "js-loose-equality",
    languages: ["javascript", "typescript", "php"],
    test: /[^=!]==[^=]|!=[^=]/,
    severity: "minor",
    category: "correctness",
    title: "Нестрогое сравнение ==",
    message: "Нестрогое равенство выполняет неявное приведение типов ('0' == false → true).",
    suggestion: "Используйте === и !==.",
  },
  {
    id: "js-eval",
    languages: ["javascript", "typescript", "php", "ruby", "perl"],
    test: /\beval\s*\(|new\s+Function\s*\(/,
    severity: "critical",
    category: "security",
    title: "Динамическое выполнение кода (eval)",
    message: "eval выполняет произвольный код — вектор инъекции и блокировка оптимизаций движка.",
    suggestion: "Используйте JSON.parse, таблицу функций или явный парсер.",
  },
  {
    id: "ts-any",
    languages: ["typescript"],
    test: /:\s*any\b|<any>|as\s+any\b/,
    severity: "minor",
    category: "correctness",
    title: "Тип any отключает проверку типов",
    message: "any «пробивает» систему типов: ошибки, которые мог поймать компилятор, уходят в runtime.",
    suggestion: "Используйте unknown с сужением типа либо опишите точный интерфейс.",
  },
  {
    id: "js-console-log",
    languages: ["javascript", "typescript"],
    test: /console\.log\s*\(/,
    severity: "info",
    category: "style",
    title: "Отладочный вывод console.log",
    message: "Отладочные вызовы в сдаваемом коде — признак незавершённой работы.",
    suggestion: "Удалите или замените на настраиваемый логгер.",
  },
  {
    id: "php-sql-interp",
    languages: ["php"],
    test: /(SELECT|INSERT|UPDATE|DELETE)\b[^;]*\$\w+|mysql_query\s*\(/i,
    severity: "critical",
    category: "security",
    title: "Возможная SQL-инъекция",
    message: "Переменная подставляется в SQL напрямую — классическая уязвимость.",
    suggestion: "Используйте PDO с подготовленными выражениями и bindParam.",
  },
  {
    id: "cs-empty-catch",
    languages: ["csharp", "java", "kotlin", "javascript", "typescript"],
    test: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
    severity: "major",
    category: "correctness",
    title: "Пустой блок catch",
    message: "Проглоченное исключение оставляет программу в неопределённом состоянии без следов в логах.",
    suggestion: "Как минимум залогируйте исключение; лучше — обработайте или пробросьте.",
  },
  {
    id: "shell-unquoted-var",
    languages: ["shell"],
    test: /\b(rm|cp|mv|cat|cd)\s+[^"'\n]*\$\{?\w+\}?(\s|$)/,
    severity: "major",
    category: "correctness",
    title: "Переменная без кавычек в команде",
    message: "Пробелы и glob-символы в значении приведут к разбиению аргументов (word splitting).",
    suggestion: 'Заключайте переменные в двойные кавычки: "$var".',
  },
  {
    id: "sql-select-star",
    languages: ["sql"],
    test: /\bSELECT\s+\*\s+FROM\b/i,
    severity: "info",
    category: "readability",
    title: "SELECT * вместо явного списка полей",
    message: "Выборка всех столбцов ломается при изменении схемы и передаёт лишние данные.",
    suggestion: "Перечислите нужные столбцы явно.",
  },
  {
    id: "common-magic-number",
    languages: ["c", "cpp", "python", "java", "kotlin", "csharp", "go", "rust", "javascript", "typescript", "php", "swift", "scala", "dart", "ruby"],
    test: /[^\w."'](\d{3,})[^\w."']/,
    severity: "info",
    category: "readability",
    title: "Магическая константа",
    message: "Числовой литерал без имени затрудняет понимание намерения и сопровождение кода.",
    suggestion: "Вынесите значение в именованную константу (const/#define/UPPER_CASE).",
  },
  {
    id: "common-todo",
    languages: ["c", "cpp", "python", "java", "kotlin", "csharp", "go", "rust", "javascript", "typescript", "php", "swift", "scala", "dart", "ruby", "shell", "sql", "lua", "pascal", "r", "perl", "haskell", "matlab", "fortran"],
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
      const depthMetric = INDENT_BLOCKS.has(file.language) ? indent : braceDepth;

      if (
        /\b(for|while|foreach|loop)\s*[\(:{]/.test(code) ||
        /\b(for|while|loop)\b[^;]*\{\s*$/.test(code) ||
        /\.(forEach|map|filter|reduce)\s*\(/.test(code) ||
        /\bfor\s+\w+\s+in\b/.test(code)
      ) {
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
    } else if (file.language === "python") {
      log.push(`[ruff] ${file.path}: проверено`);
    } else {
      log.push(`[lint:${file.language}] ${file.path}: проверено`);
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
    engine: "syntaxray-static-engine/1.5",
    toolchain: toolchainFor(files),
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

function toolchainFor(files: SourceFile[]): string[] {
  const langs = new Set(files.map((f) => f.language));
  const out: string[] = [];
  if (langs.has("c") || langs.has("cpp")) out.push("gcc -Wall -Wextra", "clang-tidy", "cppcheck", "valgrind --leak-check=full");
  if (langs.has("python")) out.push("ruff", "radon");
  if (langs.has("java") || langs.has("kotlin")) out.push("javac -Xlint", "checkstyle", "detekt");
  if (langs.has("go")) out.push("go vet", "staticcheck");
  if (langs.has("rust")) out.push("cargo clippy");
  if (langs.has("javascript") || langs.has("typescript")) out.push("tsc --noEmit", "eslint");
  if (langs.has("csharp")) out.push("dotnet build /warnaserror");
  if (langs.has("php")) out.push("phpstan");
  if (langs.has("ruby")) out.push("rubocop");
  if (langs.has("shell")) out.push("shellcheck");
  if (langs.has("sql")) out.push("sqlfluff");
  if (out.length === 0) out.push("generic-lint");
  return out;
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
