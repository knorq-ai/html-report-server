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
  BeforeAfterBlock,
  StepsBlock,
  ComparisonMatrixBlock,
  SectionedTableBlock,
  RelationshipGraphBlock,
  MatrixColumn,
  MatrixCellValue,
  StylePreset,
} from "./types.js";
import { inlineStyle, styleAttr } from "./theme.js";
import { escapeHtml, sanitizeInlineHtml, sanitizeBlockHtml, sanitizeCssValue, elem } from "./html-utils.js";
import { renderBarChart, renderLineChart, renderPieChart } from "./charts.js";
import { renderDiagram } from "./diagrams.js";
import { renderRelationshipGraph } from "./graph.js";

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
// Callout variant → accent color / background
// ---------------------------------------------------------------------------

const CALLOUT_ACCENTS: Record<string, string> = {
  info: "var(--accent)",
  warning: "var(--warning)",
  success: "var(--success)",
  danger: "var(--danger)",
};

const CALLOUT_BACKGROUNDS: Record<string, string> = {
  info: "var(--info-light)",
  warning: "var(--warning-light)",
  success: "var(--success-light)",
  danger: "var(--danger-light)",
};

// ---------------------------------------------------------------------------
// Highlight color resolver (for comparison blocks)
// ---------------------------------------------------------------------------

const HIGHLIGHT_COLORS: Record<string, string> = {
  accent: "var(--accent)",
  purple: "var(--purple)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

function resolveHighlightColor(highlight?: boolean | string): string | null {
  if (!highlight) return null;
  if (highlight === true) return "var(--accent)";
  return sanitizeCssValue(HIGHLIGHT_COLORS[highlight] ?? highlight);
}

const HIGHLIGHT_BG: Record<string, string> = {
  accent: "var(--accent-light)",
  purple: "var(--purple-light)",
  success: "var(--success-light)",
  warning: "var(--warning-light)",
  danger: "var(--danger-light)",
};

function resolveHighlightBg(highlight?: boolean | string): string | null {
  if (!highlight) return null;
  if (highlight === true) return "var(--accent-light)";
  if (typeof highlight === "string") {
    return HIGHLIGHT_BG[highlight] ?? null;
  }
  return null;
}

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
  const containerStyle = inlineStyle({
    marginTop: preset.sectionGap,
    marginBottom: "1.5rem",
  });

  // Detect "01 · TITLE" or "01 - TITLE" pattern for eyebrow badge
  const isNumberedSection = /^\d{1,3}\s*[·\-–]/.test(block.title);

  let html: string;
  if (isNumberedSection) {
    // Eyebrow badge with section number — full title goes in the pill
    const eyebrowStyle = inlineStyle({
      display: "inline-flex",
      alignItems: "center",
      marginBottom: "0.4rem",
    });
    const numStyle = inlineStyle({
      fontSize: "0.6rem",
      fontWeight: "800",
      letterSpacing: "0.1em",
      color: "var(--accent)",
      textTransform: "uppercase",
      background: "var(--accent-light)",
      padding: "0.2rem 0.65rem",
      borderRadius: "4px",
    });

    html = elem("div", { style: eyebrowStyle }, elem("span", { style: numStyle }, escapeHtml(block.title)));

    // Subtitle becomes the main heading when using eyebrow pattern
    if (block.subtitle) {
      const titleStyle = inlineStyle({
        fontSize: "1.2rem",
        fontWeight: "800",
        color: "var(--fg)",
        letterSpacing: "-0.015em",
        lineHeight: "1.3",
      });
      html += elem("h2", { style: titleStyle }, escapeHtml(block.subtitle));
      // Mark subtitle as already rendered
      block = { ...block, subtitle: undefined };
    }
  } else {
    // Fallback: original section style
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
    });
    html = elem("div", { style: titleStyle }, escapeHtml(block.title));
  }

  if (block.subtitle) {
    const subStyle = inlineStyle({
      fontSize: "0.875rem",
      color: "var(--muted)",
      marginTop: "0.2rem",
    });
    html += elem("div", { style: subStyle }, escapeHtml(block.subtitle));
  }

  // Thin rule (only for eyebrow sections or when preset has a border)
  if (isNumberedSection || preset.sectionTitle.borderBottom !== "none") {
    const ruleStyle = inlineStyle({
      height: "1px",
      background: "var(--border)",
      margin: "0.875rem 0 0",
    });
    html += elem("div", { style: ruleStyle }, "");
  }

  return elem("div", { style: containerStyle }, html);
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
  const variant = block.variant ?? "info";
  const accent = CALLOUT_ACCENTS[variant] ?? CALLOUT_ACCENTS.info;
  const bg = CALLOUT_BACKGROUNDS[variant] ?? "var(--code-bg)";
  const style = inlineStyle({
    borderLeft: `4px solid ${accent}`,
    borderRadius: preset.card.borderRadius,
    background: bg,
    padding: "1rem 1.25rem",
    marginBottom: preset.blockGap,
  });

  let content = "";
  if (block.title) {
    const titleStyle = inlineStyle({
      fontWeight: "700",
      marginBottom: "0.35rem",
      color: "var(--fg)",
      fontSize: "0.875rem",
    });
    content += elem("div", { style: titleStyle }, escapeHtml(block.title));
  }
  // Callout text supports inline HTML (bold, links) — sanitized to an allowlist
  content += elem(
    "div",
    { style: "color:var(--fg);line-height:1.72;font-size:0.845rem;white-space:pre-line" },
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
    boxShadow: "var(--shadow-sm)",
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
    padding: "0.7rem 1rem",
    textAlign: "left",
    fontWeight: "700",
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    borderBottom: `2px solid var(--border)`,
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
            padding: "0.6rem 1rem",
            borderBottom: "1px solid var(--border)",
            background: rowBg,
            lineHeight: "1.5",
            verticalAlign: "top",
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
      fontSize: "0.75rem",
      color: "var(--muted)",
      marginTop: "-0.5rem",
      marginBottom: preset.blockGap,
      textAlign: "center",
      padding: "0.4rem 0",
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
    paddingLeft: "2.5rem",
    marginBottom: preset.blockGap,
  });

  // Vertical line
  const lineStyle = inlineStyle({
    position: "absolute",
    left: "0.625rem",
    top: "0.5rem",
    bottom: "0.5rem",
    width: "2px",
    background: "linear-gradient(to bottom, var(--accent) 0%, var(--border) 100%)",
    borderRadius: "2px",
  });

  const entries = block.entries
    .map((entry) => {
      const dotColor = sanitizeCssValue(entry.color ?? "var(--accent)");

      const entryStyle = inlineStyle({
        position: "relative",
        marginBottom: "1.5rem",
      });

      // Dot
      const dotStyle = inlineStyle({
        position: "absolute",
        left: "-1.975rem",
        top: "0.3rem",
        width: "13px",
        height: "13px",
        borderRadius: "50%",
        background: dotColor,
        border: "2.5px solid var(--bg)",
        boxShadow: `0 0 0 2px ${dotColor}`,
      });

      const dateStyle = inlineStyle({
        fontSize: "0.68rem",
        fontWeight: "800",
        color: dotColor,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        marginBottom: "0.1rem",
      });

      const titleStyle = inlineStyle({
        fontWeight: "700",
        color: "var(--fg)",
        fontSize: "0.92rem",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "6px",
        marginBottom: "0.2rem",
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
          fontSize: "0.84rem",
          color: "var(--muted)",
          marginTop: "0.125rem",
          lineHeight: "1.55",
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
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : "var(--shadow-sm)",
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
        fontWeight: "700",
        color: "var(--fg)",
        fontSize: "0.9rem",
        marginBottom: "0.45rem",
        marginTop: card.badge ? "0.5rem" : undefined,
      });
      content += elem("div", { style: titleStyle }, escapeHtml(card.title));

      const bodyStyle = inlineStyle({
        fontSize: "0.84rem",
        color: "var(--muted)",
        lineHeight: "1.65",
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
      const hlColor = resolveHighlightColor(item.highlight);
      const hlBg = resolveHighlightBg(item.highlight);

      const cardStyle = inlineStyle({
        borderRadius: preset.card.borderRadius,
        border: hlColor
          ? `2px solid ${hlColor}`
          : preset.card.border !== "none"
            ? preset.card.border
            : "1px solid var(--border)",
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : "var(--shadow-sm)",
        padding: preset.card.padding,
        background: hlBg ?? preset.card.background,
      });

      const titleStyle = inlineStyle({
        fontWeight: "700",
        fontSize: "0.9rem",
        color: "var(--fg)",
        marginBottom: "0.875rem",
        paddingBottom: "0.625rem",
        borderBottom: "1px solid var(--border)",
      });

      const listStyle = inlineStyle({
        listStyle: "none",
        padding: "0",
        margin: "0",
      });

      const bulletColor = hlColor ?? "var(--accent)";
      const lis = item.points
        .map((pt) => {
          const liStyle = inlineStyle({
            padding: "0.28rem 0",
            fontSize: "0.84rem",
            color: "var(--fg)",
            lineHeight: "1.55",
            display: "flex",
            gap: "0.45rem",
          });
          return elem(
            "li",
            { style: liStyle },
            elem("span", { style: `color:${sanitizeCssValue(bulletColor)};font-weight:800;flex-shrink:0;line-height:1.55` }, "&#x203A;") +
              elem("span", {}, escapeHtml(pt)),
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
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : "var(--shadow-sm)",
        padding: "0",
        background: preset.card.background,
        overflow: "hidden",
        textAlign: "center",
      });

      // Colored top accent bar
      const accentBarStyle = inlineStyle({
        height: "5px",
        background: `linear-gradient(to right, ${accentColor}, ${accentColor}80)`,
      });

      const innerStyle = inlineStyle({
        padding: "1.5rem 1rem 1.25rem",
      });

      const valueStyle = inlineStyle({
        fontSize: "1.95rem",
        fontWeight: "900",
        color: accentColor,
        lineHeight: "1.1",
        letterSpacing: "-0.04em",
      });

      const labelStyle = inlineStyle({
        fontSize: "0.8rem",
        color: "var(--fg)",
        fontWeight: "600",
        marginTop: "0.4rem",
      });

      let content = elem("div", { style: accentBarStyle }, "");
      let inner = elem("div", { style: valueStyle }, escapeHtml(stat.value));
      inner += elem("div", { style: labelStyle }, escapeHtml(stat.label));

      if (stat.subtitle) {
        const subStyle = inlineStyle({
          fontSize: "0.72rem",
          color: "var(--muted)",
          marginTop: "0.75rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid var(--border)",
          lineHeight: "1.4",
        });
        inner += elem("div", { style: subStyle }, escapeHtml(stat.subtitle));
      }

      content += elem("div", { style: innerStyle }, inner);

      // Breakdown rows
      if (stat.breakdown && stat.breakdown.length > 0) {
        const breakdownStyle = inlineStyle({
          padding: "0 1rem 1rem",
        });
        const dividerStyle = inlineStyle({
          height: "1px",
          background: "var(--border)",
          margin: "0 0 0.625rem",
        });

        let breakdownHtml = elem("div", { style: dividerStyle }, "");

        for (const row of stat.breakdown) {
          const rowStyle = inlineStyle({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "0.5rem",
            padding: "0.22rem 0",
            fontSize: "0.76rem",
            lineHeight: "1.4",
            ...(row.struck ? { opacity: "0.5" } : {}),
          });
          const nameStyle = inlineStyle({
            color: "var(--muted)",
            flex: "1",
            minWidth: "0",
            textAlign: "left",
          });
          const amtStyle = inlineStyle({
            color: row.struck ? "var(--muted)" : "var(--fg)",
            fontWeight: "600",
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
            ...(row.struck ? { textDecoration: "line-through", textDecorationColor: "var(--border)" } : {}),
          });
          breakdownHtml += elem(
            "div",
            { style: rowStyle },
            elem("span", { style: nameStyle }, escapeHtml(row.label)) +
              elem("span", { style: amtStyle }, escapeHtml(row.value)),
          );
        }

        if (stat.breakdownTotal) {
          const parts = stat.breakdownTotal.split("|");
          const totalLabel = parts.length > 1 ? parts[0].trim() : "合計";
          const totalValue = parts.length > 1 ? parts[1].trim() : stat.breakdownTotal;

          const totalStyle = inlineStyle({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "0.5rem",
            padding: "0.5rem 0 0",
            marginTop: "0.25rem",
            borderTop: "1px solid var(--border)",
            fontSize: "0.78rem",
            fontWeight: "700",
            color: "var(--fg)",
          });
          breakdownHtml += elem(
            "div",
            { style: totalStyle },
            elem("span", {}, escapeHtml(totalLabel)) +
              elem("span", { style: inlineStyle({ fontSize: "0.82rem" }) }, escapeHtml(totalValue)),
          );
        }

        content += elem("div", { style: breakdownStyle }, breakdownHtml);
      }

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
    fontSize: "0.6rem",
    fontWeight: "800",
    padding: "0.15rem 0.55rem",
    borderRadius: "9999px",
    background: colors.bg,
    color: colors.fg,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  });
  return elem("span", { style }, escapeHtml(text));
}

// ---------------------------------------------------------------------------
// Before/After comparison cards
// ---------------------------------------------------------------------------

function renderBeforeAfter(
  block: BeforeAfterBlock,
  preset: StylePreset,
): string {
  const cardsHtml = block.items
    .map((item) => {
      const cardStyle = inlineStyle({
        borderRadius: preset.card.borderRadius,
        border: preset.card.border !== "none" ? preset.card.border : undefined,
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : undefined,
        padding: preset.card.padding,
        background: preset.card.background,
        marginBottom: "1rem",
      });

      // Header: title + improvement badge
      const headerStyle = inlineStyle({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "0.75rem",
      });

      const titleStyle = inlineStyle({
        fontWeight: "600",
        color: "var(--fg)",
        fontSize: "1rem",
      });

      let headerContent = elem("div", { style: titleStyle }, escapeHtml(item.title));

      if (item.improvement) {
        const badgeStyle = inlineStyle({
          display: "inline-block",
          fontSize: "0.75rem",
          fontWeight: "600",
          padding: "0.2rem 0.625rem",
          borderRadius: "9999px",
          background: "#dcfce7",
          color: "var(--success)",
        });
        headerContent += elem(
          "span",
          { style: badgeStyle },
          `&#x25BC; ${escapeHtml(item.improvement)}`,
        );
      }

      const header = elem("div", { style: headerStyle }, headerContent);

      // Shared label width
      const labelWidth = "120px";

      // Scale both bars relative to the larger value
      const beforeValue = item.before.value;
      const afterValue = item.after.value;
      const maxValue = Math.max(Math.abs(beforeValue), Math.abs(afterValue), 1);
      const beforePct = (Math.abs(beforeValue) / maxValue) * 100;
      const afterPct = (Math.abs(afterValue) / maxValue) * 100;

      // Helper to build a bar row
      const buildRow = (
        label: string,
        value: number,
        unit: string,
        widthPct: number,
        barBg: string,
        valueFg: string,
        marginBottom?: string,
      ) => {
        const rowStyle = inlineStyle({
          display: "flex",
          alignItems: "center",
          marginBottom,
        });
        const lblStyle = inlineStyle({
          width: labelWidth,
          minWidth: labelWidth,
          textAlign: "right",
          paddingRight: "0.75rem",
          fontSize: "0.8rem",
          color: "var(--muted)",
        });
        const wrapStyle = inlineStyle({
          flex: "1",
          display: "flex",
          alignItems: "center",
        });
        const barStyle = inlineStyle({
          width: `${Math.max(widthPct, 6)}%`,
          height: "28px",
          background: barBg,
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: "0.5rem",
        });
        const valStyle = inlineStyle({
          fontWeight: "600",
          fontSize: "0.85rem",
          color: valueFg,
        });
        const valText = `${value}${escapeHtml(unit)}`;
        return elem(
          "div",
          { style: rowStyle },
          elem("div", { style: lblStyle }, escapeHtml(label)) +
            elem(
              "div",
              { style: wrapStyle },
              elem(
                "div",
                { style: barStyle },
                elem("span", { style: valStyle }, valText),
              ),
            ),
        );
      };

      const beforeRow = buildRow(
        item.before.label,
        item.before.value,
        item.before.unit ?? "",
        beforePct,
        "var(--border)",
        "var(--fg)",
        "0.5rem",
      );

      const afterRow = buildRow(
        item.after.label,
        item.after.value,
        item.after.unit ?? "",
        afterPct,
        "linear-gradient(90deg, var(--success), #86efac)",
        "var(--success)",
      );

      return elem("div", { style: cardStyle }, header + beforeRow + afterRow);
    })
    .join("\n");

  return elem(
    "div",
    { style: inlineStyle({ marginBottom: preset.blockGap }) },
    cardsHtml,
  );
}

// ---------------------------------------------------------------------------
// Steps (horizontal process flow)
// ---------------------------------------------------------------------------

function renderSteps(block: StepsBlock, preset: StylePreset): string {
  const containerStyle = inlineStyle({
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    overflowX: "auto",
    marginBottom: preset.blockGap,
  });

  const items = block.steps
    .map((step, i) => {
      const label = step.label ?? `STEP ${i + 1}`;

      // Arrow chevron between steps
      let arrow = "";
      if (i > 0) {
        const arrowStyle = inlineStyle({
          color: "var(--muted)",
          fontSize: "1.5rem",
          lineHeight: "1",
          userSelect: "none",
        });
        arrow = elem("span", { style: arrowStyle }, "&#x276F;");
      }

      // Step card
      const cardStyle = inlineStyle({
        flex: "1 0 140px",
        borderRadius: preset.card.borderRadius,
        border: preset.card.border !== "none" ? preset.card.border : undefined,
        boxShadow: preset.card.boxShadow !== "none" ? preset.card.boxShadow : undefined,
        padding: preset.card.padding,
        background: preset.card.background,
      });

      const labelStyle = inlineStyle({
        fontSize: "0.7rem",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--accent)",
        marginBottom: "0.25rem",
      });

      const titleStyle = inlineStyle({
        fontWeight: "600",
        fontSize: "1rem",
        color: "var(--fg)",
      });

      let cardContent = elem("div", { style: labelStyle }, escapeHtml(label));
      cardContent += elem("div", { style: titleStyle }, escapeHtml(step.title));

      if (step.description) {
        const descStyle = inlineStyle({
          fontSize: "0.8rem",
          color: "var(--muted)",
          marginTop: "0.25rem",
          lineHeight: "1.4",
        });
        cardContent += elem("div", { style: descStyle }, escapeHtml(step.description));
      }

      return arrow + elem("div", { style: cardStyle }, cardContent);
    })
    .join("\n");

  return elem("div", { style: containerStyle }, items);
}

// ---------------------------------------------------------------------------
// Comparison matrix
// ---------------------------------------------------------------------------

function renderMatrixCell(
  value: MatrixCellValue | undefined,
  col: MatrixColumn,
  preset: StylePreset,
): string {
  const colType = col.type ?? "text";

  if (value === undefined || value === null) {
    return "";
  }

  if (colType === "badge" && typeof value === "object" && !Array.isArray(value)) {
    const v = value.variant ?? "neutral";
    const colors = BADGE_COLORS[v] ?? BADGE_COLORS.neutral;
    const style = inlineStyle({
      display: "inline-block",
      padding: "0.2rem 0.6rem",
      borderRadius: "999px",
      fontSize: "0.72rem",
      fontWeight: "600",
      background: colors.bg,
      color: colors.fg,
      whiteSpace: "nowrap",
    });
    return elem("span", { style }, escapeHtml(value.text));
  }

  if (colType === "tags" && Array.isArray(value)) {
    const containerStyle = inlineStyle({
      display: "flex",
      flexWrap: "wrap",
      gap: "0.3rem",
    });
    const tagStyle = inlineStyle({
      display: "inline-block",
      padding: "0.15rem 0.5rem",
      borderRadius: "4px",
      fontSize: "0.72rem",
      background: "var(--code-bg)",
      color: "var(--fg)",
      whiteSpace: "nowrap",
    });
    const tags = value.map((t) => elem("span", { style: tagStyle }, escapeHtml(t))).join("");
    return elem("div", { style: containerStyle }, tags);
  }

  // Default: text (string value, or fallback)
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return escapeHtml(text);
}

function renderComparisonMatrix(block: ComparisonMatrixBlock, preset: StylePreset): string {
  const ts = preset.table;
  const parts: string[] = [];

  if (block.title) {
    const titleStyle = inlineStyle({
      fontSize: "1rem",
      fontWeight: "700",
      marginBottom: "0.75rem",
      color: "var(--fg)",
    });
    parts.push(elem("div", { style: titleStyle }, escapeHtml(block.title)));
  }

  const wrapperStyle = inlineStyle({
    overflowX: "auto",
    marginBottom: preset.blockGap,
    borderRadius: ts.borderRadius !== "0" ? ts.borderRadius : undefined,
    border: ts.outerBorder,
    boxShadow: "var(--shadow-sm)",
  });

  const tableStyle = inlineStyle({
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.875rem",
  });

  // Headers
  const ths = block.columns
    .map((col) => {
      const thStyle = inlineStyle({
        background: ts.headerBg,
        color: ts.headerColor,
        padding: "0.7rem 1rem",
        textAlign: "left",
        fontWeight: "700",
        fontSize: "0.72rem",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        borderBottom: `2px solid var(--border)`,
        width: col.width,
      });
      return elem("th", { style: thStyle }, escapeHtml(col.label));
    })
    .join("");
  const thead = `<thead><tr>${ths}</tr></thead>`;

  // Rows
  const rows = block.rows
    .map((row, ri) => {
      const rowBg = ts.stripedRows && ri % 2 === 1 ? "var(--code-bg)" : undefined;
      const tds = block.columns
        .map((col) => {
          const tdStyle = inlineStyle({
            padding: "0.6rem 1rem",
            borderBottom: "1px solid var(--border)",
            background: rowBg,
            lineHeight: "1.5",
            verticalAlign: "top",
          });
          const cellHtml = renderMatrixCell(row[col.id], col, preset);
          return elem("td", { style: tdStyle }, cellHtml);
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("\n");
  const tbody = `<tbody>${rows}</tbody>`;

  parts.push(
    elem("div", { style: wrapperStyle },
      elem("table", { style: tableStyle }, thead + tbody)),
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Sectioned table
// ---------------------------------------------------------------------------

function renderSectionedTable(block: SectionedTableBlock, preset: StylePreset): string {
  const ts = preset.table;
  const parts: string[] = [];

  if (block.title) {
    const titleStyle = inlineStyle({
      fontSize: "1.1rem",
      fontWeight: "700",
      marginBottom: "0.75rem",
      color: "var(--fg)",
    });
    parts.push(elem("div", { style: titleStyle }, escapeHtml(block.title)));
  }

  for (const section of block.sections) {
    // Section title
    const sectionTitleStyle = inlineStyle({
      fontSize: "0.85rem",
      fontWeight: "700",
      padding: "0.6rem 1rem",
      background: "var(--code-bg)",
      color: "var(--fg)",
      borderBottom: "1px solid var(--border)",
      marginTop: parts.length > (block.title ? 1 : 0) ? "0.5rem" : undefined,
    });
    parts.push(elem("div", { style: sectionTitleStyle }, escapeHtml(section.title)));

    const wrapperStyle = inlineStyle({
      overflowX: "auto",
      borderRadius: ts.borderRadius !== "0" ? ts.borderRadius : undefined,
      border: ts.outerBorder,
      boxShadow: "var(--shadow-sm)",
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
      padding: "0.6rem 1rem",
      textAlign: "left",
      fontWeight: "700",
      fontSize: "0.72rem",
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      borderBottom: `2px solid var(--border)`,
    });
    const ths = section.headers
      .map((h) => elem("th", { style: thStyle }, escapeHtml(h)))
      .join("");
    const thead = `<thead><tr>${ths}</tr></thead>`;

    // Rows
    const rows = section.rows
      .map((row, ri) => {
        const rowBg = ts.stripedRows && ri % 2 === 1 ? "var(--code-bg)" : undefined;
        const tds = row
          .map((cell) => {
            const tdStyle = inlineStyle({
              padding: "0.5rem 1rem",
              borderBottom: "1px solid var(--border)",
              background: rowBg,
              lineHeight: "1.5",
              verticalAlign: "top",
            });
            return elem("td", { style: tdStyle }, escapeHtml(cell));
          })
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("\n");

    // Subtotal row
    let subtotalHtml = "";
    if (section.subtotal) {
      const sub = section.subtotal;
      // Clamp column index to valid range
      const valueCol = Math.min(sub.column, section.headers.length - 1);
      const subtotalCells = section.headers
        .map((_, ci) => {
          // When value column is 0, show "label  value" in a single cell
          const isValueCol = ci === valueCol;
          let content: string;
          if (ci === 0 && valueCol === 0) {
            content = escapeHtml(sub.label) + `<span style="float:right">${escapeHtml(sub.value)}</span>`;
          } else if (ci === 0) {
            content = escapeHtml(sub.label);
          } else if (isValueCol) {
            content = escapeHtml(sub.value);
          } else {
            content = "";
          }
          const cellStyle = inlineStyle({
            padding: "0.5rem 1rem",
            fontWeight: "700",
            borderTop: "2px solid var(--border)",
            textAlign: isValueCol && valueCol !== 0 ? "right" : "left",
            background: "var(--code-bg)",
          });
          return elem("td", { style: cellStyle }, content);
        })
        .join("");
      subtotalHtml = `<tr>${subtotalCells}</tr>`;
    }

    const tbody = `<tbody>${rows}${subtotalHtml}</tbody>`;
    parts.push(elem("div", { style: wrapperStyle }, elem("table", { style: tableStyle }, thead + tbody)));
  }

  // Grand total
  if (block.grandTotal) {
    const gtStyle = inlineStyle({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0.75rem 1rem",
      fontWeight: "700",
      fontSize: "1rem",
      borderTop: "3px solid var(--fg)",
      marginTop: "0.25rem",
      color: "var(--fg)",
    });
    parts.push(
      elem("div", { style: gtStyle },
        elem("span", {}, escapeHtml(block.grandTotal.label)) +
        elem("span", {}, escapeHtml(block.grandTotal.value)),
      ),
    );
  }

  const containerStyle = inlineStyle({
    marginBottom: preset.blockGap,
  });
  return elem("div", { style: containerStyle }, parts.join("\n"));
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
    case "diagram":
      return renderDiagram(block, preset);
    case "before_after":
      return renderBeforeAfter(block, preset);
    case "steps":
      return renderSteps(block, preset);
    case "comparison_matrix":
      return renderComparisonMatrix(block, preset);
    case "sectioned_table":
      return renderSectionedTable(block, preset);
    case "relationship_graph":
      return renderRelationshipGraph(block, preset);
    default: {
      // Exhaustive check: if a new block type is added, TypeScript will catch it
      const _exhaustive: never = block;
      return `<!-- unknown block type: ${(_exhaustive as Block).type} -->`;
    }
  }
}
