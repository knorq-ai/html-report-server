/**
 * HTML Report Engine — Public API for the MCP server.
 *
 * This is a barrel module that wires together engine sub-modules
 * and exposes the four public functions consumed by index.ts:
 *
 *   renderReport()         — JSON → HTML file
 *   readReport()           — HTML file → JSON structure
 *   editReport()           — Apply patch operations to an existing report
 *   getComponentExamples() — Return DSL examples for each block type
 */

import { withFileLock } from "./engine/file-lock.js";
import { renderDocument, summarizeBlocks } from "./engine/renderer.js";
import { writeHtmlFile, readJsonFromHtml } from "./engine/html-io.js";
import { resolvePreset, PRESET_NAMES } from "./engine/theme.js";
import type {
  ReportDocument,
  EditOp,
  Block,
  StyleName,
} from "./engine/types.js";
import { ErrorCode, EngineError } from "./engine/errors.js";

export { EngineError } from "./engine/errors.js";
export type { ReportDocument, Block, EditOp, StyleName } from "./engine/types.js";

// ---------------------------------------------------------------------------
// render_report
// ---------------------------------------------------------------------------

/**
 * Render a report document to an HTML file.
 *
 * @returns A summary string (block count, style, file path).
 */
export async function renderReport(
  filePath: string,
  doc: ReportDocument,
): Promise<string> {
  validateDocument(doc);

  return withFileLock(filePath, async () => {
    const bodyHtml = renderDocument(doc);
    await writeHtmlFile(filePath, bodyHtml, doc);

    const preset = resolvePreset(doc.style, doc.styleOverrides);
    return [
      `Rendered ${doc.blocks.length} blocks to ${filePath}`,
      `Style: ${preset.name}`,
      `Title: "${doc.title}"`,
      "",
      "Blocks:",
      summarizeBlocks(doc.blocks),
    ].join("\n");
  });
}

// ---------------------------------------------------------------------------
// read_report
// ---------------------------------------------------------------------------

/**
 * Read the JSON structure from an existing HTML report file.
 *
 * @returns A formatted summary with the full JSON for re-editing.
 */
export async function readReport(filePath: string): Promise<string> {
  const doc = await readJsonFromHtml(filePath);
  if (!doc) {
    throw new EngineError(
      ErrorCode.INVALID_DOCUMENT,
      "No embedded report JSON found in this file. " +
        "The file may not have been created by html-report-server, " +
        "or the JSON comment was removed.",
    );
  }

  return [
    `Title: "${doc.title}"`,
    `Style: ${doc.style ?? "mckinsey"}`,
    `Blocks: ${doc.blocks.length}`,
    "",
    "Block summary:",
    summarizeBlocks(doc.blocks),
    "",
    "Full document JSON:",
    JSON.stringify(doc, null, 2),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// edit_report
// ---------------------------------------------------------------------------

/**
 * Apply patch operations to an existing report and re-render.
 *
 * Operations are applied in order. Delete indices are resolved from
 * the original block list (not shifted by prior operations within
 * the same batch). Insert operations shift indices as expected.
 *
 * @returns A summary of changes applied.
 */
export async function editReport(
  filePath: string,
  operations: EditOp[],
): Promise<string> {
  if (operations.length === 0) {
    throw new EngineError(
      ErrorCode.INVALID_PARAMETER,
      "No operations provided.",
    );
  }

  return withFileLock(filePath, async () => {
    const doc = await readJsonFromHtml(filePath);
    if (!doc) {
      throw new EngineError(
        ErrorCode.INVALID_DOCUMENT,
        "No embedded report JSON found. Cannot edit a file not created by html-report-server.",
      );
    }

    const blocks = [...doc.blocks];
    const applied: string[] = [];

    // Sort operations: deletes first (descending index), then replaces, then inserts (ascending)
    // This ensures index stability during batch application.
    const deletes = operations
      .filter((op): op is Extract<EditOp, { op: "delete" }> => op.op === "delete")
      .sort((a, b) => b.index - a.index);
    const replaces = operations.filter(
      (op): op is Extract<EditOp, { op: "replace" }> => op.op === "replace",
    );
    const inserts = operations
      .filter((op): op is Extract<EditOp, { op: "insert" }> => op.op === "insert")
      .sort((a, b) => a.index - b.index);

    // Apply deletes (descending order preserves indices)
    for (const op of deletes) {
      validateIndex(op.index, blocks.length, "delete");
      blocks.splice(op.index, 1);
      applied.push(`Deleted block [${op.index}]`);
    }

    // Apply replaces
    for (const op of replaces) {
      validateIndex(op.index, blocks.length, "replace");
      blocks[op.index] = op.block;
      applied.push(`Replaced block [${op.index}] → ${op.block.type}`);
    }

    // Apply inserts (ascending order, shift offset)
    let insertOffset = 0;
    for (const op of inserts) {
      const idx = op.index + insertOffset;
      if (idx < 0 || idx > blocks.length) {
        throw new EngineError(
          ErrorCode.INDEX_OUT_OF_RANGE,
          `Insert index ${op.index} (adjusted to ${idx}) out of range [0..${blocks.length}]`,
        );
      }
      blocks.splice(idx, 0, op.block);
      insertOffset++;
      applied.push(`Inserted ${op.block.type} at [${op.index}]`);
    }

    // Re-render
    const updatedDoc: ReportDocument = { ...doc, blocks };
    const bodyHtml = renderDocument(updatedDoc);
    await writeHtmlFile(filePath, bodyHtml, updatedDoc);

    return [
      `Applied ${applied.length} operations to ${filePath}`,
      "",
      ...applied,
      "",
      `Result: ${blocks.length} blocks total`,
    ].join("\n");
  });
}

// ---------------------------------------------------------------------------
// get_component_examples
// ---------------------------------------------------------------------------

/**
 * Return example JSON snippets for each block type.
 * No file I/O — this is a reference tool for learning the DSL.
 */
export function getComponentExamples(): string {
  const examples: Record<string, object> = {
    section: { type: "section", title: "Key Metrics" },
    heading: { type: "heading", level: 2, text: "Overview" },
    paragraph: {
      type: "paragraph",
      text: "Revenue grew 15% year-over-year, driven by enterprise adoption.",
    },
    list: {
      type: "list",
      ordered: false,
      items: ["First item", "Second item", "Third item"],
    },
    callout: {
      type: "callout",
      variant: "warning",
      title: "Action Required",
      text: "Customer churn increased to 3.2% this quarter.",
    },
    stat_cards: {
      type: "stat_cards",
      cards: [
        { label: "Revenue", value: "$4.2M", delta: "+15%", trend: "up" },
        { label: "Users", value: "12,847", delta: "+8%", trend: "up" },
        { label: "Churn", value: "3.2%", delta: "+0.5%", trend: "down" },
      ],
    },
    table: {
      type: "table",
      headers: ["Region", "Revenue", "Growth"],
      rows: [
        ["North America", "$2.1M", "+18%"],
        ["EMEA", "$1.4M", "+12%"],
        ["APAC", "$700K", "+9%"],
      ],
      caption: "Q4 2024 Revenue by Region",
    },
    bar_chart: {
      type: "bar_chart",
      title: "Monthly Revenue",
      data: [
        { label: "Jan", value: 320 },
        { label: "Feb", value: 380 },
        { label: "Mar", value: 410 },
        { label: "Apr", value: 450 },
      ],
      unit: "K",
    },
    line_chart: {
      type: "line_chart",
      title: "User Growth",
      series: [
        {
          name: "MAU",
          data: [
            { x: "Q1", y: 8200 },
            { x: "Q2", y: 9400 },
            { x: "Q3", y: 11200 },
            { x: "Q4", y: 12847 },
          ],
        },
      ],
      unit: "users",
    },
    pie_chart: {
      type: "pie_chart",
      title: "Revenue Distribution",
      data: [
        { label: "Enterprise", value: 60 },
        { label: "SMB", value: 25 },
        { label: "Consumer", value: 15 },
      ],
      donut: true,
    },
    progress_bars: {
      type: "progress_bars",
      bars: [
        { label: "Q4 Target", value: 78, max: 100 },
        { label: "NPS Goal", value: 72, max: 80 },
      ],
    },
    timeline: {
      type: "timeline",
      entries: [
        {
          date: "2024-01",
          title: "Product Launch",
          description: "V2.0 released to all customers",
          status: "done",
        },
        {
          date: "2024-03",
          title: "Series B",
          description: "$25M funding round closed",
          status: "done",
        },
        {
          date: "2024-06",
          title: "Enterprise Tier",
          status: "in_progress",
        },
      ],
    },
    card_grid: {
      type: "card_grid",
      columns: 2,
      cards: [
        {
          title: "Infrastructure",
          body: "Migrated to Kubernetes, 99.99% uptime achieved",
          badge: "Complete",
          badgeVariant: "success",
        },
        {
          title: "Security Audit",
          body: "SOC 2 Type II certification in progress",
          badge: "In Progress",
          badgeVariant: "info",
        },
      ],
    },
    comparison: {
      type: "comparison",
      items: [
        {
          title: "Basic Plan",
          points: ["5 users", "10GB storage", "Email support"],
        },
        {
          title: "Pro Plan",
          points: ["Unlimited users", "100GB storage", "Priority support"],
          highlight: true,
        },
      ],
    },
    badges: {
      type: "badges",
      items: [
        { text: "On Track", variant: "success" },
        { text: "At Risk", variant: "warning" },
        { text: "Blocked", variant: "danger" },
      ],
    },
    metadata: {
      type: "metadata",
      items: [
        { label: "Date", value: "2026-03-11" },
        { label: "Target", value: "Invoice Management App" },
        { label: "Method", value: "Browser DevTools" },
      ],
    },
    hero_stats: {
      type: "hero_stats",
      stats: [
        { value: "55%", label: "Initial Load Speedup", subtitle: "0.81s → 0.36s", color: "var(--success)" },
        { value: "37%", label: "Page Load Speedup", subtitle: "1.93s → 1.22s", color: "var(--success)" },
        { value: "26%", label: "App Size Reduction", subtitle: "~44MB → ~33MB", color: "var(--accent)" },
      ],
    },
    divider: { type: "divider" },
    "divider (gradient)": {
      type: "divider",
      gradient: "var(--accent), var(--success)",
      height: 3,
    },
    diagram: {
      type: "diagram",
      title: "System Architecture",
      dark: true,
      layers: [
        {
          label: "API",
          color: "#4a90d9",
          nodes: [
            { id: "api", title: "REST API", lines: [":8080"], color: "#4a90d9" },
            { id: "web", title: "Web UI", lines: [":3000"], color: "#4a90d9" },
          ],
        },
        {
          label: "Services",
          color: "#50b86c",
          nodes: [
            { id: "auth", title: "Auth Service", color: "#50b86c" },
            { id: "worker", title: "Worker", color: "#50b86c" },
          ],
        },
        {
          label: "Storage",
          color: "#e6a23c",
          nodes: [
            { id: "pg", title: "PostgreSQL", color: "#e6a23c" },
            { id: "redis", title: "Redis", color: "#e6a23c" },
          ],
          groups: [{ label: "DATA STORES", nodeIds: ["pg", "redis"], color: "#e6a23c", style: "dashed" }],
        },
      ],
      edges: [
        { from: "api", to: "auth", label: "JWT" },
        { from: "api", to: "worker" },
        { from: "auth", to: "pg" },
        { from: "worker", to: "redis", style: "dashed" },
      ],
    },
    html: {
      type: "html",
      content: "<div style=\"text-align:center;color:var(--muted)\">Custom HTML content</div>",
    },
  };

  const lines: string[] = [
    "# HTML Report DSL — Component Examples",
    "",
    `Available styles: ${PRESET_NAMES.join(", ")}`,
    "",
    "Document structure:",
    JSON.stringify(
      {
        title: "Report Title",
        subtitle: "Optional subtitle below the title",
        badge: "OPTIONAL BADGE",
        style: "mckinsey",
        blocks: ["... array of block objects ..."],
      },
      null,
      2,
    ),
    "",
    "---",
    "",
  ];

  for (const [name, example] of Object.entries(examples)) {
    lines.push(`## ${name}`);
    lines.push("```json");
    lines.push(JSON.stringify(example, null, 2));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateDocument(doc: ReportDocument): void {
  if (!doc.title || typeof doc.title !== "string") {
    throw new EngineError(
      ErrorCode.INVALID_PARAMETER,
      "Document title is required and must be a string.",
    );
  }
  if (!Array.isArray(doc.blocks)) {
    throw new EngineError(
      ErrorCode.INVALID_PARAMETER,
      "Document blocks must be an array.",
    );
  }
  for (let i = 0; i < doc.blocks.length; i++) {
    const block = doc.blocks[i];
    if (!block || typeof block.type !== "string") {
      throw new EngineError(
        ErrorCode.INVALID_BLOCK_TYPE,
        `Block at index ${i} is missing a valid "type" field.`,
      );
    }
  }
}

function validateIndex(
  index: number,
  length: number,
  operation: string,
): void {
  if (index < 0 || index >= length) {
    throw new EngineError(
      ErrorCode.INDEX_OUT_OF_RANGE,
      `${operation} index ${index} out of range [0..${length - 1}]`,
    );
  }
}
