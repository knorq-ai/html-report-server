/**
 * SVG chart generation — bar, line, pie/donut charts.
 *
 * All charts render as inline SVG with CSS variable colors.
 * No external dependencies — pure string-based SVG construction.
 */

import type {
  BarChartBlock,
  LineChartBlock,
  PieChartBlock,
  StylePreset,
} from "./types.js";
import { escapeHtml, sanitizeCssValue, elem } from "./html-utils.js";
import { inlineStyle } from "./theme.js";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const CHART_PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
const LABEL_FONT_SIZE = 11;
const TITLE_FONT_SIZE = 13;

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

export function renderBarChart(
  block: BarChartBlock,
  preset: StylePreset,
): string {
  const { data, title, unit, horizontal } = block;
  if (data.length === 0) return "";

  const palette = preset.chart.palette;
  const height = preset.chart.height;
  const width = 600;
  const barRadius = preset.chart.barRadius;

  if (horizontal) {
    return renderHorizontalBarChart(
      data,
      title,
      unit,
      palette,
      width,
      height,
      barRadius,
      preset,
    );
  }

  const plotLeft = CHART_PADDING.left;
  const plotRight = width - CHART_PADDING.right;
  const plotTop = title ? CHART_PADDING.top + 20 : CHART_PADDING.top;
  const plotBottom = height - CHART_PADDING.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.min(
    plotWidth / data.length - 8,
    60,
  );
  const barGap = (plotWidth - barWidth * data.length) / (data.length + 1);

  const parts: string[] = [];

  // Title
  if (title) {
    parts.push(
      `<text x="${width / 2}" y="${CHART_PADDING.top}" ` +
        `text-anchor="middle" font-size="${TITLE_FONT_SIZE}" ` +
        `font-weight="600" fill="var(--fg)">${escapeHtml(title)}</text>`,
    );
  }

  // Grid lines (4 horizontal)
  for (let i = 0; i <= 4; i++) {
    const y = plotTop + (plotHeight * i) / 4;
    const val = maxVal * (1 - i / 4);
    parts.push(
      `<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" ` +
        `stroke="${preset.chart.gridColor}" stroke-width="0.5" />`,
    );
    parts.push(
      `<text x="${plotLeft - 8}" y="${y + 4}" text-anchor="end" ` +
        `font-size="${LABEL_FONT_SIZE}" fill="${preset.chart.labelColor}">` +
        `${formatNumber(val)}${unit ? " " + escapeHtml(unit) : ""}</text>`,
    );
  }

  // Bars
  data.forEach((d, i) => {
    const x = plotLeft + barGap + i * (barWidth + barGap);
    const barH = (d.value / maxVal) * plotHeight;
    const y = plotTop + plotHeight - barH;
    const color = d.color ? sanitizeCssValue(d.color) : palette[i % palette.length];

    if (barRadius > 0) {
      const r = Math.min(barRadius, barWidth / 2, barH / 2);
      parts.push(
        `<path d="${roundedTopRect(x, y, barWidth, barH, r)}" fill="${color}" />`,
      );
    } else {
      parts.push(
        `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${color}" />`,
      );
    }

    // Label
    parts.push(
      `<text x="${x + barWidth / 2}" y="${plotBottom + 16}" text-anchor="middle" ` +
        `font-size="${LABEL_FONT_SIZE}" fill="${preset.chart.labelColor}">` +
        `${escapeHtml(d.label)}</text>`,
    );
  });

  const svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" ` +
    `role="img" aria-label="${escapeHtml(title ?? "Bar chart")}">\n${parts.join("\n")}\n</svg>`;

  return wrapChart(svg, preset);
}

function renderHorizontalBarChart(
  data: BarChartBlock["data"],
  title: string | undefined,
  unit: string | undefined,
  palette: string[],
  width: number,
  height: number,
  barRadius: number,
  preset: StylePreset,
): string {
  // Adjust height to fit bars
  const barHeight = 28;
  const barGap = 8;
  const plotTop = title ? CHART_PADDING.top + 24 : CHART_PADDING.top;
  const labelWidth = 100;
  const plotLeft = labelWidth + 10;
  const plotRight = width - CHART_PADDING.right;
  const plotWidth = plotRight - plotLeft;
  const calcHeight = plotTop + data.length * (barHeight + barGap) + 20;
  const svgHeight = Math.max(height, calcHeight);

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const parts: string[] = [];

  if (title) {
    parts.push(
      `<text x="${width / 2}" y="${CHART_PADDING.top}" ` +
        `text-anchor="middle" font-size="${TITLE_FONT_SIZE}" ` +
        `font-weight="600" fill="var(--fg)">${escapeHtml(title)}</text>`,
    );
  }

  data.forEach((d, i) => {
    const y = plotTop + i * (barHeight + barGap);
    const barW = (d.value / maxVal) * plotWidth;
    const color = d.color ? sanitizeCssValue(d.color) : palette[i % palette.length];

    // Label
    parts.push(
      `<text x="${labelWidth}" y="${y + barHeight / 2 + 4}" text-anchor="end" ` +
        `font-size="${LABEL_FONT_SIZE}" fill="${preset.chart.labelColor}">` +
        `${escapeHtml(d.label)}</text>`,
    );

    // Bar
    if (barRadius > 0) {
      const r = Math.min(barRadius, barHeight / 2, barW / 2);
      parts.push(
        `<path d="${roundedRightRect(plotLeft, y, barW, barHeight, r)}" fill="${color}" />`,
      );
    } else {
      parts.push(
        `<rect x="${plotLeft}" y="${y}" width="${barW}" height="${barHeight}" fill="${color}" />`,
      );
    }

    // Value label
    parts.push(
      `<text x="${plotLeft + barW + 6}" y="${y + barHeight / 2 + 4}" ` +
        `font-size="${LABEL_FONT_SIZE}" fill="${preset.chart.labelColor}">` +
        `${formatNumber(d.value)}${unit ? " " + escapeHtml(unit) : ""}</text>`,
    );
  });

  const svg = `<svg viewBox="0 0 ${width} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" ` +
    `role="img" aria-label="${escapeHtml(title ?? "Bar chart")}">\n${parts.join("\n")}\n</svg>`;

  return wrapChart(svg, preset);
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

export function renderLineChart(
  block: LineChartBlock,
  preset: StylePreset,
): string {
  const { series, title, unit } = block;
  if (series.length === 0) return "";

  const palette = preset.chart.palette;
  const height = preset.chart.height;
  const width = 600;

  const plotLeft = CHART_PADDING.left;
  const plotRight = width - CHART_PADDING.right;
  const plotTop = title ? CHART_PADDING.top + 20 : CHART_PADDING.top;
  const plotBottom = height - CHART_PADDING.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // Collect all y-values to find the range
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of series) {
    for (const p of s.data) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  // Use all x labels from the first series (or longest series)
  const longestSeries = series.reduce(
    (a, b) => (a.data.length >= b.data.length ? a : b),
    series[0],
  );
  const xLabels = longestSeries.data.map((p) => p.x);
  const xCount = xLabels.length;

  const parts: string[] = [];

  // Title
  if (title) {
    parts.push(
      `<text x="${width / 2}" y="${CHART_PADDING.top}" ` +
        `text-anchor="middle" font-size="${TITLE_FONT_SIZE}" ` +
        `font-weight="600" fill="var(--fg)">${escapeHtml(title)}</text>`,
    );
  }

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = plotTop + (plotHeight * i) / 4;
    const val = maxY - (maxY - minY) * (i / 4);
    parts.push(
      `<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" ` +
        `stroke="${preset.chart.gridColor}" stroke-width="0.5" />`,
    );
    parts.push(
      `<text x="${plotLeft - 8}" y="${y + 4}" text-anchor="end" ` +
        `font-size="${LABEL_FONT_SIZE}" fill="${preset.chart.labelColor}">` +
        `${formatNumber(val)}${unit ? " " + escapeHtml(unit) : ""}</text>`,
    );
  }

  // X labels
  xLabels.forEach((label, i) => {
    const x = xCount > 1
      ? plotLeft + (plotWidth * i) / (xCount - 1)
      : plotLeft + plotWidth / 2;
    parts.push(
      `<text x="${x}" y="${plotBottom + 16}" text-anchor="middle" ` +
        `font-size="${LABEL_FONT_SIZE}" fill="${preset.chart.labelColor}">` +
        `${escapeHtml(label)}</text>`,
    );
  });

  // Series lines
  series.forEach((s, si) => {
    const color = palette[si % palette.length];
    const points = s.data.map((p, pi) => {
      const x = s.data.length > 1
        ? plotLeft + (plotWidth * pi) / (s.data.length - 1)
        : plotLeft + plotWidth / 2;
      const y = plotTop + plotHeight - ((p.y - minY) / (maxY - minY)) * plotHeight;
      return `${x},${y}`;
    });

    parts.push(
      `<polyline points="${points.join(" ")}" ` +
        `fill="none" stroke="${color}" stroke-width="${preset.chart.strokeWidth}" ` +
        `stroke-linejoin="round" stroke-linecap="round" />`,
    );

    // Dots
    s.data.forEach((p, pi) => {
      const x = s.data.length > 1
        ? plotLeft + (plotWidth * pi) / (s.data.length - 1)
        : plotLeft + plotWidth / 2;
      const y = plotTop + plotHeight - ((p.y - minY) / (maxY - minY)) * plotHeight;
      parts.push(
        `<circle cx="${x}" cy="${y}" r="3" fill="${color}" />`,
      );
    });
  });

  // Legend (if multiple series)
  if (series.length > 1) {
    const legendY = plotBottom + 30;
    let legendX = plotLeft;
    series.forEach((s, si) => {
      const color = palette[si % palette.length];
      parts.push(
        `<rect x="${legendX}" y="${legendY - 6}" width="12" height="4" ` +
          `rx="2" fill="${color}" />`,
      );
      parts.push(
        `<text x="${legendX + 16}" y="${legendY}" font-size="10" ` +
          `fill="${preset.chart.labelColor}">${escapeHtml(s.name)}</text>`,
      );
      legendX += 16 + s.name.length * 6 + 16;
    });
  }

  const svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" ` +
    `role="img" aria-label="${escapeHtml(title ?? "Line chart")}">\n${parts.join("\n")}\n</svg>`;

  return wrapChart(svg, preset);
}

// ---------------------------------------------------------------------------
// Pie / donut chart
// ---------------------------------------------------------------------------

export function renderPieChart(
  block: PieChartBlock,
  preset: StylePreset,
): string {
  const { data, title, donut } = block;
  if (data.length === 0) return "";

  const palette = preset.chart.palette;
  const size = 300;
  const cx = size / 2;
  const titleOffset = title ? 20 : 0;
  const cy = size / 2 + titleOffset / 2;
  const outerR = (size - 80) / 2;
  const innerR = donut ? outerR * 0.55 : 0;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return "";

  const parts: string[] = [];

  if (title) {
    parts.push(
      `<text x="${cx}" y="16" text-anchor="middle" font-size="${TITLE_FONT_SIZE}" ` +
        `font-weight="600" fill="var(--fg)">${escapeHtml(title)}</text>`,
    );
  }

  let angle = -Math.PI / 2; // start at top

  data.forEach((d, i) => {
    const sliceAngle = (d.value / total) * Math.PI * 2;
    const startAngle = angle;
    const endAngle = angle + sliceAngle;
    const color = d.color ? sanitizeCssValue(d.color) : palette[i % palette.length];

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    let path: string;
    if (innerR > 0) {
      const ix1 = cx + innerR * Math.cos(endAngle);
      const iy1 = cy + innerR * Math.sin(endAngle);
      const ix2 = cx + innerR * Math.cos(startAngle);
      const iy2 = cy + innerR * Math.sin(startAngle);
      path =
        `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} ` +
        `L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
    } else {
      path =
        `M ${cx} ${cy} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    parts.push(`<path d="${path}" fill="${color}" />`);

    // Label at midpoint
    const midAngle = startAngle + sliceAngle / 2;
    const labelR = outerR + 18;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const anchor = Math.cos(midAngle) < -0.1 ? "end" : Math.cos(midAngle) > 0.1 ? "start" : "middle";
    const pct = Math.round((d.value / total) * 100);

    if (pct >= 3) {
      parts.push(
        `<text x="${lx}" y="${ly + 4}" text-anchor="${anchor}" ` +
          `font-size="10" fill="${preset.chart.labelColor}">` +
          `${escapeHtml(d.label)} ${pct}%</text>`,
      );
    }

    angle = endAngle;
  });

  const svgHeight = size + titleOffset;
  const svg = `<svg viewBox="0 0 ${size} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" ` +
    `role="img" aria-label="${escapeHtml(title ?? "Pie chart")}">\n${parts.join("\n")}\n</svg>`;

  return wrapChart(svg, preset);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapChart(svg: string, _preset: StylePreset): string {
  return elem("div", { style: "margin:0 auto;max-width:100%" }, svg);
}

/** Rounded-top rectangle path for vertical bars. */
function roundedTopRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  return (
    `M ${x} ${y + h} ` +
    `V ${y + r} ` +
    `Q ${x} ${y} ${x + r} ${y} ` +
    `H ${x + w - r} ` +
    `Q ${x + w} ${y} ${x + w} ${y + r} ` +
    `V ${y + h} Z`
  );
}

/** Rounded-right rectangle path for horizontal bars. */
function roundedRightRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  return (
    `M ${x} ${y} ` +
    `H ${x + w - r} ` +
    `Q ${x + w} ${y} ${x + w} ${y + r} ` +
    `V ${y + h - r} ` +
    `Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
    `H ${x} Z`
  );
}

/** Format a number for axis labels (1000 → 1k, etc.) */
function formatNumber(val: number): string {
  if (Math.abs(val) >= 1_000_000) return (val / 1_000_000).toFixed(1) + "M";
  if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(1) + "k";
  if (Number.isInteger(val)) return val.toString();
  return val.toFixed(1);
}
