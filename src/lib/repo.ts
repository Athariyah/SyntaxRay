/**
 * Импорт публичного GitHub-репозитория через REST API.
 * Токен (опционально) — GITHUB_TOKEN, повышает лимит запросов.
 */
import { detectLanguage, isAnalyzableFile } from "@/lib/languages";
import type { SourceFile } from "@/lib/types";

const MAX_FILES = 25;
const MAX_FILE_BYTES = 120_000;

interface GitTreeEntry {
  path: string;
  type: string;
  size?: number;
}

export function parseRepoUrl(url: string): { owner: string; repo: string; ref?: string } | null {
  const match = /github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/tree\/([^/\s#?]+))?/i.exec(url.trim());
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, ""), ref: match[3] };
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export async function fetchRepoFiles(url: string): Promise<SourceFile[]> {
  const parsed = parseRepoUrl(url);
  if (!parsed) throw new Error("Некорректная ссылка на GitHub-репозиторий");
  const { owner, repo } = parsed;

  let ref = parsed.ref;
  if (!ref) {
    const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!metaRes.ok) throw new Error(`Репозиторий недоступен (HTTP ${metaRes.status})`);
    const meta = (await metaRes.json()) as { default_branch?: string };
    ref = meta.default_branch ?? "main";
  }

  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { headers: headers(), cache: "no-store" },
  );
  if (!treeRes.ok) throw new Error(`Не удалось прочитать дерево файлов (HTTP ${treeRes.status})`);
  const tree = (await treeRes.json()) as { tree?: GitTreeEntry[] };

  const candidates = (tree.tree ?? [])
    .filter((e) => e.type === "blob" && isAnalyzableFile(e.path))
    .filter((e) => (e.size ?? 0) <= MAX_FILE_BYTES)
    .slice(0, MAX_FILES);

  if (candidates.length === 0) {
    throw new Error("В репозитории не найдено файлов C/C++/Python для анализа");
  }

  const files = await Promise.all(
    candidates.map(async (entry) => {
      const raw = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${entry.path}`,
        { cache: "no-store" },
      );
      const content = raw.ok ? await raw.text() : "";
      return {
        path: entry.path,
        language: detectLanguage(entry.path),
        content: content.slice(0, MAX_FILE_BYTES),
      } satisfies SourceFile;
    }),
  );

  return files.filter((f) => f.content.trim().length > 0);
}
