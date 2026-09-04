/**
 * СинтексПруф · Детектор ИИ-генерации кода.
 *
 * Детерминированная стилометрия: набор сигналов, характерных для кода,
 * сгенерированного LLM (ChatGPT/Copilot/GigaChat и т.п.), в противовес
 * коду, написанному студентом вручную.
 *
 * Важно: это ВЕРОЯТНОСТНАЯ оценка, а не доказательство. Результат —
 * повод для устной защиты работы, а не автоматический вердикт.
 * Эвристики объясняются каждой строкой отчёта (signals), чтобы
 * преподаватель мог сам проверить основания.
 */
import { languageFamily } from "@/lib/languages";
import type { SourceFile } from "@/lib/types";

export type AIDetectionLevel = "low" | "medium" | "high";

export interface AIDetectionSignal {
  id: string;
  label: string;
  /** Вклад в итоговый балл: >0 — в сторону ИИ, <0 — в сторону «человека». */
  weight: number;
  detail: string;
}

export interface AIDetectionReport {
  /** 0..100 — оценка вероятности того, что код в значительной части сгенерирован ИИ. */
  probability: number;
  level: AIDetectionLevel;
  /** Итоговая оценка по эвристикам (до учёта мнения LLM). */
  heuristicProbability: number;
  /** Мнение ИИ-ревьюера (если было). */
  llmProbability: number | null;
  llmReasoning: string | null;
  signals: AIDetectionSignal[];
  summary: string;
  /** Уточняющие вопросы для устной защиты. */
  questions: string[];
}

interface CommentInfo {
  text: string;
  line: number;
  inline: boolean;
}

/* ───────────────────────── словари ───────────────────────── */

/** Типичные фразы-«штампы» LLM в комментариях. */
const LLM_PHRASES: RegExp[] = [
  /\b(this|the) (function|method|class|script|code) (will|is responsible for|handles|takes|returns|checks|calculates|computes|ensures)\b/i,
  /\b(here'?s|here is) (a|an|the)\b/i,
  /\bexample usage\b/i,
  /\bnote that\b/i,
  /\bmake sure (to|that)\b/i,
  /\bensure (that|the)\b/i,
  /\bhandle (the )?edge cases?\b/i,
  /\bfor (better|improved) (readability|performance|clarity)\b/i,
  /\bas an ai\b/i,
  /\b(step|шаг)\s*\d+[:.]/i,
  /\bhelper function\b/i,
  /\bin a real(-world)? (application|scenario|project)\b/i,
  /\byou (can|may|might|should|would) (also |want to )?\b/i,
  /\bfeel free to\b/i,
  /\bplaceholder\b/i,
  /\breplace (this|with your)\b/i,
  /\byour_?(api_?key|token|password|username)\b/i,
  /\bэта функция (принимает|возвращает|проверяет|вычисляет|отвечает за|обрабатывает)\b/i,
  /\bданн(ая|ый) (функция|метод|класс) (принимает|возвращает|реализует|отвечает)\b/i,
  /\bобратите внимание\b/i,
  /\bубедитесь,? что\b/i,
  /\bпример использования\b/i,
  /\bв реальном (проекте|приложении)\b/i,
  /\bвы можете\b/i,
  /\bзамените (на|это)\b/i,
  /\bобработка (граничных|крайних) случаев\b/i,
  /\bинициализируем\b/i,
  /\bвозвращаем результат\b/i,
  /\bпроверяем,? (что|является|входные)\b/i,
];

/** Признаки «живого» человека: небрежность, отладка, эмоции, опечатки. */
const HUMAN_PHRASES: RegExp[] = [
  /\b(todo|fixme|hack|xxx|wtf|kostyl|костыль|хз|пофиксить|говнокод|почему|не работает|не понимаю|потом|временно)\b/i,
  /\?\?\?|!!!|\)\)\)|\(\(\(/,
  /\b(lol|omg|damn|fuck|shit|блин|бля|черт|чёрт|капец)\b/i,
  /\bне\s+трогать\b|\bdo not touch\b|\bdon'?t touch\b/i,
  /\bдз\b|\bлаба\b|\bлабораторн\w+\b|\bкурсач\b|\bпрепод\b|\bзачет\b|\bзачёт\b|\bэкзамен\b/i,
];

/** Отладочный вывод / мусор, который LLM почти не оставляет. */
const DEBUG_PATTERNS: Record<string, RegExp> = {
  "c-like": /\bprintf\s*\(\s*"(debug|dbg|here|test|1{2,}|asd|aaa|zzz|qwe)|std::cout\s*<<\s*"(debug|here|test|1{2,}|asd|aaa)|console\.log\s*\(\s*["'](debug|here|test|1{2,}|asd|aaa|zzz|qwe)|System\.out\.println\s*\(\s*"(debug|here|test|1{2,}|asd|aaa)|fmt\.Println\s*\(\s*"(debug|here|test|1{2,}|asd)/i,
  "python-like": /\bprint\s*\(\s*["'](debug|dbg|here|test|1{2,}|asd|aaa|zzz|qwe|-{3,}|={3,})/i,
  "ruby-like": /\bputs\s+["'](debug|here|test|1{2,}|asd|aaa)/i,
  other: /(?!)/,
};

/* ───────────────────────── извлечение ───────────────────────── */

function extractComments(file: SourceFile): CommentInfo[] {
  const fam = languageFamily(file.language);
  const out: CommentInfo[] = [];
  const lines = file.content.split("\n");

  if (fam === "c-like") {
    let inBlock = false;
    lines.forEach((raw, i) => {
      let line = raw;
      if (inBlock) {
        const end = line.indexOf("*/");
        if (end >= 0) {
          out.push({ text: line.slice(0, end).replace(/^\s*\*\s?/, ""), line: i + 1, inline: false });
          inBlock = false;
          line = line.slice(end + 2);
        } else {
          out.push({ text: line.replace(/^\s*\*\s?/, ""), line: i + 1, inline: false });
          return;
        }
      }
      // убрать строковые литералы, чтобы не ловить // внутри "http://"
      const noStr = line.replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
      const bs = noStr.indexOf("/*");
      const ls = noStr.indexOf("//");
      if (bs >= 0 && (ls < 0 || bs < ls)) {
        const end = noStr.indexOf("*/", bs + 2);
        if (end >= 0) {
          out.push({ text: noStr.slice(bs + 2, end), line: i + 1, inline: noStr.slice(0, bs).trim().length > 0 });
        } else {
          out.push({ text: noStr.slice(bs + 2), line: i + 1, inline: noStr.slice(0, bs).trim().length > 0 });
          inBlock = true;
        }
      } else if (ls >= 0) {
        out.push({ text: noStr.slice(ls + 2), line: i + 1, inline: noStr.slice(0, ls).trim().length > 0 });
      }
    });
    return out;
  }

  if (fam === "python-like" || fam === "ruby-like") {
    let inDoc: string | null = null;
    lines.forEach((raw, i) => {
      const t = raw.trim();
      if (inDoc) {
        const end = t.indexOf(inDoc);
        out.push({ text: end >= 0 ? t.slice(0, end) : t, line: i + 1, inline: false });
        if (end >= 0) inDoc = null;
        return;
      }
      const doc = /^[rRbBuU]{0,2}("""|''')/.exec(t);
      if (doc) {
        const q = doc[1];
        const rest = t.slice(doc[0].length);
        const end = rest.indexOf(q);
        out.push({ text: end >= 0 ? rest.slice(0, end) : rest, line: i + 1, inline: false });
        if (end < 0) inDoc = q;
        return;
      }
      const noStr = raw.replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
      const hs = noStr.indexOf("#");
      if (hs >= 0 && !/^#!/.test(noStr)) {
        out.push({ text: noStr.slice(hs + 1), line: i + 1, inline: noStr.slice(0, hs).trim().length > 0 });
      }
    });
    return out;
  }

  // Прочие языки: `--`, `%`, `!`
  lines.forEach((raw, i) => {
    const m = /(--|%|!)\s?(.*)$/.exec(raw);
    if (m && raw.trim().startsWith(m[1])) out.push({ text: m[2], line: i + 1, inline: false });
  });
  return out;
}

interface FunctionInfo {
  name: string;
  line: number;
  hasDoc: boolean;
  hasTypeHints: boolean;
}

function extractFunctions(file: SourceFile): FunctionInfo[] {
  const fam = languageFamily(file.language);
  const lines = file.content.split("\n");
  const fns: FunctionInfo[] = [];

  if (file.language === "python") {
    lines.forEach((raw, i) => {
      const m = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(->\s*[^:]+)?:/.exec(raw);
      if (!m) return;
      // docstring: следующая непустая строка начинается с """ или '''
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      const hasDoc = j < lines.length && /^\s*[rRuU]?("""|''')/.test(lines[j]);
      const params = m[2].replace(/\bself\b|\bcls\b/g, "").trim();
      const hasTypeHints = Boolean(m[3]) || (params.length > 0 && /:\s*\w/.test(params));
      fns.push({ name: m[1], line: i + 1, hasDoc, hasTypeHints });
    });
    return fns;
  }

  if (fam === "c-like") {
    const sig =
      /^\s*(?:(?:public|private|protected|static|final|virtual|inline|override|async|export|default|func|fn|fun|def|function|pub(?:\([^)]*\))?)\s+)*(?:[\w<>\[\],.:*&?\s]+?\s+)?\**([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\([^;{}]*\)\s*(?:const|throws\s+[\w.,\s]+|->\s*[\w<>\[\]&*:]+|:\s*[\w<>\[\]|?]+|async|where\s+[^{]+)?\s*\{?\s*$/;
    lines.forEach((raw, i) => {
      const t = raw.trim();
      if (!t || /^(if|for|while|switch|return|else|catch|do|foreach|when|match|new|throw|sizeof|typedef)\b/.test(t)) return;
      if (/^[}{]/.test(t) || /;\s*$/.test(t)) return;
      const m = sig.exec(raw);
      if (!m) return;
      // Проверяем, что дальше идёт `{` (на этой или следующей строке).
      const next = lines[i + 1]?.trim() ?? "";
      if (!t.endsWith("{") && !next.startsWith("{")) return;
      // Документация: предыдущие непустые строки — /** ... */, /// или # comment
      let j = i - 1;
      while (j >= 0 && !lines[j].trim()) j -= 1;
      const prev = j >= 0 ? lines[j].trim() : "";
      const hasDoc = /^(\*\/|\*|\/\/\/|\/\*\*|\/\/|@\w+|#\[)/.test(prev) || /^\s*"""/.test(prev);
      fns.push({ name: m[1], line: i + 1, hasDoc, hasTypeHints: true });
    });
  }
  return fns;
}

/* ───────────────────────── метрики ───────────────────────── */

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function isCodeLine(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && !/^(\/\/|#|\*|\/\*|--|%|!)/.test(t);
}

/** Определение «ПрописнойБуквыВНачале» и точки в конце комментария. */
function isPolishedComment(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  const startsCapital = /^[A-ZА-ЯЁ]/.test(t);
  const endsPunct = /[.!?:]$/.test(t);
  return startsCapital && endsPunct;
}

function looksLikeCommentedOutCode(text: string, language: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  const fam = languageFamily(language);
  if (fam === "c-like") return /[;{}]\s*$|^\s*(if|for|while|return|int|const|let|var|printf|cout|std::)\b/.test(t) && /[=();{}]/.test(t);
  return /^(print|if|for|while|return|def|import|self\.|\w+\s*=\s*\w)/.test(t) && /[()=:\[\]]/.test(t);
}

/* ───────────────────────── основной детектор ───────────────────────── */

export function detectAIGeneratedCode(files: SourceFile[]): AIDetectionReport {
  const signals: AIDetectionSignal[] = [];
  const add = (id: string, label: string, weight: number, detail: string) => {
    if (weight !== 0) signals.push({ id, label, weight: Number(weight.toFixed(1)), detail });
  };

  const sourceFiles = files.filter((f) => f.language !== "plaintext" && f.content.trim().length > 0);
  const allLines = sourceFiles.flatMap((f) => f.content.split("\n"));
  const codeLines = allLines.filter(isCodeLine);
  const totalCode = codeLines.length;

  if (totalCode < 15) {
    return {
      probability: 0,
      level: "low",
      heuristicProbability: 0,
      llmProbability: null,
      llmReasoning: null,
      signals: [],
      summary: "Слишком мало кода для стилометрической оценки (менее 15 значимых строк).",
      questions: [],
    };
  }

  const comments = sourceFiles.flatMap(extractComments);
  const functions = sourceFiles.flatMap(extractFunctions);
  const fullText = sourceFiles.map((f) => f.content).join("\n");
  const commentTexts = comments.map((c) => c.text.trim()).filter((t) => t.length > 0);

  /* 1. Штампы LLM в комментариях/строках */
  const phraseHits: string[] = [];
  const scanTargets = [...commentTexts, ...(fullText.match(/"(?:[^"\\\n]|\\.){12,}"/g) ?? [])];
  for (const t of scanTargets) {
    for (const re of LLM_PHRASES) {
      if (re.test(t)) {
        phraseHits.push(t.slice(0, 80));
        break;
      }
    }
  }
  if (phraseHits.length > 0) {
    const w = Math.min(28, 7 + phraseHits.length * 4);
    add(
      "llm-phrases",
      "Речевые штампы LLM в комментариях",
      w,
      `${phraseHits.length} совпад.: «${phraseHits.slice(0, 3).join("», «")}»`,
    );
  }

  /* 2. Признаки «человека» */
  const humanHits: string[] = [];
  for (const t of commentTexts) {
    for (const re of HUMAN_PHRASES) {
      if (re.test(t)) {
        humanHits.push(t.slice(0, 60));
        break;
      }
    }
  }
  if (humanHits.length > 0) {
    add(
      "human-markers",
      "Неформальные/эмоциональные комментарии",
      -Math.min(22, 6 + humanHits.length * 4),
      `${humanHits.length} совпад.: «${humanHits.slice(0, 3).join("», «")}»`,
    );
  }

  /* 3. Отладочный вывод */
  let debugHits = 0;
  for (const f of sourceFiles) {
    const fam = languageFamily(f.language);
    const re = DEBUG_PATTERNS[fam === "unknown" ? "other" : fam];
    debugHits += (f.content.match(new RegExp(re.source, "gi")) ?? []).length;
  }
  if (debugHits > 0) {
    add("debug-prints", "Остатки отладочного вывода", -Math.min(14, 4 + debugHits * 3), `${debugHits} шт. — типично для ручной отладки`);
  }

  /* 4. Закомментированный код */
  const commentedOut = comments.filter((c) => looksLikeCommentedOutCode(c.text, sourceFiles[0]?.language ?? "c")).length;
  if (commentedOut >= 2) {
    add("commented-code", "Закомментированные фрагменты кода", -Math.min(12, 3 + commentedOut * 2), `${commentedOut} строк — след экспериментов автора`);
  }

  /* 5. Плотность и «отполированность» комментариев */
  const commentRatio = comments.length / Math.max(1, totalCode);
  const polished = commentTexts.filter(isPolishedComment).length;
  const polishedShare = commentTexts.length >= 4 ? polished / commentTexts.length : 0;
  if (commentTexts.length >= 5 && commentRatio > 0.28 && polishedShare > 0.6) {
    add(
      "polished-comments",
      "Избыточные «учебниковые» комментарии",
      Math.min(20, Math.round(commentRatio * 30 + polishedShare * 10)),
      `комментариев ${(commentRatio * 100).toFixed(0)}% от строк кода, ${(polishedShare * 100).toFixed(0)}% — с заглавной буквы и точкой`,
    );
  } else if (commentTexts.length >= 4 && polishedShare > 0.85) {
    add("polished-comments", "Идеально оформленные комментарии", 8, `${(polishedShare * 100).toFixed(0)}% комментариев — законченные предложения`);
  } else if (totalCode > 80 && commentRatio < 0.02) {
    add("no-comments", "Почти нет комментариев", -4, "LLM обычно щедро комментирует; полное отсутствие — скорее ручной код");
  }

  /* 6. Комментарий-пересказ перед каждой строкой */
  const narrated = comments.filter((c, i, arr) => {
    if (c.inline) return false;
    const next = arr[i + 1];
    return !next || next.line !== c.line + 1;
  }).length;
  if (comments.length >= 8 && narrated / Math.max(1, totalCode) > 0.2) {
    add("line-narration", "Комментарий-«пересказ» почти к каждой строке", 12, `${narrated} комментариев-строк на ${totalCode} строк кода`);
  }

  /* 7. Docstring у каждой функции */
  if (functions.length >= 3) {
    const docShare = functions.filter((f) => f.hasDoc).length / functions.length;
    if (docShare === 1) add("all-docstrings", "Документация у 100% функций", 12, `${functions.length} функций — все с docstring/doc-комментарием`);
    else if (docShare >= 0.8) add("all-docstrings", "Документация почти у всех функций", 6, `${Math.round(docShare * 100)}% функций`);
    else if (docShare === 0 && functions.length >= 4) add("no-docstrings", "Ни одна функция не документирована", -5, `${functions.length} функций без docstring`);
  }

  /* 8. Python: полные type hints + main-guard + typing-импорты */
  const py = sourceFiles.filter((f) => f.language === "python");
  if (py.length > 0) {
    const pyFns = functions.filter((f) => py.some((p) => p.content.includes(`def ${f.name}(`)));
    if (pyFns.length >= 3) {
      const typed = pyFns.filter((f) => f.hasTypeHints).length / pyFns.length;
      if (typed >= 0.9) add("py-type-hints", "Аннотации типов у всех функций", 9, `${Math.round(typed * 100)}% функций типизированы — редкость в учебных работах`);
    }
    const pyText = py.map((p) => p.content).join("\n");
    const mainGuard = /if\s+__name__\s*==\s*["']__main__["']\s*:/.test(pyText);
    const mainFn = /def\s+main\s*\(/.test(pyText);
    if (mainGuard && mainFn) add("py-main-guard", "Шаблон def main() + __main__-guard", 5, "стандартная структура, которую LLM выдаёт по умолчанию");
    if (/from\s+typing\s+import|from\s+dataclasses\s+import|from\s+__future__\s+import\s+annotations/.test(pyText)) {
      add("py-typing", "Импорты typing/dataclasses/__future__", 4, "продвинутая типизация нечасто встречается в студенческом коде");
    }
    if (/\blogging\.(getLogger|basicConfig)/.test(pyText) && totalCode < 300) {
      add("py-logging", "logging в небольшом скрипте", 4, "LLM предпочитает logging вместо print");
    }
  }

  /* 9. Единообразие: длины строк и идентификаторов */
  const lens = codeLines.map((l) => l.length);
  const lenStd = stddev(lens);
  const overLimit = lens.filter((l) => l > 100).length / lens.length;
  if (totalCode >= 40 && lenStd < 14 && overLimit === 0) {
    add("uniform-lines", "Подозрительно ровные длины строк", 6, `σ длины = ${lenStd.toFixed(1)}, ни одной строки >100 символов`);
  } else if (overLimit > 0.08) {
    add("long-lines", "Много длинных строк", -4, `${(overLimit * 100).toFixed(0)}% строк длиннее 100 символов`);
  }

  const identifiers = Array.from(
    new Set((fullText.match(/\b[a-z_][a-z0-9_]{0,40}\b/gi) ?? []).filter((w) => w.length > 1 && !/^(if|for|int|the|and|not|def|let|var|const|return|else|while|true|false|null|none|self|this|new|char|void|std|import|from|class|public|private|static|string|include)$/i.test(w))),
  );
  const shortIds = identifiers.filter((w) => /^[a-z]{1,2}\d*$/i.test(w) && !/^(i|j|k|n|x|y)$/.test(w)).length;
  const descriptive = identifiers.filter((w) => w.length >= 8 && /_|[a-z][A-Z]/.test(w)).length;
  if (identifiers.length >= 20) {
    const descShare = descriptive / identifiers.length;
    const shortShare = shortIds / identifiers.length;
    if (descShare > 0.45 && shortShare < 0.05) add("descriptive-names", "Сплошь длинные описательные имена", 8, `${(descShare * 100).toFixed(0)}% идентификаторов ≥8 символов в snake/camelCase, почти нет сокращений`);
    else if (shortShare > 0.2) add("short-names", "Много коротких/сокращённых имён", -6, `${(shortShare * 100).toFixed(0)}% идентификаторов вида a1, tmp, cnt`);
  }

  /* 10. Транслит и смешение языков в именах — очень «человеческий» признак */
  const translit = identifiers.filter((w) =>
    /^(massiv|chislo|stroka|schet|schetchik|summa|kol|kolvo|kolichestvo|otvet|vvod|vivod|proverka|rezultat|dlina|tochka|spisok|slovo|bukva|element|funkciya|peremennaya|znachenie|max_?el|min_?el)\w*$/i.test(w),
  ).length;
  if (translit > 0) add("translit-names", "Транслит в идентификаторах", -Math.min(14, 5 + translit * 3), `${translit} имён вида «massiv», «schetchik» — типично для ручного студенческого кода`);

  /* 11. Пробелы в конце строк, смешанные отступы, табы+пробелы */
  const trailing = allLines.filter((l) => /[ \t]+$/.test(l) && l.trim().length > 0).length;
  const mixedIndent = allLines.some((l) => /^\t/.test(l)) && allLines.some((l) => /^ {2,}/.test(l));
  if (trailing / Math.max(1, allLines.length) > 0.03) add("trailing-ws", "Пробелы в конце строк", -5, `${trailing} строк — редакторы LLM-ассистентов их не оставляют`);
  if (mixedIndent) add("mixed-indent", "Смешанные табы и пробелы", -6, "LLM выдаёт единообразные отступы");
  if (totalCode >= 60 && trailing === 0 && !mixedIndent && lenStd < 20) {
    add("pristine-format", "Безупречное форматирование", 5, "нет ни одного «мусорного» пробела при значительном объёме кода");
  }

  /* 12. Обработка ошибок «по учебнику» */
  const tryCount = (fullText.match(/\btry\s*[:{]/g) ?? []).length;
  const genericErr = (fullText.match(/(An|Unexpected|Произошла) (unexpected )?(error|ошибка) (occurred|при)|Error:\s*\{e\}|f"[^"]*Error[^"]*\{e\}|"Invalid input"|"Некорректный ввод"|raise ValueError\(\s*f?"/gi) ?? []).length;
  if (tryCount >= 2 && genericErr >= 2) add("textbook-errors", "Шаблонная обработка ошибок", 7, `${tryCount} try-блоков, ${genericErr} типовых сообщений вида «An error occurred: {e}»`);

  /* 13. Разделители-секции и эмодзи */
  const banners = (fullText.match(/^\s*(#|\/\/)\s*[-=─═]{3,}\s*.+?[-=─═]{3,}\s*$|^\s*(#|\/\/)\s*(={5,}|-{5,})\s*$/gm) ?? []).length;
  const emoji = (fullText.match(/[\u{1F300}-\u{1FAFF}\u{2705}\u{274C}\u{2728}\u{26A0}]/gu) ?? []).length;
  if (banners >= 3) add("section-banners", "Баннеры-разделители секций", 5, `${banners} блоков вида «# ===== Section =====»`);
  if (emoji >= 2) add("emoji", "Эмодзи в коде/выводе", 6, `${emoji} символов — характерный стиль современных LLM-ассистентов`);

  /* 14. Английские комментарии в работе с русскими строками (или наоборот) */
  const cyrComments = commentTexts.filter((t) => /[а-яё]/i.test(t)).length;
  const latComments = commentTexts.filter((t) => /^[^а-яё]*$/i.test(t) && /[a-z]{4,}/i.test(t)).length;
  const cyrStrings = (fullText.match(/["'][^"'\n]*[а-яё][^"'\n]*["']/gi) ?? []).length;
  if (commentTexts.length >= 5 && latComments / commentTexts.length > 0.8 && cyrStrings >= 3) {
    add("lang-mismatch", "Английские комментарии при русском интерфейсе", 6, `${latComments} англ. комментариев, ${cyrStrings} русских строк вывода`);
  }
  if (commentTexts.length >= 5 && cyrComments > 0 && latComments > 0 && Math.min(cyrComments, latComments) / commentTexts.length > 0.25) {
    add("lang-mix", "Смешение языков комментариев", -4, `${cyrComments} рус. и ${latComments} англ. — частая примета ручной сборки из разных источников`);
  }

  /* ───────── итог ───────── */
  const raw = signals.reduce((s, x) => s + x.weight, 0);
  // Базовая точка — 25%: априорно код студента чаще ручной, но мы не знаем.
  const heuristicProbability = Math.max(2, Math.min(98, Math.round(25 + raw)));

  const level = levelFor(heuristicProbability);
  const summary = summarize(heuristicProbability, signals);
  const questions = buildQuestions(signals, functions);

  return {
    probability: heuristicProbability,
    level,
    heuristicProbability,
    llmProbability: null,
    llmReasoning: null,
    signals: signals.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    summary,
    questions,
  };
}

export function levelFor(p: number): AIDetectionLevel {
  if (p >= 65) return "high";
  if (p >= 40) return "medium";
  return "low";
}

function summarize(p: number, signals: AIDetectionSignal[]): string {
  const pro = signals.filter((s) => s.weight > 0).length;
  const con = signals.filter((s) => s.weight < 0).length;
  if (p >= 65) {
    return `Высокая вероятность ИИ-генерации (${p}%): ${pro} признак(ов) машинного стиля против ${con} человеческих. Рекомендуется устная защита с вопросами по деталям реализации.`;
  }
  if (p >= 40) {
    return `Смешанная картина (${p}%): вероятно, ИИ использовался как ассистент — часть кода сгенерирована, часть дописана вручную. Стоит уточнить у автора, какие инструменты применялись.`;
  }
  return `Признаков машинной генерации мало (${p}%): стиль соответствует ручной студенческой работе${con > 0 ? ` (${con} человеческих маркеров)` : ""}.`;
}

function buildQuestions(signals: AIDetectionSignal[], functions: FunctionInfo[]): string[] {
  const ids = new Set(signals.filter((s) => s.weight > 0).map((s) => s.id));
  const q: string[] = [];
  if (ids.size === 0) return q;
  const fnNames = functions.map((f) => f.name).filter((n) => !/^(main|__init__|init|setup|run)$/i.test(n));
  if (fnNames.length > 0) q.push(`Объясните без кода, что делает функция ${fnNames[Math.floor(fnNames.length / 2)]}() и почему выбран именно такой алгоритм.`);
  if (ids.has("py-type-hints") || ids.has("py-typing")) q.push("Зачем в работе аннотации типов и что произойдёт, если передать значение другого типа?");
  if (ids.has("textbook-errors")) q.push("Какие конкретно исключения перехватывает try/except и в каких входных данных они возникают?");
  if (ids.has("polished-comments") || ids.has("line-narration")) q.push("Какие комментарии вы бы удалили как лишние — и почему они оказались в коде?");
  if (ids.has("all-docstrings")) q.push("Поменяйте сигнатуру любой функции на лету: какой docstring и вызовы потребуют правки?");
  q.push("Какую часть работы вы писали с помощью ИИ-ассистента и как проверяли его вывод?");
  return q.slice(0, 5);
}

/** Слияние эвристики с мнением LLM-ревьюера: 60% эвристика / 40% модель. */
export function mergeWithLLMOpinion(
  base: AIDetectionReport,
  llm: { probability: number; reasoning: string } | null | undefined,
): AIDetectionReport {
  if (!llm || !Number.isFinite(llm.probability)) return base;
  const llmP = Math.max(0, Math.min(100, Math.round(llm.probability)));
  const probability = Math.round(base.heuristicProbability * 0.6 + llmP * 0.4);
  const merged: AIDetectionReport = {
    ...base,
    probability,
    level: levelFor(probability),
    llmProbability: llmP,
    llmReasoning: llm.reasoning?.slice(0, 600) || null,
  };
  merged.summary = summarize(probability, base.signals) + ` Оценка ИИ-ревьюера — ${llmP}%.`;
  return merged;
}
