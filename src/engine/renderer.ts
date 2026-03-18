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
 * Render a complete report document to body HTML.
 *
 * The output is wrapped in a full HTML document shell (with CSS variable
 * definitions for light/dark mode) by writeHtmlFile in html-io.ts.
 */
export function renderDocument(doc: ReportDocument): string {
  const preset = resolvePreset(doc.style, doc.styleOverrides);

  const fontFamily =
    "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Yu Gothic UI', 'Segoe UI', Helvetica, Arial, sans-serif";

  // ── Outer page wrapper (white card on subtle gray background) ──
  const pageStyle = inlineStyle({
    maxWidth: preset.maxWidth,
    margin: "2rem auto",
    background: "var(--bg)",
    borderRadius: "16px",
    boxShadow: "var(--shadow-lg)",
    overflow: "hidden",
    fontFamily,
    color: "var(--fg)",
    lineHeight: "1.6",
  });

  // ── Hero header (dark gradient) ──
  const heroStyle = inlineStyle({
    background: "linear-gradient(135deg, #0c1a2e 0%, #14325a 55%, #1d4ed8 100%)",
    padding: "2.75rem 2.75rem 2.25rem",
    position: "relative",
    overflow: "hidden",
  });

  let heroContent = "";

  // Title row (with optional badge)
  if (doc.badge) {
    const titleRowStyle = inlineStyle({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "1rem",
      marginBottom: "0.5rem",
    });
    const titleStyle = inlineStyle({
      fontSize: "1.9rem",
      fontWeight: "800",
      color: "#fff",
      letterSpacing: "-0.025em",
      lineHeight: "1.2",
    });
    const badgeStyle = inlineStyle({
      display: "inline-flex",
      alignItems: "center",
      fontSize: "0.6rem",
      fontWeight: "800",
      padding: "0.35rem 0.9rem",
      borderRadius: "6px",
      background: "rgba(255,255,255,0.12)",
      color: "rgba(255,255,255,0.85)",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      whiteSpace: "nowrap",
      border: "1px solid rgba(255,255,255,0.2)",
      flexShrink: "0",
      marginTop: "0.35rem",
    });
    heroContent = elem(
      "div",
      { style: titleRowStyle },
      elem("h1", { style: titleStyle }, escapeHtml(doc.title)) +
        elem("span", { style: badgeStyle }, escapeHtml(doc.badge)),
    );
  } else {
    const titleStyle = inlineStyle({
      fontSize: "1.9rem",
      fontWeight: "800",
      color: "#fff",
      letterSpacing: "-0.025em",
      lineHeight: "1.2",
      marginBottom: "0.5rem",
    });
    heroContent = elem("h1", { style: titleStyle }, escapeHtml(doc.title));
  }

  // Subtitle
  if (doc.subtitle) {
    const subtitleStyle = inlineStyle({
      fontSize: "0.875rem",
      color: "rgba(255,255,255,0.55)",
      marginBottom: "0.5rem",
    });
    heroContent += elem("div", { style: subtitleStyle }, escapeHtml(doc.subtitle));
  }

  const hero = elem("div", { style: heroStyle }, heroContent);

  // ── Body section ──
  const bodyStyle = inlineStyle({
    padding: "2.5rem 2.75rem 3.5rem",
  });

  let bodyContent = "";
  for (const block of doc.blocks) {
    bodyContent += "\n" + renderBlock(block, preset);
  }

  const body = elem("div", { style: bodyStyle }, bodyContent);

  return elem("div", { style: pageStyle }, hero + body);
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
    case "before_after":
      return `before_after: ${block.items.length} comparisons`;
    case "steps":
      return `steps: ${block.steps.length} steps — ${block.steps.map((s) => s.title).join(" → ")}`;
    default:
      return `unknown type`;
  }
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + "...";
}
