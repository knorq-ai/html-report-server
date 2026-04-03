#!/usr/bin/env node

/**
 * HTML Report MCP Server — Generate styled HTML reports from structured JSON.
 *
 * Transport: stdio (runs locally, no file uploads)
 * Usage with Claude Code:  Add to ~/.claude/settings.json under mcpServers
 * Usage with Cursor:       Add to MCP server configuration
 *
 * Tools:
 *   render_report          — JSON DSL → styled HTML file
 *   read_report            — Read report structure from HTML file
 *   edit_report            — Patch operations on existing report
 *   get_component_examples — Reference: example JSON for each block type
 */

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  renderReport,
  readReport,
  editReport,
  analyzeHtml,
  getComponentExamples,
  EngineError,
} from "./html-engine.js";
import type { ReportDocument, EditOp } from "./html-engine.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json") as {
  version: string;
};

function formatError(e: unknown): string {
  if (e instanceof EngineError) {
    return `[${e.code}] ${e.message}`;
  }
  if (e instanceof Error) {
    return `[INTERNAL_ERROR] ${e.message}`;
  }
  return `[INTERNAL_ERROR] ${String(e)}`;
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "html-report-server",
  version: VERSION,
  description: [
    "Generate styled HTML reports from a compact JSON DSL.",
    "",
    "Instead of writing verbose HTML with inline styles and SVG charts,",
    "describe your report as structured JSON blocks — stat cards, tables,",
    "bar/line/pie charts, timelines, comparisons, etc. — and the server",
    "renders publication-quality HTML with 80-90% fewer output tokens.",
    "",
    "Style presets: mckinsey, clean, minimal, dashboard.",
    "",
    "Supported block types: section, heading, paragraph, list, callout,",
    "stat_cards, table, bar_chart, line_chart, pie_chart, progress_bars,",
    "timeline, card_grid, comparison, badges, before_after, steps, diagram,",
    "comparison_matrix, sectioned_table, relationship_graph, divider, html (escape hatch).",
  ].join("\n"),
});

// ---------------------------------------------------------------------------
// Shared Zod schemas
// ---------------------------------------------------------------------------

const statCardSchema = z.object({
  label: z.string(),
  value: z.string(),
  delta: z.string().optional(),
  trend: z.enum(["up", "down", "neutral"]).optional(),
});

const chartDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
  color: z.string().optional(),
});

const lineSeriesSchema = z.object({
  name: z.string(),
  data: z.array(
    z.object({ x: z.string(), y: z.number() }),
  ),
});

const progressBarSchema = z.object({
  label: z.string(),
  value: z.number(),
  max: z.number().optional(),
  color: z.string().optional(),
});

const timelineEntrySchema = z.object({
  date: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string().optional(),
  color: z.string().optional().describe('Dot/date color, e.g. "var(--success)" or "var(--purple)"'),
});

const cardGridCardSchema = z.object({
  title: z.string(),
  body: z.string(),
  badge: z.string().optional(),
  badgeVariant: z
    .enum(["success", "warning", "danger", "info", "neutral"])
    .optional(),
});

const comparisonItemSchema = z.object({
  title: z.string(),
  points: z.array(z.string()),
  highlight: z.union([z.boolean(), z.string()]).optional().describe('true for accent blue, or "accent"|"purple"|"success"|"warning"|"danger"'),
});

const badgeItemSchema = z.object({
  text: z.string(),
  variant: z
    .enum(["success", "warning", "danger", "info", "neutral"])
    .optional(),
});

const beforeAfterItemSchema = z.object({
  title: z.string(),
  before: z.object({ label: z.string(), value: z.number(), unit: z.string().optional() }),
  after: z.object({ label: z.string(), value: z.number(), unit: z.string().optional() }),
  improvement: z.string().optional(),
});

const stepItemSchema = z.object({
  label: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
});

const diagramNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  lines: z.array(z.string()).optional(),
  color: z.string().optional(),
  textColor: z.string().optional(),
});

const diagramGroupSchema = z.object({
  label: z.string().optional(),
  nodeIds: z.array(z.string()),
  color: z.string().optional(),
  style: z.enum(["solid", "dashed"]).optional(),
});

const diagramEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  style: z.enum(["solid", "dashed"]).optional(),
  color: z.string().optional(),
});

const diagramLayerSchema = z.object({
  label: z.string(),
  color: z.string().optional(),
  nodes: z.array(diagramNodeSchema).max(50),
  groups: z.array(diagramGroupSchema).max(20).optional(),
});

// --- comparison_matrix ---
const matrixColumnSchema = z.object({
  id: z.string(),
  label: z.string(),
  width: z.string().optional().describe('CSS width, e.g. "30%"'),
  type: z.enum(["text", "badge", "tags"]).optional().describe('Column type: "text" (default), "badge" for status pills, "tags" for tag arrays'),
});

const matrixBadgeValueSchema = z.object({
  text: z.string(),
  variant: z.enum(["success", "warning", "danger", "info", "neutral"]).optional(),
});

const matrixCellValueSchema = z.union([
  z.string(),
  matrixBadgeValueSchema,
  z.array(z.string()),
]);

const matrixRowSchema = z.record(z.string(), matrixCellValueSchema);

// --- sectioned_table ---
const sectionedTableSubtotalSchema = z.object({
  label: z.string(),
  column: z.number().min(0).describe("0-based column index for the subtotal value"),
  value: z.string(),
});

const tableSectionSchema = z.object({
  title: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string().max(10000)).max(100)).max(1000),
  subtotal: sectionedTableSubtotalSchema.optional(),
});

const grandTotalSchema = z.object({
  label: z.string(),
  value: z.string(),
});

// --- relationship_graph ---
const graphNodeFieldSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const graphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().optional().describe('Node role label, e.g. "CEO", "被相続人"'),
  fields: z.array(graphNodeFieldSchema).max(10).optional(),
  color: z.string().optional(),
});

const graphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(["single-line", "double-line", "dashed"]).optional().describe('"single-line" (default) with arrow, "double-line" for peer/equal (no arrow), "dashed" for weak/historical'),
  label: z.string().optional(),
  color: z.string().optional(),
});

const graphStyleSchema = z.object({
  font: z.enum(["serif", "sans-serif"]).optional(),
  color: z.enum(["monochrome", "colored"]).optional(),
  printReady: z.boolean().optional(),
}).optional();

const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("section"), title: z.string(), subtitle: z.string().optional() }),
  z.object({ type: z.literal("heading"), level: z.number().min(1).max(6), text: z.string() }),
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({
    type: z.literal("list"),
    ordered: z.boolean().optional(),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal("callout"),
    variant: z.enum(["info", "warning", "success", "danger"]).optional(),
    title: z.string().optional(),
    text: z.string(),
  }),
  z.object({ type: z.literal("stat_cards"), cards: z.array(statCardSchema).max(20) }),
  z.object({
    type: z.literal("table"),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string().max(10000)).max(100)).max(10000),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal("bar_chart"),
    title: z.string().optional(),
    data: z.array(chartDataPointSchema).max(200),
    unit: z.string().optional(),
    horizontal: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("line_chart"),
    title: z.string().optional(),
    series: z.array(lineSeriesSchema).max(20),
    unit: z.string().optional(),
    dualAxis: z.boolean().optional().describe("When true and there are 2 series, use independent left/right Y-axes for each series"),
  }),
  z.object({
    type: z.literal("pie_chart"),
    title: z.string().optional(),
    data: z.array(chartDataPointSchema).max(50),
    donut: z.boolean().optional(),
  }),
  z.object({ type: z.literal("progress_bars"), bars: z.array(progressBarSchema).max(50) }),
  z.object({ type: z.literal("timeline"), entries: z.array(timelineEntrySchema).max(100) }),
  z.object({
    type: z.literal("card_grid"),
    columns: z.number().min(1).max(4).optional(),
    cards: z.array(cardGridCardSchema).max(50),
  }),
  z.object({ type: z.literal("comparison"), items: z.array(comparisonItemSchema).max(10) }),
  z.object({ type: z.literal("badges"), items: z.array(badgeItemSchema).max(50) }),
  z.object({
    type: z.literal("metadata"),
    items: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  z.object({
    type: z.literal("hero_stats"),
    stats: z.array(
      z.object({
        value: z.string(),
        label: z.string(),
        subtitle: z.string().optional(),
        color: z.string().optional(),
        breakdown: z.array(z.object({
          label: z.string(),
          value: z.string(),
          struck: z.boolean().optional().describe("Render with strikethrough (e.g. already contracted)"),
        })).optional().describe("Line-item breakdown rows"),
        breakdownTotal: z.string().optional().describe('Total row, format "label|value" or just "value"'),
      }),
    ),
  }),
  z.object({
    type: z.literal("divider"),
    color: z.string().optional().describe("Solid color for the divider line"),
    gradient: z.string().optional().describe('CSS gradient stops, e.g. "var(--accent), var(--success)"'),
    height: z.number().min(1).max(20).optional().describe("Line height in pixels, 1-20 (default 1 for plain, 3 for gradient)"),
  }),
  z.object({ type: z.literal("html"), content: z.string().max(500_000) }),
  z.object({
    type: z.literal("diagram"),
    title: z.string().optional(),
    layers: z.array(diagramLayerSchema).max(20),
    edges: z.array(diagramEdgeSchema).max(200),
    dark: z.boolean().optional().describe("Dark theme (default false)"),
  }),
  z.object({ type: z.literal("before_after"), items: z.array(beforeAfterItemSchema).max(20) }),
  z.object({ type: z.literal("steps"), steps: z.array(stepItemSchema).max(8) }),
  z.object({
    type: z.literal("comparison_matrix"),
    title: z.string().optional(),
    columns: z.array(matrixColumnSchema).max(20),
    rows: z.array(matrixRowSchema).max(500),
  }),
  z.object({
    type: z.literal("sectioned_table"),
    title: z.string().optional(),
    sections: z.array(tableSectionSchema).max(50),
    grandTotal: grandTotalSchema.optional(),
  }),
  z.object({
    type: z.literal("relationship_graph"),
    title: z.string().optional(),
    layout: z.enum(["hierarchical", "radial", "force"]).optional().describe('Layout algorithm: "hierarchical" (default), "radial", or "force"'),
    direction: z.enum(["TB", "LR"]).optional().describe('Direction for hierarchical layout: "TB" (top-bottom, default) or "LR" (left-right)'),
    nodes: z.array(graphNodeSchema).max(100),
    edges: z.array(graphEdgeSchema).max(500),
    style: graphStyleSchema,
    dark: z.boolean().optional(),
  }),
]);

const styleNameSchema = z
  .enum(["mckinsey", "clean", "minimal", "dashboard"])
  .optional()
  .describe(
    'Style preset. "mckinsey" (default): uppercase headers, thin borders, executive feel. ' +
      '"clean": subtle shadows, rounded corners, modern SaaS. ' +
      '"minimal": tight spacing, no decoration, content-dense. ' +
      '"dashboard": dense data layout, dark header tables, full-width.',
  );

const styleOverridesSchema = z
  .object({
    card: z
      .object({
        borderRadius: z.string().optional(),
        border: z.string().optional(),
        boxShadow: z.string().optional(),
        padding: z.string().optional(),
        background: z.string().optional(),
      })
      .optional(),
    table: z
      .object({
        headerBg: z.string().optional(),
        headerColor: z.string().optional(),
        stripedRows: z.boolean().optional(),
        borderRadius: z.string().optional(),
        outerBorder: z.string().optional(),
      })
      .optional(),
    chart: z
      .object({
        palette: z.array(z.string()).optional(),
        barRadius: z.number().optional(),
        strokeWidth: z.number().optional(),
        height: z.number().optional(),
      })
      .optional(),
    sectionTitle: z
      .object({
        textTransform: z.enum(["uppercase", "none"]).optional(),
        fontSize: z.string().optional(),
        fontWeight: z.string().optional(),
        letterSpacing: z.string().optional(),
        borderBottom: z.string().optional(),
        marginBottom: z.string().optional(),
      })
      .optional(),
  })
  .optional()
  .describe("Selective overrides for the chosen style preset.");

const editOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("replace"),
    index: z.number().describe("Block index to replace"),
    block: blockSchema.describe("New block content"),
  }),
  z.object({
    op: z.literal("insert"),
    index: z.number().describe("Position to insert before"),
    block: blockSchema.describe("Block to insert"),
  }),
  z.object({
    op: z.literal("delete"),
    index: z.number().describe("Block index to delete"),
  }),
]);

// ---------------------------------------------------------------------------
// Tool: render_report
// ---------------------------------------------------------------------------

server.tool(
  "render_report",
  "Render a structured JSON report to a styled HTML file. This is the primary tool — pass a complete report with title, optional style preset, and an array of block objects. Returns a summary of rendered blocks.",
  {
    file_path: z
      .string()
      .describe("Absolute path for the output HTML file"),
    title: z.string().describe("Report title"),
    subtitle: z.string().optional().describe("Subtitle shown below the title"),
    badge: z.string().optional().describe('Badge shown next to the title (e.g. "PERFORMANCE REPORT")'),
    style: styleNameSchema,
    theme: z.enum(["auto", "light", "dark"]).optional().describe(
      'Color theme. "auto" (default): follows browser/OS preference. "light": always light. "dark": always dark.',
    ),
    style_overrides: styleOverridesSchema,
    blocks: z
      .array(blockSchema)
      .max(500)
      .describe("Array of block objects (max 500). Call get_component_examples for the full DSL reference."),
  },
  async ({ file_path, title, subtitle, badge, style, theme, style_overrides, blocks }) => {
    try {
      const doc: ReportDocument = {
        title,
        subtitle,
        badge,
        style,
        theme,
        styleOverrides: style_overrides,
        blocks: blocks as ReportDocument["blocks"],
      };
      const result = await renderReport(file_path, doc);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (e: unknown) {
      return {
        content: [{ type: "text" as const, text: formatError(e) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: read_report
// ---------------------------------------------------------------------------

server.tool(
  "read_report",
  "Read the JSON structure from an existing HTML report file. Returns the block summary and full JSON for re-editing. Use this before edit_report to understand the current structure.",
  {
    file_path: z
      .string()
      .describe("Absolute path to the HTML file created by render_report"),
  },
  async ({ file_path }) => {
    try {
      const result = await readReport(file_path);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (e: unknown) {
      return {
        content: [{ type: "text" as const, text: formatError(e) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: edit_report
// ---------------------------------------------------------------------------

server.tool(
  "edit_report",
  "Apply patch operations (replace, insert, delete) to an existing report. Operations are applied atomically: deletes first (descending), then replaces, then inserts (ascending). The file is read and written once.",
  {
    file_path: z
      .string()
      .describe("Absolute path to the HTML file to edit"),
    operations: z
      .array(editOpSchema)
      .describe("Array of edit operations to apply"),
  },
  async ({ file_path, operations }) => {
    try {
      const result = await editReport(file_path, operations as EditOp[]);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (e: unknown) {
      return {
        content: [{ type: "text" as const, text: formatError(e) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: analyze_html
// ---------------------------------------------------------------------------

server.tool(
  "analyze_html",
  "Analyze any HTML file and return a token-efficient structural description. Works with arbitrary HTML — not limited to files created by this MCP. Returns document structure, text content, layout patterns, and style signals. For files created by this server, detects the embedded JSON and directs you to use read_report instead.",
  {
    file_path: z.string().optional().describe("Absolute path to an HTML file to analyze"),
    html_content: z.string().max(500_000).optional().describe("Raw HTML string to analyze (alternative to file_path)"),
  },
  async ({ file_path, html_content }) => {
    try {
      const result = await analyzeHtml(file_path, html_content);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (e: unknown) {
      return {
        content: [{ type: "text" as const, text: formatError(e) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_component_examples
// ---------------------------------------------------------------------------

server.tool(
  "get_component_examples",
  "Return example JSON snippets for every available block type. No file I/O — call this once to learn the DSL before using render_report.",
  {},
  async () => {
    const result = getComponentExamples();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
