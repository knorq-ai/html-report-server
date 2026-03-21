/**
 * HTML Analyzer — convert arbitrary HTML to a token-efficient structural description.
 *
 * Designed for LLM consumption: strips CSS noise, preserves text content and
 * structural hierarchy, describes layout patterns at a high level. Does NOT
 * attempt to produce DSL JSON — the calling LLM handles that mapping.
 *
 * Fast path: if the HTML contains an embedded REPORT_JSON comment (created by
 * this MCP server), returns a short summary and directs the caller to use
 * read_report for the exact DSL.
 */

import { parse, HTMLElement, TextNode, Node, NodeType } from "node-html-parser";
import { extractJsonComment } from "./html-io.js";
import { summarizeBlocks } from "./renderer.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeHtmlContent(html: string): string {
  // Fast path: detect own REPORT_JSON comment
  const embeddedDoc = extractJsonComment(html);
  if (embeddedDoc) {
    const lines = [
      "# HTML Report Analysis",
      `Source: html-report-server (embedded JSON detected)`,
      "",
      `Title: "${embeddedDoc.title}"`,
      embeddedDoc.subtitle ? `Subtitle: "${embeddedDoc.subtitle}"` : null,
      embeddedDoc.badge ? `Badge: "${embeddedDoc.badge}"` : null,
      embeddedDoc.style ? `Style: ${embeddedDoc.style}` : null,
      embeddedDoc.theme ? `Theme: ${embeddedDoc.theme}` : null,
      "",
      `Blocks: ${embeddedDoc.blocks.length}`,
      summarizeBlocks(embeddedDoc.blocks),
      "",
      "→ Use read_report on this file to get the exact JSON DSL for editing.",
    ];
    return lines.filter(Boolean).join("\n");
  }

  // General path: parse and describe arbitrary HTML
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: false, style: false, noscript: false },
  });

  const title = extractTitle(root);
  const bodyEl = root.querySelector("body") ?? root;

  // Detect high-level document structure
  const docInfo = detectDocumentStructure(bodyEl);
  const blocks = extractBlocks(docInfo.contentRoot);

  const lines = [
    "# HTML Report Analysis",
    `Source: external HTML (no embedded JSON)`,
    "",
    title ? `Title: "${title}"` : "Title: (not detected)",
    docInfo.subtitle ? `Subtitle: "${docInfo.subtitle}"` : null,
    docInfo.hasHeroHeader ? `Header: dark hero/banner section detected` : null,
    "",
    `Content blocks: ${blocks.length}`,
    "",
    ...blocks.map((b, i) => `[${i}] ${b}`),
  ];

  if (docInfo.styleHints.length > 0) {
    lines.push("", "# Style signals", ...docInfo.styleHints.map(h => `- ${h}`));
  }

  return lines.filter(l => l !== null).join("\n");
}

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

function extractTitle(root: HTMLElement): string | null {
  const titleEl = root.querySelector("title");
  if (titleEl) {
    const t = titleEl.textContent.trim();
    if (t) return t;
  }
  const h1 = root.querySelector("h1");
  if (h1) return textOf(h1);
  return null;
}

// ---------------------------------------------------------------------------
// Document structure detection
// ---------------------------------------------------------------------------

interface DocStructure {
  hasHeroHeader: boolean;
  subtitle: string | null;
  contentRoot: HTMLElement;
  styleHints: string[];
}

function detectDocumentStructure(body: HTMLElement): DocStructure {
  const styleHints: string[] = [];
  let hasHeroHeader = false;
  let subtitle: string | null = null;
  let contentRoot = body;

  // Look for page wrapper pattern (single child div with max-width)
  const topChildren = significantChildren(body);
  if (topChildren.length === 1 && topChildren[0] instanceof HTMLElement) {
    const wrapper = topChildren[0];
    const style = wrapper.getAttribute("style") ?? "";
    if (style.includes("max-width") || style.includes("border-radius")) {
      contentRoot = wrapper;
      styleHints.push("Page wrapper with max-width constraint and rounded corners");

      // Check for hero header (first child with dark gradient background)
      const wrapperChildren = significantChildren(wrapper);
      if (wrapperChildren.length >= 2 && wrapperChildren[0] instanceof HTMLElement) {
        const firstChild = wrapperChildren[0];
        const firstStyle = firstChild.getAttribute("style") ?? "";
        if (firstStyle.includes("gradient") || firstStyle.includes("#0c1a2e") || firstStyle.includes("#14325a")) {
          hasHeroHeader = true;
          styleHints.push("Dark gradient hero header");

          // Extract subtitle from hero
          const heroDivs = firstChild.querySelectorAll("div");
          for (const d of heroDivs) {
            const s = d.getAttribute("style") ?? "";
            if (s.includes("rgba(255,255,255,0.55)") || s.includes("0.875rem")) {
              const t = textOf(d);
              if (t && t.length > 5 && t.length < 200) {
                subtitle = t;
                break;
              }
            }
          }

          // Content root is the second child (body section)
          if (wrapperChildren[1] instanceof HTMLElement) {
            contentRoot = wrapperChildren[1];
          }
        }
      }
    }
  }

  // Detect style preset hints from CSS variables or patterns
  const rawStyle = body.closest("html")?.querySelector("style")?.textContent ?? "";
  if (rawStyle.includes("--accent") && rawStyle.includes("--bg-subtle")) {
    styleHints.push("Uses CSS custom properties (likely a design system)");
  }
  if (rawStyle.includes("prefers-color-scheme")) {
    styleHints.push("Supports light/dark mode");
  }

  return { hasHeroHeader, subtitle, contentRoot, styleHints };
}

// ---------------------------------------------------------------------------
// Block extraction — walk top-level children, describe each
// ---------------------------------------------------------------------------

function extractBlocks(container: HTMLElement): string[] {
  const blocks: string[] = [];
  const children = significantChildren(container);

  for (const child of children) {
    if (!(child instanceof HTMLElement)) continue;
    const desc = describeElement(child);
    if (desc) blocks.push(desc);
  }

  return blocks;
}

function describeElement(el: HTMLElement): string | null {
  const tag = el.tagName?.toLowerCase() ?? "";
  const style = el.getAttribute("style") ?? "";

  // --- Unambiguous HTML elements ---

  // Table
  if (tag === "table" || el.querySelector("table")) {
    return describeTable(el);
  }

  // Heading
  if (/^h[1-6]$/.test(tag)) {
    return `heading (${tag}): "${textOf(el)}"`;
  }

  // Lists
  if (tag === "ul" || tag === "ol") {
    return describeList(el);
  }

  // Horizontal rule / divider
  if (tag === "hr") {
    return "divider";
  }

  // Paragraph
  if (tag === "p") {
    return describeParagraph(el);
  }

  // SVG (chart or diagram)
  if (tag === "svg" || el.querySelector("svg")) {
    return describeSvg(el);
  }

  // --- Style-based heuristics ---

  // Divider (thin div with border or gradient)
  if (isDivider(el, style)) {
    if (style.includes("gradient")) return "divider (gradient)";
    return "divider";
  }

  // Callout (border-left pattern)
  if (isCallout(style)) {
    return describeCallout(el, style);
  }

  // Grid / flex container with children → describe structurally
  if (isGridOrFlex(style)) {
    return describeGridOrFlex(el, style);
  }

  // Section-like header (small/uppercase text with border or rule)
  if (isSectionHeader(el, style)) {
    return describeSectionBlock(el);
  }

  // Generic div with text content
  const text = textOf(el);
  if (text && text.length > 0) {
    if (text.length <= 200) {
      return `text: "${text}"`;
    }
    return `text: "${text.slice(0, 120)}..." (${text.length} chars)`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Element describers
// ---------------------------------------------------------------------------

function describeTable(el: HTMLElement): string {
  const table = el.tagName?.toLowerCase() === "table" ? el : el.querySelector("table")!;
  const headers: string[] = [];
  const ths = table.querySelectorAll("th");
  for (const th of ths) {
    headers.push(textOf(th));
  }

  const rows = table.querySelectorAll("tbody tr");
  const rowCount = rows.length;

  // Extract first few rows of data
  const dataPreview: string[] = [];
  const maxPreview = Math.min(rowCount, 3);
  for (let i = 0; i < maxPreview; i++) {
    const cells = rows[i].querySelectorAll("td");
    const row = Array.from(cells).map(td => textOf(td));
    dataPreview.push("  " + row.join(" | "));
  }

  let desc = `table: ${headers.length} cols × ${rowCount} rows`;
  if (headers.length > 0) {
    desc += ` (${headers.join(" | ")})`;
  }
  if (dataPreview.length > 0) {
    desc += "\n" + dataPreview.join("\n");
    if (rowCount > maxPreview) {
      desc += `\n  ... (${rowCount - maxPreview} more rows)`;
    }
  }

  // Check for caption
  const nextSibling = el.nextElementSibling;
  if (nextSibling) {
    const sibStyle = nextSibling.getAttribute("style") ?? "";
    if (sibStyle.includes("text-align:center") && sibStyle.includes("0.75rem")) {
      desc += `\n  caption: "${textOf(nextSibling)}"`;
    }
  }

  return desc;
}

function describeList(el: HTMLElement): string {
  const items = el.querySelectorAll("li");
  const type = el.tagName?.toLowerCase() === "ol" ? "ordered list" : "list";
  const texts = Array.from(items).map(li => textOf(li));

  if (texts.length <= 5) {
    return `${type}: ${texts.length} items — ${texts.map(t => `"${truncate(t, 60)}"`).join(", ")}`;
  }
  return `${type}: ${texts.length} items — "${truncate(texts[0], 50)}", "${truncate(texts[1], 50)}", ... "${truncate(texts[texts.length - 1], 50)}"`;
}

function describeParagraph(el: HTMLElement): string {
  const text = textOf(el);
  if (text.length <= 120) return `paragraph: "${text}"`;
  return `paragraph: "${text.slice(0, 100)}..." (${text.length} chars)`;
}

function describeSvg(el: HTMLElement): string {
  const svg = el.tagName?.toLowerCase() === "svg" ? el : el.querySelector("svg")!;
  const ariaLabel = svg?.getAttribute("aria-label") ?? "";
  const role = svg?.getAttribute("role") ?? "";

  // Extract title text from SVG
  const titleEl = svg?.querySelector("text");
  const title = titleEl ? textOf(titleEl) : null;

  // Detect chart type from content
  const rects = svg?.querySelectorAll("rect") ?? [];
  const polylines = svg?.querySelectorAll("polyline") ?? [];
  const paths = svg?.querySelectorAll("path") ?? [];
  const textEls = svg?.querySelectorAll("text") ?? [];

  // Collect text labels from SVG
  const labels = Array.from(textEls)
    .map(t => textOf(t))
    .filter(t => t.length > 0 && t.length < 30);

  if (ariaLabel.toLowerCase().includes("bar") || (rects.length > 2 && polylines.length === 0)) {
    const desc = `bar chart${title ? `: "${title}"` : ""} — ${rects.length} bars`;
    if (labels.length > 0) {
      const axisLabels = labels.filter(l => !l.includes(",") && l.length < 15);
      if (axisLabels.length > 0) return desc + `, labels: ${axisLabels.slice(0, 8).join(", ")}`;
    }
    return desc;
  }

  if (ariaLabel.toLowerCase().includes("line") || polylines.length > 0) {
    return `line chart${title ? `: "${title}"` : ""} — ${polylines.length} series`;
  }

  if (ariaLabel.toLowerCase().includes("pie") || ariaLabel.toLowerCase().includes("donut")) {
    return `pie/donut chart${title ? `: "${title}"` : ""} — ${paths.length} slices`;
  }

  if (ariaLabel.toLowerCase().includes("diagram") || ariaLabel.toLowerCase().includes("architecture")) {
    return `diagram${title ? `: "${title}"` : ""}`;
  }

  // Generic SVG
  if (role === "img") return `SVG graphic${title ? `: "${title}"` : ""}`;
  return `SVG element (${rects.length} rects, ${paths.length} paths)`;
}

function describeCallout(el: HTMLElement, _style: string): string {
  // Detect variant from border-left color
  const borderMatch = _style.match(/border-left:\s*\dpx\s+solid\s+([^;]+)/);
  let variant = "info";
  if (borderMatch) {
    const color = borderMatch[1].trim().toLowerCase();
    // Warning: orange/amber/yellow tones
    if (color.includes("warning") || color.includes("#9a6700") || color.includes("#d29922") || color.includes("#b45309")
      || color.includes("#e67e22") || color.includes("#f59e0b") || color.includes("#d97706") || color.includes("orange")) variant = "warning";
    // Success: green tones
    else if (color.includes("success") || color.includes("#1a7f37") || color.includes("#3fb950") || color.includes("#16a34a")
      || color.includes("#22c55e") || color.includes("#10b981") || color.includes("green")) variant = "success";
    // Danger: red tones
    else if (color.includes("danger") || color.includes("#d1242f") || color.includes("#f85149") || color.includes("#dc2626")
      || color.includes("#ef4444") || color.includes("red")) variant = "danger";
  }

  // Extract title (first bold/heavy child) and body
  const children = significantChildren(el);
  let title: string | null = null;
  let body = "";

  for (const child of children) {
    if (!(child instanceof HTMLElement)) continue;
    const cs = child.getAttribute("style") ?? "";
    if (!title && (cs.includes("font-weight:700") || cs.includes("font-weight:600") || cs.includes("font-weight:bold"))) {
      title = textOf(child);
    } else {
      const t = textOf(child);
      if (t) body = body ? body + " " + t : t;
    }
  }

  let desc = `callout (${variant})`;
  if (title) desc += `: "${truncate(title, 60)}"`;
  if (body) desc += ` — ${truncate(body, 100)}`;
  return desc;
}

function describeGridOrFlex(el: HTMLElement, style: string): string {
  const children = significantChildren(el).filter(c => c instanceof HTMLElement) as HTMLElement[];
  const count = children.length;

  if (count === 0) return null as unknown as string;

  // Detect column count from grid-template-columns
  let cols = count;
  const colMatch = style.match(/grid-template-columns:\s*repeat\((\d+)/);
  if (colMatch) cols = parseInt(colMatch[1]);

  // Analyze children to describe content
  const childDescriptions = children.slice(0, 4).map(child => {
    const childStyle = child.getAttribute("style") ?? "";

    // Check for stat-like pattern (large value + small label)
    const childTexts = getDirectTextSegments(child);
    const hasLargeText = childStyle.includes("1.95rem") || childStyle.includes("2.5rem") || childStyle.includes("2rem");

    if (hasLargeText || childTexts.some(t => /^[\$¥€£]\s*[\d,.]+[KMBkm]?$/.test(t) || /^[+-]?\d+[%]?$/.test(t))) {
      // Likely stat card
      return { type: "stat", texts: childTexts };
    }

    // Check for list content (bullet points)
    const lists = child.querySelectorAll("ul, ol");
    if (lists.length > 0) {
      const title = child.querySelector("div")?.textContent?.trim() ?? "";
      const items = child.querySelectorAll("li");
      return { type: "list-card", title, itemCount: items.length };
    }

    // Check for badge
    const hasBadge = child.querySelector("span")?.getAttribute("style")?.includes("9999px");

    // Generic card
    const texts = childTexts.filter(t => t.length > 0);
    return { type: "card", texts, hasBadge };
  });

  // Classify the grid
  const types = childDescriptions.map(d => d.type);

  if (types.every(t => t === "stat")) {
    // Stat cards
    const stats = childDescriptions.map(d => {
      const t = (d as { type: string; texts: string[] }).texts;
      if (t.length >= 2) return `${t[1]}=${t[0]}`;
      return t[0] ?? "?";
    });
    return `stat cards (${cols}-col): ${stats.join(", ")}`;
  }

  if (types.every(t => t === "list-card")) {
    // Comparison-like
    const items = childDescriptions.map(d => {
      const lcd = d as { type: string; title: string; itemCount: number };
      return `"${truncate(lcd.title, 40)}" (${lcd.itemCount} points)`;
    });
    return `comparison/cards (${cols}-col): ${items.join(" vs ")}`;
  }

  if (types.every(t => t === "card")) {
    // Card grid
    const cards = childDescriptions.map(d => {
      const cd = d as { type: string; texts: string[]; hasBadge?: boolean };
      const title = cd.texts[0] ?? "?";
      const badge = cd.hasBadge ? " [badge]" : "";
      return `"${truncate(title, 40)}"${badge}`;
    });
    let desc = `card grid (${cols}-col): ${cards.join(", ")}`;
    if (count > 4) desc += `, ... (${count} total)`;
    return desc;
  }

  // Mixed or unrecognized grid
  return `grid/flex layout: ${count} items (${cols}-col)`;
}

function describeSectionBlock(el: HTMLElement): string {
  const children = significantChildren(el).filter(c => c instanceof HTMLElement) as HTMLElement[];
  let sectionNum = "";
  let title = "";
  let subtitle = "";

  for (const child of children) {
    const s = child.getAttribute("style") ?? "";
    const text = textOf(child);

    // Eyebrow badge (small, uppercase, accent-colored)
    if (s.includes("0.6rem") || s.includes("letter-spacing:0.1em")) {
      sectionNum = text;
    }
    // Main title (h2 or large bold text)
    else if (child.tagName?.toLowerCase() === "h2" || s.includes("1.2rem") || s.includes("font-weight:800")) {
      title = text;
    }
    // Subtitle
    else if (s.includes("0.875rem") && s.includes("var(--muted)")) {
      subtitle = text;
    }
  }

  if (sectionNum && title) {
    return `section: "${sectionNum}" — ${title}`;
  }
  if (sectionNum) {
    return `section: "${sectionNum}"${subtitle ? ` — ${subtitle}` : ""}`;
  }

  const text = textOf(el);
  return `section: "${truncate(text, 80)}"`;
}

// ---------------------------------------------------------------------------
// Detection predicates
// ---------------------------------------------------------------------------

function isDivider(el: HTMLElement, style: string): boolean {
  if (el.tagName?.toLowerCase() === "hr") return true;
  const height = style.match(/height:\s*(\d+)px/);
  if (height && parseInt(height[1]) <= 4 && (style.includes("background") || style.includes("border"))) {
    // Check it has no significant text content
    const text = textOf(el);
    return text.length === 0;
  }
  return false;
}

function isCallout(style: string): boolean {
  // Normalize spaces for matching
  return /border-left:\s*[3-6]px\s+solid/.test(style) ||
    style.replace(/\s+/g, "").includes("border-left:") && /\dpx\s*solid/.test(style);
}

function isGridOrFlex(style: string): boolean {
  // Handle both "display:grid" (no space) and "display: grid" (with space)
  const normalized = style.replace(/\s+/g, "").toLowerCase();
  return normalized.includes("display:grid") || (normalized.includes("display:flex") && style.includes("gap"));
}

function isSectionHeader(el: HTMLElement, style: string): boolean {
  // Check for eyebrow badge pattern or section-like container
  if (style.includes("margin-top") && style.includes("margin-bottom:1.5rem")) return true;
  // Check if contains an eyebrow badge span
  const spans = el.querySelectorAll("span");
  for (const span of spans) {
    const ss = span.getAttribute("style") ?? "";
    if (ss.includes("0.6rem") && ss.includes("letter-spacing")) return true;
  }
  // Uppercase muted text with border
  if (style.includes("text-transform:uppercase") && (style.includes("border-bottom") || style.includes("var(--muted)"))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textOf(el: HTMLElement | Node): string {
  if (!el) return "";
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function significantChildren(el: HTMLElement): Node[] {
  return el.childNodes.filter(child => {
    if (child.nodeType === NodeType.TEXT_NODE) {
      return (child as TextNode).textContent.trim().length > 0;
    }
    if (child instanceof HTMLElement) {
      // Skip script, style, comment nodes
      const tag = child.tagName?.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "noscript") return false;
      return true;
    }
    return false;
  });
}

function getDirectTextSegments(el: HTMLElement): string[] {
  const segments: string[] = [];
  const walk = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (child instanceof HTMLElement) {
        const t = textOf(child).trim();
        if (t) segments.push(t);
      }
    }
  };
  walk(el);
  return segments;
}
