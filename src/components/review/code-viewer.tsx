"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { OnMount } from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
import type { Severity } from "@/lib/types";
import { monacoLanguage } from "@/lib/languages";

/** Monaco грузится только на клиенте — на сервере рендерим skeleton. */
const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div className="space-y-2 p-6">
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="skeleton h-3" style={{ width: `${45 + ((i * 13) % 50)}%` }} />
      ))}
    </div>
  ),
});

export interface EditorMarker {
  id: number;
  line: number;
  endLine: number | null;
  severity: Severity;
  title: string;
  message: string;
  suggestion: string | null;
  origin: string;
}

const SEVERITY_TO_MONACO: Record<Severity, number> = {
  critical: 8, // MarkerSeverity.Error
  major: 4, // Warning
  minor: 2, // Info
  info: 1, // Hint
};

export function CodeViewer({
  path,
  language,
  content,
  markers,
  activeLine,
  onSelectLine,
}: {
  path: string;
  language: string;
  content: string;
  markers: EditorMarker[];
  activeLine: number | null;
  onSelectLine: (line: number) => void;
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const listenerRef = useRef<IDisposable | null>(null);

  const applyAnnotations = () => {
    const monaco = monacoRef.current;
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!monaco || !ed || !model) return;

    // 1. Маркеры проблем — подчёркивание + список в Problems
    monaco.editor.setModelMarkers(
      model,
      "syntaxray",
      markers.map((m) => ({
        startLineNumber: m.line,
        endLineNumber: m.endLine ?? m.line,
        startColumn: 1,
        endColumn: model.getLineMaxColumn(Math.min(m.endLine ?? m.line, model.getLineCount())),
        severity: SEVERITY_TO_MONACO[m.severity],
        message: `${m.title}\n\n${m.message}${m.suggestion ? `\n\n💡 ${m.suggestion}` : ""}`,
        source: m.origin === "gemini" ? "SyntaxRay · Gemini" : "SyntaxRay · Static",
      })),
    );

    // 2. Декорации строк — glyph-полоса и фоновая подсветка
    decorationsRef.current?.clear();
    decorationsRef.current = ed.createDecorationsCollection(
      markers.map((m) => ({
        range: new monaco.Range(m.line, 1, m.endLine ?? m.line, 1),
        options: {
          isWholeLine: true,
          className: `sr-line-${m.severity}`,
          glyphMarginClassName: `sr-glyph-${m.severity}`,
          glyphMarginHoverMessage: { value: `**${m.title}**\n\n${m.message}` },
          overviewRuler: {
            color:
              m.severity === "critical"
                ? "#ff5d7a"
                : m.severity === "major"
                  ? "#ffb454"
                  : m.severity === "minor"
                    ? "#38d3f5"
                    : "#8b7bff",
            position: 4,
          },
        },
      })),
    );
  };

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco as typeof import("monaco-editor");

    monaco.editor.defineTheme("syntaxray-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "5c6b8a", fontStyle: "italic" },
        { token: "keyword", foreground: "8b7bff" },
        { token: "string", foreground: "7ce9ff" },
        { token: "number", foreground: "ffb454" },
        { token: "type", foreground: "38d3f5" },
      ],
      colors: {
        "editor.background": "#080b14",
        "editor.lineHighlightBackground": "#101524",
        "editorLineNumber.foreground": "#33405e",
        "editorLineNumber.activeForeground": "#7ce9ff",
        "editorGutter.background": "#080b14",
        "editorIndentGuide.background1": "#161d2e",
        "editor.selectionBackground": "#1e3350",
      },
    });
    monaco.editor.setTheme("syntaxray-dark");

    listenerRef.current?.dispose();
    listenerRef.current = ed.onDidChangeCursorPosition((e) => onSelectLine(e.position.lineNumber));
    applyAnnotations();
  };

  useEffect(() => {
    applyAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, path, content]);

  useEffect(() => {
    if (activeLine && editorRef.current) {
      editorRef.current.revealLineInCenter(activeLine);
      editorRef.current.setPosition({ lineNumber: activeLine, column: 1 });
      editorRef.current.focus();
    }
  }, [activeLine]);

  useEffect(() => () => listenerRef.current?.dispose(), []);

  return (
    <MonacoEditor
      height="100%"
      path={path}
      language={monacoLanguage(language)}
      value={content}
      onMount={handleMount}
      theme="syntaxray-dark"
      options={{
        readOnly: true,
        domReadOnly: true,
        glyphMargin: true,
        fontSize: 13,
        lineHeight: 21,
        fontFamily: "var(--font-mono)",
        fontLigatures: true,
        minimap: { enabled: true, renderCharacters: false, maxColumn: 70 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: "on",
        renderLineHighlight: "all",
        padding: { top: 16, bottom: 24 },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        overviewRulerBorder: false,
        stickyScroll: { enabled: true },
      }}
    />
  );
}
