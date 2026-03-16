/**
 * Component renderers — one function per block type.
 *
 * Each renderer takes a typed block and a resolved StylePreset,
 * and returns an HTML string with inline styles using CSS variables.
 */

import type {
  Block,
  SectionBlock,
  HeadingBlock,
  ParagraphBlock,
  ListBlock,
  CalloutBlock,
  StatCardsBlock,
  TableBlock,
  BarChartBlock,
  LineChartBlock,
  PieChartBlock,
  ProgressBarsBlock,
  TimelineBlock,
  CardGridBlock,
  ComparisonBlock,
  BadgesBlock,
  MetadataBlock,
  HeroStatsBlock,
  DividerBlock,
  RawHtmlBlock,
  StylePreset,
} from "./types.js";
import { inlineStyle, styleAttr } from "./theme.js";
import { escapeHtml, sanitizeInlineHtml, sanitizeBlockHtml, sanitizeCssValue, elem } from "./html-utils.js";
import { renderBarChart, renderLineChart, renderPieChart } from "./charts.js";

// ---------------------------------------------------------------------------
// Badge variant → color mapping
// ---------------------------------------------------------------------------

const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  success: { bg: "var(--success)", fg: "#fff" },
  warning: { bg: "var(--warning)", fg: "#fff" },
  danger: { bg: "var(--danger)", fg: "#fff" },
  info: { bg: "var(--accent)", fg: "#fff" },
  neutral: { bg: "var(--code-bg)", fg: "var(--fg)" },
};

// ---------------------------------------------------------------------------
// Callout variant → accent color
// ---------------------------------------------------------------------------

const CALLOUT_ACCENTS: Record<string, string> = {
  info: "var(--accent)",
  warning: "var(--warning)",
  success: "var(--success)",
  danger: "var(--danger)",
};

// ---------------------------------------------------------------------------
// Trend arrow
// ---------------------------------------------------------------------------

function trendArrow(trend?: string): string {
  if (trend === "up") return "&#x25B2;"; // ▲
  if (trend === "down") return "&#x25BC;"; // ▼
  return "";
}

function trendColor(trend?: string): string {
  if (trend === "up") return "var(--success)";
  if (trend === "down") return "var(--danger)";
  return "var(--muted)";
}

// ---------------------------------------------------------------------------
// Component renderers
// ---------------------------------------------------------------------------

function renderSection(block: SectionBlock, preset: StylePreset): string {
  const st = preset.sectionTitle;
  const titleStyle = inlineStyle({
    textTransform: st.textTransform,
    fontSize: st.fontSize,
    fontWeight: st.fontWeight,
    letterSpacing: st.letterSpacing,
    color: "var(--muted)",
    paddingBottom: st.borderBottom !== "none" ? "0.5rem" : undefined,
    borderBottom: st.borderBottom !== "none" ? st.borderBottom : undefined,
    marginBottom: st.marginBottom,
    marginTop: preset.sectionGap,
  });

  let html = elem("div", { style: titleStyle }, escapeHtml(block.title));

  if (block.subtitle) {
    const subStyle = inlineStyle({
      fontSize: "0.875rem",
      color: "var(--muted)",
      marginTop: "-0.5rem",
      marginBottom: "1rem",
    });
    html += elem("div", { style: subStyle }, escapeHtml(block.subtitle));
  }

  return html;
}

function renderHeading(block: HeadingBlock, _preset: StylePreset): string {
  const tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return `<${tag}>${escapeHtml(block.text)}</${tag}>`;
}

function renderParagraph(block: ParagraphBlock, preset: StylePreset): string {
  const style = inlineStyle({ marginBottom: preset.blockGap, lineHeight: "1.6" });
  // Paragraph text supports inline HTML (bold, links) — sanitized to an allowlist
  return elem("p", { style }, sanitizeInlineHtml(block.text));
}

function renderList(block: ListBlock, preset: StylePreset): string {
  const tag = block.ordered ? "ol" : "ul";
  const listStyle = inlineStyle({
    marginBottom: preset.blockGap,
    paddingLeft: "1.5rem",
  });
  const items = block.items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("\n");
  return elem(tag, { style: listStyle }, items);
}

function renderCallout(block: CalloutBlock, preset: StylePreset): string {
  const accent = CALLOUT_ACCENTS[block.variant ?? "info"] ?? CALLOUT_ACCENTS.info;
  const style = inlineStyle({
    borderLeft: `4px solid ${accent}`,
    borderRadius: preset.card.borderRadius,
    background: "var(--code-bg)",
    padding: "1rem 1.25rem",
    marginBottom: preset.blockGap,
  });

  let content = "";
  if (block.title) {
    const titleStyle = inlineStyle({
      fontWeight: "600",
      marginBottom: "0.25rem",
      color: "var(--fg)",
    });
    content += elem("div", { style: titleStyle }, escapeHtml(block.title));
  }
  // Callout text supports inline HTML (bold, links) — sanitized to an allowlist
  content += elem(
    "div",
    { style: "color:var(--fg);line-height:1.6" },
    sanitizeInlineHtml(block.text),
  );

  return elem("div", { style }, content);
}

function renderStatCards(block: StatCardsBlock, preset: StylePreset): string {
  const columns = Math.min(block.cards.length, 4);
  const gridStyle = inlineStyle({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: "1rem",
    marginBottom: preset.blockGap,
  });

  const cards = block.cards
    .map((card) => {
      const cardStyle = inlineStyle({
        borderRadius: preset.card.borderRadius,
        border: preset.card.border !== "none" ? preset.card.border : undefined,
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : undefined,
        padding: preset.card.padding,
        background: preset.card.background,
      });

      const labelStyle = inlineStyle({
        fontSize: "0.75rem",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        color: "var(--muted)",
        marginBottom: "0.25rem",
      });

      const valueStyle = inlineStyle({
        fontSize: preset.statValueFontSize,
        fontWeight: preset.statValueFontWeight,
        color: "var(--fg)",
        lineHeight: "1.2",
      });

      let cardContent = elem("div", { style: labelStyle }, escapeHtml(card.label));
      cardContent += elem("div", { style: valueStyle }, escapeHtml(card.value));

      if (card.delta) {
        const deltaStyle = inlineStyle({
          fontSize: "0.875rem",
          color: trendColor(card.trend),
          marginTop: "0.25rem",
        });
        const arrow = trendArrow(card.trend);
        const deltaText = arrow
          ? `${arrow} ${escapeHtml(card.delta)}`
          : escapeHtml(card.delta);
        cardContent += elem("div", { style: deltaStyle }, deltaText);
      }

      return elem("div", { style: cardStyle }, cardContent);
    })
    .join("\n");

  return elem("div", { style: gridStyle }, cards);
}

function renderTable(block: TableBlock, preset: StylePreset): string {
  const ts = preset.table;
  const wrapperStyle = inlineStyle({
    overflowX: "auto",
    marginBottom: preset.blockGap,
    borderRadius: ts.borderRadius !== "0" ? ts.borderRadius : undefined,
    border: ts.outerBorder,
  });

  const tableStyle = inlineStyle({
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.875rem",
  });

  // Headers
  const thStyle = inlineStyle({
    background: ts.headerBg,
    color: ts.headerColor,
    padding: "0.625rem 0.75rem",
    textAlign: "left",
    fontWeight: "600",
    borderBottom: `1px solid var(--border)`,
  });

  const ths = block.headers
    .map((h) => elem("th", { style: thStyle }, escapeHtml(h)))
    .join("");
  const thead = `<thead><tr>${ths}</tr></thead>`;

  // Rows
  const rows = block.rows
    .map((row, ri) => {
      const rowBg =
        ts.stripedRows && ri % 2 === 1 ? "var(--code-bg)" : undefined;
      const tds = row
        .map((cell) => {
          const tdStyle = inlineStyle({
            padding: "0.5rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            background: rowBg,
          });
          return elem("td", { style: tdStyle }, escapeHtml(cell));
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("\n");
  const tbody = `<tbody>${rows}</tbody>`;

  let html = elem("div", { style: wrapperStyle }, elem("table", { style: tableStyle }, thead + tbody));

  if (block.caption) {
    const captionStyle = inlineStyle({
      fontSize: "0.8rem",
      color: "var(--muted)",
      marginTop: "-0.5rem",
      marginBottom: preset.blockGap,
      textAlign: "center",
    });
    html += elem("div", { style: captionStyle }, escapeHtml(block.caption));
  }

  return html;
}

function renderProgressBars(
  block: ProgressBarsBlock,
  preset: StylePreset,
): string {
  const barsHtml = block.bars
    .map((bar) => {
      const max = bar.max ?? 100;
      const pct = Math.min(100, Math.max(0, (bar.value / max) * 100));
      const color = sanitizeCssValue(bar.color ?? "var(--accent)");

      const rowStyle = inlineStyle({ marginBottom: "0.75rem" });

      const labelRowStyle = inlineStyle({
        display: "flex",
        justifyContent: "space-between",
        fontSize: "0.875rem",
        marginBottom: "0.25rem",
      });

      const trackStyle = inlineStyle({
        height: "8px",
        background: "var(--code-bg)",
        borderRadius: "4px",
        overflow: "hidden",
      });

      const fillStyle = inlineStyle({
        height: "100%",
        width: `${pct}%`,
        background: color,
        borderRadius: "4px",
        transition: "width 0.3s",
      });

      const labelRow =
        elem("span", { style: "color:var(--fg)" }, escapeHtml(bar.label)) +
        elem("span", { style: "color:var(--muted)" }, `${Math.round(pct)}%`);

      return elem(
        "div",
        { style: rowStyle },
        elem("div", { style: labelRowStyle }, labelRow) +
          elem("div", { style: trackStyle }, elem("div", { style: fillStyle }, "")),
      );
    })
    .join("\n");

  return elem(
    "div",
    { style: inlineStyle({ marginBottom: preset.blockGap }) },
    barsHtml,
  );
}

function renderTimeline(block: TimelineBlock, preset: StylePreset): string {
  const containerStyle = inlineStyle({
    position: "relative",
    paddingLeft: "2rem",
    marginBottom: preset.blockGap,
  });

  // Vertical line
  const lineStyle = inlineStyle({
    position: "absolute",
    left: "0.5rem",
    top: "0.25rem",
    bottom: "0.25rem",
    width: "2px",
    background: "var(--border)",
  });

  const entries = block.entries
    .map((entry) => {
      const entryStyle = inlineStyle({
        position: "relative",
        marginBottom: "1.25rem",
      });

      // Dot
      const dotStyle = inlineStyle({
        position: "absolute",
        left: "-1.75rem",
        top: "0.35rem",
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        background: "var(--accent)",
        border: "2px solid var(--bg)",
      });

      const dateStyle = inlineStyle({
        fontSize: "0.75rem",
        color: "var(--muted)",
        marginBottom: "0.125rem",
      });

      const titleStyle = inlineStyle({
        fontWeight: "600",
        color: "var(--fg)",
      });

      let content = elem("div", { style: dotStyle }, "");
      content += elem("div", { style: dateStyle }, escapeHtml(entry.date));

      let titleHtml = escapeHtml(entry.title);
      if (entry.status) {
        const variant =
          entry.status === "done"
            ? "success"
            : entry.status === "in_progress"
              ? "info"
              : "neutral";
        titleHtml += " " + renderBadgeInline(entry.status, variant);
      }
      content += elem("div", { style: titleStyle }, titleHtml);

      if (entry.description) {
        const descStyle = inlineStyle({
          fontSize: "0.875rem",
          color: "var(--muted)",
          marginTop: "0.125rem",
          lineHeight: "1.5",
        });
        content += elem("div", { style: descStyle }, escapeHtml(entry.description));
      }

      return elem("div", { style: entryStyle }, content);
    })
    .join("\n");

  return elem(
    "div",
    { style: containerStyle },
    elem("div", { style: lineStyle }, "") + entries,
  );
}

function renderCardGrid(block: CardGridBlock, preset: StylePreset): string {
  const columns = Math.min(block.columns ?? 3, 4);
  const gridStyle = inlineStyle({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: "1rem",
    marginBottom: preset.blockGap,
  });

  const cards = block.cards
    .map((card) => {
      const cardStyle = inlineStyle({
        borderRadius: preset.card.borderRadius,
        border: preset.card.border !== "none" ? preset.card.border : undefined,
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : undefined,
        padding: preset.card.padding,
        background: preset.card.background,
      });

      let content = "";

      if (card.badge) {
        content += renderBadgeInline(
          card.badge,
          card.badgeVariant ?? "neutral",
        );
      }

      const titleStyle = inlineStyle({
        fontWeight: "600",
        color: "var(--fg)",
        marginBottom: "0.5rem",
        marginTop: card.badge ? "0.5rem" : undefined,
      });
      content += elem("div", { style: titleStyle }, escapeHtml(card.title));

      const bodyStyle = inlineStyle({
        fontSize: "0.875rem",
        color: "var(--muted)",
        lineHeight: "1.5",
      });
      content += elem("div", { style: bodyStyle }, escapeHtml(card.body));

      return elem("div", { style: cardStyle }, content);
    })
    .join("\n");

  return elem("div", { style: gridStyle }, cards);
}

function renderComparison(
  block: ComparisonBlock,
  preset: StylePreset,
): string {
  const columns = Math.min(block.items.length, 4);
  const gridStyle = inlineStyle({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: "1rem",
    marginBottom: preset.blockGap,
  });

  const items = block.items
    .map((item) => {
      const cardStyle = inlineStyle({
        borderRadius: preset.card.borderRadius,
        border: item.highlight
          ? "2px solid var(--accent)"
          : preset.card.border !== "none"
            ? preset.card.border
            : "1px solid var(--border)",
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : undefined,
        padding: preset.card.padding,
        background: preset.card.background,
      });

      const titleStyle = inlineStyle({
        fontWeight: "600",
        fontSize: "1rem",
        color: "var(--fg)",
        marginBottom: "0.75rem",
        paddingBottom: "0.5rem",
        borderBottom: "1px solid var(--border)",
      });

      const listStyle = inlineStyle({
        listStyle: "none",
        padding: "0",
        margin: "0",
      });

      const lis = item.points
        .map((pt) => {
          return elem(
            "li",
            {
              style: "padding:0.25rem 0;font-size:0.875rem;color:var(--fg)",
            },
            `&#x2022; ${escapeHtml(pt)}`,
          );
        })
        .join("\n");

      return elem(
        "div",
        { style: cardStyle },
        elem("div", { style: titleStyle }, escapeHtml(item.title)) +
          elem("ul", { style: listStyle }, lis),
      );
    })
    .join("\n");

  return elem("div", { style: gridStyle }, items);
}

function renderBadges(block: BadgesBlock, preset: StylePreset): string {
  const containerStyle = inlineStyle({
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginBottom: preset.blockGap,
  });

  const badges = block.items
    .map((b) => renderBadgeInline(b.text, b.variant ?? "neutral"))
    .join("\n");

  return elem("div", { style: containerStyle }, badges);
}

function renderMetadata(block: MetadataBlock, preset: StylePreset): string {
  const containerStyle = inlineStyle({
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem 2rem",
    fontSize: "0.85rem",
    color: "var(--muted)",
    marginBottom: preset.blockGap,
  });

  const items = block.items
    .map((item) => {
      const labelStyle = inlineStyle({
        fontWeight: "600",
        color: "var(--muted)",
        marginRight: "0.375rem",
      });
      return (
        elem("span", { style: labelStyle }, escapeHtml(item.label)) +
        elem("span", { style: "color:var(--fg)" }, escapeHtml(item.value))
      );
    })
    .map((html) => elem("span", {}, html))
    .join(
      elem(
        "span",
        { style: "color:var(--border);margin:0 0.25rem" },
        "&#x7C;",
      ),
    );

  return elem("div", { style: containerStyle }, items);
}

function renderHeroStats(block: HeroStatsBlock, preset: StylePreset): string {
  const columns = Math.min(block.stats.length, 4);
  const gridStyle = inlineStyle({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: "1.25rem",
    marginBottom: preset.blockGap,
  });

  const cards = block.stats
    .map((stat) => {
      const accentColor = sanitizeCssValue(stat.color ?? "var(--accent)");

      const cardStyle = inlineStyle({
        borderRadius: preset.card.borderRadius,
        border: preset.card.border !== "none" ? preset.card.border : "1px solid var(--border)",
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : undefined,
        padding: "0",
        background: preset.card.background,
        overflow: "hidden",
        textAlign: "center",
      });

      // Colored top accent bar
      const accentBarStyle = inlineStyle({
        height: "4px",
        background: accentColor,
      });

      const innerStyle = inlineStyle({
        padding: "1.5rem 1rem 1.25rem",
      });

      const valueStyle = inlineStyle({
        fontSize: "2.5rem",
        fontWeight: "800",
        color: accentColor,
        lineHeight: "1.1",
      });

      const labelStyle = inlineStyle({
        fontSize: "0.85rem",
        color: "var(--muted)",
        marginTop: "0.375rem",
      });

      let content = elem("div", { style: accentBarStyle }, "");
      let inner = elem("div", { style: valueStyle }, escapeHtml(stat.value));
      inner += elem("div", { style: labelStyle }, escapeHtml(stat.label));

      if (stat.subtitle) {
        const subStyle = inlineStyle({
          fontSize: "0.8rem",
          color: "var(--muted)",
          marginTop: "0.75rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid var(--border)",
        });
        inner += elem("div", { style: subStyle }, escapeHtml(stat.subtitle));
      }

      content += elem("div", { style: innerStyle }, inner);
      return elem("div", { style: cardStyle }, content);
    })
    .join("\n");

  return elem("div", { style: gridStyle }, cards);
}

function renderDivider(block: DividerBlock, preset: StylePreset): string {
  if (block.gradient) {
    const h = block.height ?? 3;
    const style = inlineStyle({
      border: "none",
      height: `${h}px`,
      background: `linear-gradient(to right, ${sanitizeCssValue(block.gradient)})`,
      borderRadius: `${h}px`,
      margin: `${preset.blockGap} 0`,
    });
    return `<div${styleAttr(style)}></div>`;
  }

  if (block.color) {
    const h = block.height ?? 2;
    const style = inlineStyle({
      border: "none",
      height: `${h}px`,
      background: sanitizeCssValue(block.color),
      borderRadius: `${h}px`,
      margin: `${preset.blockGap} 0`,
    });
    return `<div${styleAttr(style)}></div>`;
  }

  const style = inlineStyle({
    border: "none",
    borderTop: "1px solid var(--border)",
    margin: `${preset.blockGap} 0`,
  });
  return `<hr${styleAttr(style)} />`;
}

function renderRawHtml(block: RawHtmlBlock, _preset: StylePreset): string {
  // Escape hatch: allow layout HTML but sanitize dangerous content.
  // Uses the same allowlist approach as sanitizeInlineHtml, extended with
  // block-level elements safe for report layouts.
  return sanitizeBlockHtml(block.content);
}

// ---------------------------------------------------------------------------
// Inline badge helper (shared by badges, timeline, card_grid)
// ---------------------------------------------------------------------------

function renderBadgeInline(text: string, variant: string): string {
  const colors = BADGE_COLORS[variant] ?? BADGE_COLORS.neutral;
  const style = inlineStyle({
    display: "inline-block",
    fontSize: "0.7rem",
    fontWeight: "600",
    padding: "0.15rem 0.5rem",
    borderRadius: "9999px",
    background: colors.bg,
    color: colors.fg,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  });
  return elem("span", { style }, escapeHtml(text));
}

// ---------------------------------------------------------------------------
// Block dispatcher
// ---------------------------------------------------------------------------

/**
 * Render a single block to HTML using the appropriate component renderer.
 */
export function renderBlock(block: Block, preset: StylePreset): string {
  switch (block.type) {
    case "section":
      return renderSection(block, preset);
    case "heading":
      return renderHeading(block, preset);
    case "paragraph":
      return renderParagraph(block, preset);
    case "list":
      return renderList(block, preset);
    case "callout":
      return renderCallout(block, preset);
    case "stat_cards":
      return renderStatCards(block, preset);
    case "table":
      return renderTable(block, preset);
    case "bar_chart":
      return renderBarChart(block, preset);
    case "line_chart":
      return renderLineChart(block, preset);
    case "pie_chart":
      return renderPieChart(block, preset);
    case "progress_bars":
      return renderProgressBars(block, preset);
    case "timeline":
      return renderTimeline(block, preset);
    case "card_grid":
      return renderCardGrid(block, preset);
    case "comparison":
      return renderComparison(block, preset);
    case "badges":
      return renderBadges(block, preset);
    case "metadata":
      return renderMetadata(block, preset);
    case "hero_stats":
      return renderHeroStats(block, preset);
    case "divider":
      return renderDivider(block, preset);
    case "html":
      return renderRawHtml(block, preset);
    default: {
      // Exhaustive check: if a new block type is added, TypeScript will catch it
      const _exhaustive: never = block;
      return `<!-- unknown block type: ${(_exhaustive as Block).type} -->`;
    }
  }
}
