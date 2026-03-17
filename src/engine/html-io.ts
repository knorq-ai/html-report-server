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
import type { ReportDocument } from "./types.js";

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
  const content = htmlShell(doc.title, jsonComment + "\n" + bodyHtml);

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
function htmlShell(title: string, body: string): string {
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
:root {
  --fg: #1f2328;
  --bg: #ffffff;
  --muted: #656d76;
  --border: #d1d9e0;
  --code-bg: #f6f8fa;
  --accent: #0969da;
  --success: #1a7f37;
  --warning: #9a6700;
  --danger: #d1242f;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #e6edf3;
    --bg: #0d1117;
    --muted: #8b949e;
    --border: #30363d;
    --code-bg: #161b22;
    --accent: #4493f8;
    --success: #3fb950;
    --warning: #d29922;
    --danger: #f85149;
  }
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
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
