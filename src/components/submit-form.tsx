"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { AnalysisProgress } from "@/components/analysis-progress";
import { isAnalyzableFile } from "@/lib/languages";
import { saveReview } from "@/lib/review-cache";
import type { ReviewContentData } from "@/components/review/review-content";

type Mode = "paste" | "archive" | "repo";
type AIProvider = "auto" | "gigachat" | "yandexgpt" | "gemini" | "heuristic";

interface PendingFile {
  path: string;
  content: string;
}

const SAMPLE = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Поиск дубликатов: наивная реализация */
int has_duplicates(int *data, int n) {
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (data[i] == data[j]) {
                return 1;
            }
        }
    }
    return 0;
}

int main(void) {
    int *buffer = malloc(1000 * sizeof(int));
    char name[16];
    gets(name);

    for (int i = 0; i < 1000; i++) {
        buffer[i] = rand() % 5000;
    }

    printf("%d\\n", has_duplicates(buffer, 1000));
    return 0;
}
`;

const TABS: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "paste", label: "Вставить код", hint: "Быстрая проверка одного файла" },
  { id: "archive", label: "Архив .zip", hint: "Проект целиком, до 25 файлов" },
  { id: "repo", label: "GitHub-репозиторий", hint: "Публичная ссылка на репозиторий" },
];

const AI_PROVIDERS: Array<{ id: AIProvider; label: string; hint: string }> = [
  { id: "auto", label: "Авто из env", hint: "Сначала GigaChat, затем YandexGPT, затем Gemini" },
  { id: "gigachat", label: "Сбер GigaChat", hint: "Разовый Authorization key или client_id:client_secret" },
  { id: "yandexgpt", label: "YandexGPT", hint: "API-ключ Yandex Cloud + Folder ID" },
  { id: "gemini", label: "Gemini", hint: "Оставлен как зарубежный fallback" },
  { id: "heuristic", label: "Без ИИ", hint: "Только локальный статический анализ" },
];

const AI_MODELS: Record<AIProvider, string[]> = {
  auto: ["auto"],
  gigachat: ["GigaChat", "GigaChat-Pro", "GigaChat-Max", "GigaChat-2", "GigaChat-2-Pro", "GigaChat-2-Max"],
  yandexgpt: ["yandexgpt", "yandexgpt-lite", "yandexgpt-pro"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  heuristic: ["heuristic-engine"],
};

export function SubmitForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [cohort, setCohort] = useState("");
  const [code, setCode] = useState(SAMPLE);
  const [fileName, setFileName] = useState("main.c");
  const [repoUrl, setRepoUrl] = useState("");
  const [archiveFiles, setArchiveFiles] = useState<PendingFile[]>([]);
  const [aiProvider, setAiProvider] = useState<AIProvider>("auto");
  const [aiModel, setAiModel] = useState("auto");
  const [customAIModel, setCustomAIModel] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [yandexFolderId, setYandexFolderId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleZip(file: File) {
    setError(null);
    try {
      const zip = await JSZip.loadAsync(file);
      const collected: PendingFile[] = [];
      const entries = Object.values(zip.files).filter((e) => !e.dir && isAnalyzableFile(e.name));
      for (const entry of entries.slice(0, 25)) {
        const content = await entry.async("string");
        if (content.trim()) collected.push({ path: entry.name, content: content.slice(0, 120_000) });
      }
      if (collected.length === 0) {
        setError("В архиве нет файлов .c/.cpp/.h/.hpp/.py");
        return;
      }
      setArchiveFiles(collected);
      if (!title) setTitle(file.name.replace(/\.zip$/i, ""));
    } catch {
      setError("Не удалось прочитать архив. Убедитесь, что это корректный .zip");
    }
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title,
        author,
        cohort,
        sourceKind: mode,
        aiConfig: {
          provider: aiProvider,
          model: aiModel === "custom" ? customAIModel : aiModel,
          apiKey: aiKey,
          folderId: yandexFolderId,
        },
      };
      if (mode === "repo") {
        payload.repoUrl = repoUrl;
      } else if (mode === "archive") {
        payload.files = archiveFiles;
      } else {
        payload.files = [{ path: fileName || "main.c", content: code }];
      }

      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let data: { publicId?: string; error?: string; review?: ReviewContentData } = {};
      try {
        data = text ? (JSON.parse(text) as typeof data) : {};
      } catch {
        data = { error: text.slice(0, 300) || `HTTP ${response.status}` };
      }
      // Заявка создана, даже если анализ упал (500 + publicId): ведём на
      // страницу ревью, где показан статус failed, а не «ошибка/404».
      // На деплое без DATABASE_URL серверная БД эфемерна, поэтому результат
      // кладём в sessionStorage — страница покажет его как фолбэк.
      if (data.publicId) {
        if (data.review) saveReview(data.review);
        router.push(`/review/${data.publicId}`);
        router.refresh();
        return;
      }
      throw new Error(data.error ?? "Не удалось выполнить анализ");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Непредвиденная ошибка");
      setBusy(false);
    }
  }

  const sourceReady =
    (mode === "paste" && code.trim().length > 10) ||
    (mode === "archive" && archiveFiles.length > 0) ||
    (mode === "repo" && /github\.com\//i.test(repoUrl));
  const selectedModel = aiModel === "custom" ? customAIModel.trim() : aiModel;
  const aiReady =
    aiProvider === "auto" ||
    aiProvider === "heuristic" ||
    (aiProvider === "yandexgpt"
      ? Boolean(aiKey.trim() && (yandexFolderId.trim() || selectedModel.startsWith("gpt://")))
      : Boolean(aiKey.trim()));
  const canSubmit = !busy && sourceReady && aiReady;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      <div className="glass rounded-2xl p-6">
        {/* Табы источника */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-ink-900/50 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm transition-colors ${
                mode === tab.id
                  ? "bg-gradient-to-r from-ray-300 to-ray-400 text-ink-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{TABS.find((t) => t.id === mode)?.hint}</p>

        {/* Метаданные */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Field label="Название работы" value={title} onChange={setTitle} placeholder="Лабораторная №4" />
          <Field label="Автор" value={author} onChange={setAuthor} placeholder="Иванов И." />
          <Field label="Группа / трек" value={cohort} onChange={setCohort} placeholder="БПИ-231" />
        </div>

        {/* Российская нейросеть для конкретного запуска */}
        <div className="mt-6 rounded-2xl border border-ray-400/20 bg-ray-400/[0.04] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Нейросеть для ревью</h3>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
                Можно не настраивать переменные окружения: выберите модель и вставьте ключ только для этого запуска.
                Ключ не сохраняется в базе и не попадает в отчёт.
              </p>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
              GigaChat / YandexGPT
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-slate-500">Провайдер</span>
              <select
                value={aiProvider}
                onChange={(e) => {
                  const provider = e.target.value as AIProvider;
                  setAiProvider(provider);
                  setAiModel(AI_MODELS[provider][0] ?? "auto");
                  setCustomAIModel("");
                }}
                className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3.5 py-2.5 text-sm text-slate-200 focus:border-ray-400/50 focus:outline-none"
              >
                {AI_PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-[11px] text-slate-500">
                {AI_PROVIDERS.find((p) => p.id === aiProvider)?.hint}
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-slate-500">Модель</span>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                disabled={aiProvider === "auto" || aiProvider === "heuristic"}
                className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3.5 py-2.5 text-sm text-slate-200 disabled:opacity-60 focus:border-ray-400/50 focus:outline-none"
              >
                {AI_MODELS[aiProvider].map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                {aiProvider !== "auto" && aiProvider !== "heuristic" && <option value="custom">Другая модель…</option>}
              </select>
            </label>
          </div>

          {aiModel === "custom" && aiProvider !== "auto" && aiProvider !== "heuristic" && (
            <div className="mt-3">
              <Field
                label="Название модели / полный modelUri"
                value={customAIModel}
                onChange={setCustomAIModel}
                placeholder={aiProvider === "yandexgpt" ? "yandexgpt или gpt://folder/yandexgpt/latest" : "GigaChat-Pro"}
              />
            </div>
          )}

          {aiProvider !== "auto" && aiProvider !== "heuristic" && (
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_0.7fr]">
              <SecretField
                label={aiProvider === "gigachat" ? "Ключ GigaChat" : aiProvider === "yandexgpt" ? "API-ключ Yandex Cloud" : "API-ключ"}
                value={aiKey}
                onChange={setAiKey}
                placeholder={aiProvider === "gigachat" ? "Authorization key или client_id:client_secret" : "AQVN..."}
              />
              {aiProvider === "yandexgpt" ? (
                <Field
                  label="Folder ID"
                  value={yandexFolderId}
                  onChange={setYandexFolderId}
                  placeholder="b1g..."
                />
              ) : (
                <div className="rounded-xl border border-white/10 bg-ink-950/40 p-3 text-xs leading-relaxed text-slate-500">
                  Для GigaChat достаточно ключа авторизации из кабинета Сбера; также принимается пара
                  <span className="font-mono text-slate-300"> client_id:client_secret</span>.
                </div>
              )}
            </div>
          )}

          {!aiReady && (
            <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              Заполните ключ{aiProvider === "yandexgpt" ? " и Folder ID" : ""}, чтобы запустить ревью выбранной моделью.
            </p>
          )}
        </div>

        {/* Источник: мгновенное переключение без AnimatePresence mode="wait"
            (он ждал exit-анимацию и табы «залипали») */}
        <div className="mt-6">
          <div key={mode} className="animate-page-in">
              {mode === "paste" && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Field label="Имя файла" value={fileName} onChange={setFileName} placeholder="main.c" compact />
                    <button
                      onClick={() => setCode(SAMPLE)}
                      className="mt-5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-ray-200"
                    >
                      Загрузить демо-код
                    </button>
                  </div>
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    spellCheck={false}
                    rows={18}
                    className="w-full resize-y rounded-xl border border-white/10 bg-ink-950/70 p-4 font-mono text-[13px] leading-relaxed text-slate-200 focus:border-ray-400/50 focus:outline-none"
                  />
                </div>
              )}

              {mode === "archive" && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleZip(file);
                  }}
                  onClick={() => inputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
                    dragging ? "border-ray-400/70 bg-ray-400/5" : "border-white/12 hover:border-ray-400/40"
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleZip(file);
                    }}
                  />
                  <div className="text-3xl">🗂</div>
                  <p className="mt-3 text-sm text-slate-300">Перетащите .zip с проектом или нажмите для выбора</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Извлекаются только .c .h .cpp .hpp .py — служебные каталоги игнорируются
                  </p>

                  {archiveFiles.length > 0 && (
                    <div className="mt-6 w-full rounded-lg border border-white/10 bg-ink-950/60 p-3 text-left">
                      <p className="mb-2 text-xs text-ray-300">Готово к отправке: {archiveFiles.length} файл(ов)</p>
                      <ul className="max-h-36 space-y-1 overflow-auto font-mono text-[11px] text-slate-400">
                        {archiveFiles.map((f) => (
                          <li key={f.path} className="truncate">
                            {f.path}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {mode === "repo" && (
                <div>
                  <Field
                    label="Ссылка на публичный репозиторий"
                    value={repoUrl}
                    onChange={setRepoUrl}
                    placeholder="https://github.com/user/project"
                  />
                  <p className="mt-3 text-xs text-slate-500">
                    Загружается до 25 файлов исходного кода из ветки по умолчанию. Для приватных репозиториев
                    задайте переменную окружения GITHUB_TOKEN.
                  </p>
                </div>
              )}
            </div>
        </div>

        {error && (
          <p
            role="alert"
            className="animate-page-in mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-ray-400 to-violet-ray px-6 py-3.5 text-sm font-semibold text-ink-950 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
        >
          {busy ? "Анализируем…" : "Запустить ревью"}
        </button>
      </div>

      <div className="space-y-4">
        {busy ? (
          <div key="progress" className="animate-page-in">
            <AnalysisProgress />
          </div>
        ) : (
          <div key="info" className="glass animate-page-in rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-100">Что произойдёт дальше</h3>
              <ol className="mt-4 space-y-3 text-sm text-slate-400">
                {[
                  "Файлы сохраняются в PostgreSQL и передаются раннеру.",
                  "Docker-песочница компилирует код и собирает метрики.",
                  "Выбранная нейросеть получает пронумерованный код и отчёт песочницы.",
                  "Замечания привязываются к строкам и открываются в Monaco Editor.",
                ].map((text, i) => (
                  <li key={text} className="flex gap-3">
                    <span className="font-mono text-xs text-ray-400/80">0{i + 1}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 rounded-xl border border-white/10 bg-ink-950/50 p-4">
                <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Лимиты</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  <li>• до 25 файлов и 400 000 символов на заявку</li>
                  <li>• таймаут ревью — до 60 секунд на Vercel Hobby</li>
                  <li>• поддерживаются C, C++ (17/20) и Python 3</li>
                </ul>
              </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  compact,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <label className={compact ? "block w-52" : "block"}>
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-ray-400/50 focus:outline-none"
      />
    </label>
  );
}

function SecretField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-ray-400/50 focus:outline-none"
      />
    </label>
  );
}
