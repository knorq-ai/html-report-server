/**
 * Main renderer — converts a ReportDocument JSON into body HTML.
 *
 * The renderer iterates blocks, delegates to component renderers,
 * and assembles the final HTML string with a consistent wrapper.
 */

import type { ReportDocument, Block } from "./types.js";
import { resolvePreset } from "./theme.js";
import { renderBlock } from "./components.js";
import { inlineStyle } from "./theme.js";
import { escapeHtml, elem } from "./html-utils.js";

/**
 * Render a complete report document to body-only HTML.
 *
 * The output is designed to be embedded inside a host document that provides
 * the CSS variable definitions (--fg, --bg, --muted, --border, etc.).
 */
export function renderDocument(doc: ReportDocument): string {
  const preset = resolvePreset(doc.style, doc.styleOverrides);

  const wrapperStyle = inlineStyle({
    maxWidth: preset.maxWidth,
    margin: "0 auto",
    padding: "2rem 1.5rem",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    color: "var(--fg)",
    lineHeight: "1.6",
  });

  // Title row (with optional badge)
  let body: string;
  if (doc.badge) {
    const titleRowStyle = inlineStyle({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "1rem",
      marginBottom: "0.25rem",
    });
    const titleStyle = inlineStyle({
      fontSize: "1.75rem",
      fontWeight: "700",
      color: "var(--fg)",
      lineHeight: "1.3",
    });
    const badgeStyle = inlineStyle({
      display: "inline-block",
      fontSize: "0.7rem",
      fontWeight: "700",
      padding: "0.4rem 1rem",
      borderRadius: "6px",
      background: "var(--accent)",
      color: "#fff",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      whiteSpace: "nowrap",
      marginTop: "0.25rem",
    });
    body = elem(
      "div",
      { style: titleRowStyle },
      elem("h1", { style: titleStyle }, escapeHtml(doc.title)) +
        elem("span", { style: badgeStyle }, escapeHtml(doc.badge)),
    );
  } else {
    const titleStyle = inlineStyle({
      fontSize: "1.75rem",
      fontWeight: "700",
      color: "var(--fg)",
      marginBottom: "0.5rem",
      lineHeight: "1.3",
    });
    body = elem("h1", { style: titleStyle }, escapeHtml(doc.title));
  }

  // Subtitle
  if (doc.subtitle) {
    const subtitleStyle = inlineStyle({
      fontSize: "1.1rem",
      color: "var(--muted)",
      marginBottom: "0.75rem",
      lineHeight: "1.4",
    });
    body += elem("div", { style: subtitleStyle }, escapeHtml(doc.subtitle));
  }

  // Render each block
  for (const block of doc.blocks) {
    body += "\n" + renderBlock(block, preset);
  }

  return elem("div", { style: wrapperStyle }, body);
}

/**
 * Generate a block-level summary for read_report output.
 * Returns a compact text description of each block with its index.
 */
export function summarizeBlocks(blocks: Block[]): string {
  return blocks
    .map((block, i) => {
      const summary = summarizeBlock(block);
      return `[${i}] ${summary}`;
    })
    .join("\n");
}

function summarizeBlock(block: Block): string {
  switch (block.type) {
    case "section":
      return `section: "${block.title}"`;
    case "heading":
      return `h${block.level}: "${block.text}"`;
    case "paragraph":
      return `paragraph: "${truncate(block.text, 60)}"`;
    case "list":
      return `${block.ordered ? "ol" : "ul"}: ${block.items.length} items`;
    case "callout":
      return `callout (${block.variant ?? "info"}): "${truncate(block.title ?? block.text, 50)}"`;
    case "stat_cards":
      return `stat_cards: ${block.cards.map((c) => c.label).join(", ")}`;
    case "table":
      return `table: ${block.headers.length} cols × ${block.rows.length} rows`;
    case "bar_chart":
      return `bar_chart: ${block.data.length} bars${block.title ? ` — "${block.title}"` : ""}`;
    case "line_chart":
      return `line_chart: ${block.series.length} series${block.title ? ` — "${block.title}"` : ""}`;
    case "pie_chart":
      return `pie_chart: ${block.data.length} slices${block.title ? ` — "${block.title}"` : ""}`;
    case "progress_bars":
      return `progress_bars: ${block.bars.length} bars`;
    case "timeline":
      return `timeline: ${block.entries.length} entries`;
    case "card_grid":
      return `card_grid: ${block.cards.length} cards (${block.columns ?? 3} cols)`;
    case "comparison":
      return `comparison: ${block.items.map((i) => i.title).join(" vs ")}`;
    case "badges":
      return `badges: ${block.items.map((b) => b.text).join(", ")}`;
    case "metadata":
      return `metadata: ${block.items.map((i) => i.label).join(", ")}`;
    case "hero_stats":
      return `hero_stats: ${block.stats.map((s) => `${s.value} (${s.label})`).join(", ")}`;
    case "divider":
      return block.gradient ? "divider (gradient)" : "divider";
    case "html":
      return `raw html: ${block.content.length} chars`;
    case "diagram": {
      const nodeCount = block.layers.reduce((sum, l) => sum + l.nodes.length, 0);
      return `diagram: ${block.layers.length} layers, ${nodeCount} nodes, ${block.edges.length} edges${block.title ? ` — "${block.title}"` : ""}`;
    }
    default:
      return `unknown type`;
  }
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + "...";
}
