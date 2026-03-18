/**
 * HTML file I/O — read/write HTML files with embedded JSON metadata.
 *
 * The report JSON DSL is embedded as an HTML comment at the top of the
 * generated HTML file:  <!-- REPORT_JSON: {...} -->
 * This enables round-tripping: render → read → edit → re-render.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { ErrorCode, EngineError } from "./errors.js";
import type { ReportDocument, ThemeMode } from "./types.js";

const JSON_COMMENT_PREFIX = "<!-- REPORT_JSON: ";
const JSON_COMMENT_SUFFIX = " -->";

/**
 * Write rendered HTML to a file, embedding the source JSON as a comment.
 *
 * @param filePath - Absolute path for the output HTML file.
 * @param bodyHtml - The rendered body HTML.
 * @param doc - The source report document (embedded for re-editing).
 */
export async function writeHtmlFile(
  filePath: string,
  bodyHtml: string,
  doc: ReportDocument,
): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.access(dir);
  } catch {
    throw new EngineError(
      ErrorCode.FILE_WRITE_ERROR,
      `Directory does not exist: ${dir}`,
    );
  }

  const jsonComment = embedJsonComment(doc);
  const content = htmlShell(doc.title, jsonComment + "\n" + bodyHtml, doc.theme);

  try {
    await fs.writeFile(filePath, content, "utf-8");
  } catch (e: unknown) {
    throw new EngineError(
      ErrorCode.FILE_WRITE_ERROR,
      `Failed to write file: ${(e as Error).message}`,
    );
  }
}

/**
 * Wrap body content in a complete HTML document with CSS variable definitions.
 *
 * Provides light/dark theme support via prefers-color-scheme and
 * defines all CSS variables that component renderers depend on.
 */
// ---------------------------------------------------------------------------
// CSS variable definitions for light and dark themes
// ---------------------------------------------------------------------------

const LIGHT_VARS = `
  --fg: #1f2328;
  --bg: #ffffff;
  --bg-subtle: #eef2f7;
  --muted: #656d76;
  --border: #d1d9e0;
  --code-bg: #f6f8fa;
  --accent: #0969da;
  --accent-light: #dbeafe;
  --success: #1a7f37;
  --success-light: #dcfce7;
  --warning: #9a6700;
  --warning-light: #fef3c7;
  --danger: #d1242f;
  --danger-light: #fee2e2;
  --info: #0891b2;
  --info-light: #ecfeff;
  --purple: #6f42c1;
  --purple-light: #ede9fe;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 30px rgba(0,0,0,0.12);`;

const DARK_VARS = `
  --fg: #e6edf3;
  --bg: #0d1117;
  --bg-subtle: #0b0f19;
  --muted: #8b949e;
  --border: #30363d;
  --code-bg: #161b22;
  --accent: #4493f8;
  --accent-light: #1e3a5f;
  --success: #3fb950;
  --success-light: #14332a;
  --warning: #d29922;
  --warning-light: #332b14;
  --danger: #f85149;
  --danger-light: #331414;
  --info: #22d3ee;
  --info-light: #164e63;
  --purple: #a78bfa;
  --purple-light: #2d2150;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
  --shadow-lg: 0 8px 30px rgba(0,0,0,0.4);`;

function buildThemeCss(theme?: ThemeMode): string {
  if (theme === "light") {
    // Force light — no media query
    return `:root {${LIGHT_VARS}\n}`;
  }
  if (theme === "dark") {
    // Force dark — no media query
    return `:root {${DARK_VARS}\n}`;
  }
  // Auto (default) — light base + dark media query
  return `:root {${LIGHT_VARS}\n}\n@media (prefers-color-scheme: dark) {\n  :root {${DARK_VARS}\n  }\n}`;
}

function htmlShell(title: string, body: string, theme?: ThemeMode): string {
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const colorScheme = theme === "light" ? "light" : theme === "dark" ? "dark" : "light dark";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
${buildThemeCss(theme)}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg-subtle); -webkit-font-smoothing: antialiased; color-scheme: ${colorScheme}; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Read a report's JSON source from an HTML file.
 *
 * @returns The parsed ReportDocument, or null if the file has no embedded JSON.
 */
export async function readJsonFromHtml(
  filePath: string,
): Promise<ReportDocument | null> {
  const content = await readFileContent(filePath);
  return extractJsonComment(content);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new EngineError(ErrorCode.FILE_NOT_FOUND, `File not found: ${filePath}`);
    }
    throw new EngineError(
      ErrorCode.FILE_READ_ERROR,
      `Failed to read file: ${err.message}`,
    );
  }
}

function embedJsonComment(doc: ReportDocument): string {
  // Minified JSON to minimize file size.
  // Escape "-->" to prevent premature HTML comment termination.
  const json = JSON.stringify(doc).replace(/-->/g, "--\\u003e");
  return JSON_COMMENT_PREFIX + json + JSON_COMMENT_SUFFIX;
}

export function extractJsonComment(
  htmlContent: string,
): ReportDocument | null {
  const start = htmlContent.indexOf(JSON_COMMENT_PREFIX);
  if (start === -1) return null;

  const jsonStart = start + JSON_COMMENT_PREFIX.length;
  const end = htmlContent.indexOf(JSON_COMMENT_SUFFIX, jsonStart);
  if (end === -1) return null;

  const jsonStr = htmlContent.slice(jsonStart, end);
  try {
    return JSON.parse(jsonStr) as ReportDocument;
  } catch {
    return null;
  }
}
