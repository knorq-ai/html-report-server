/**
 * Style presets and inline style builder utilities.
 *
 * Each preset defines a complete set of design tokens that component
 * renderers consume. The builder converts token objects into inline
 * style strings for HTML output.
 *
 * All presets use CSS variables (--fg, --bg, etc.) defined in the
 * HTML shell emitted by html-io.ts, with light/dark mode support.
 */

import type { StylePreset, StyleName, StyleOverrides } from "./types.js";
import { sanitizeCssValue } from "./html-utils.js";

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const mckinsey: StylePreset = {
  name: "mckinsey",
  maxWidth: "960px",
  sectionGap: "2.5rem",
  blockGap: "1.25rem",
  sectionTitle: {
    textTransform: "uppercase",
    fontSize: "0.75rem",
    fontWeight: "700",
    letterSpacing: "0.05em",
    borderBottom: "2px solid var(--fg)",
    marginBottom: "1.25rem",
  },
  card: {
    borderRadius: "12px",
    border: "1px solid var(--border)",
    boxShadow: "none",
    padding: "1.25rem 1.5rem",
    background: "var(--bg)",
  },
  table: {
    headerBg: "var(--code-bg)",
    headerColor: "var(--fg)",
    stripedRows: false,
    borderRadius: "0",
    outerBorder: "1px solid var(--border)",
  },
  chart: {
    palette: [
      "var(--accent)",
      "var(--success)",
      "var(--warning)",
      "var(--danger)",
      "#6f42c1",
      "#fd7e14",
      "#20c997",
      "#e83e8c",
    ],
    barRadius: 2,
    strokeWidth: 2,
    height: 240,
    gridColor: "var(--border)",
    labelColor: "var(--muted)",
  },
  statValueFontSize: "2rem",
  statValueFontWeight: "700",
};

const clean: StylePreset = {
  name: "clean",
  maxWidth: "960px",
  sectionGap: "2rem",
  blockGap: "1rem",
  sectionTitle: {
    textTransform: "none",
    fontSize: "1.1rem",
    fontWeight: "600",
    letterSpacing: "normal",
    borderBottom: "none",
    marginBottom: "1rem",
  },
  card: {
    borderRadius: "8px",
    border: "none",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
    padding: "1.25rem",
    background: "var(--bg)",
  },
  table: {
    headerBg: "var(--code-bg)",
    headerColor: "var(--fg)",
    stripedRows: true,
    borderRadius: "8px",
    outerBorder: "1px solid var(--border)",
  },
  chart: {
    palette: [
      "var(--accent)",
      "var(--success)",
      "var(--warning)",
      "var(--danger)",
      "#6f42c1",
      "#fd7e14",
      "#20c997",
      "#e83e8c",
    ],
    barRadius: 4,
    strokeWidth: 2.5,
    height: 240,
    gridColor: "var(--border)",
    labelColor: "var(--muted)",
  },
  statValueFontSize: "1.75rem",
  statValueFontWeight: "700",
};

const minimal: StylePreset = {
  name: "minimal",
  maxWidth: "720px",
  sectionGap: "1.5rem",
  blockGap: "0.75rem",
  sectionTitle: {
    textTransform: "none",
    fontSize: "1rem",
    fontWeight: "700",
    letterSpacing: "normal",
    borderBottom: "1px solid var(--border)",
    marginBottom: "0.75rem",
  },
  card: {
    borderRadius: "4px",
    border: "1px solid var(--border)",
    boxShadow: "none",
    padding: "1rem",
    background: "var(--bg)",
  },
  table: {
    headerBg: "var(--code-bg)",
    headerColor: "var(--fg)",
    stripedRows: false,
    borderRadius: "0",
    outerBorder: "1px solid var(--border)",
  },
  chart: {
    palette: [
      "var(--fg)",
      "var(--muted)",
      "var(--accent)",
      "var(--border)",
      "#6f42c1",
      "#fd7e14",
      "#20c997",
      "#e83e8c",
    ],
    barRadius: 0,
    strokeWidth: 1.5,
    height: 200,
    gridColor: "var(--border)",
    labelColor: "var(--muted)",
  },
  statValueFontSize: "1.5rem",
  statValueFontWeight: "700",
};

const dashboard: StylePreset = {
  name: "dashboard",
  maxWidth: "1200px",
  sectionGap: "1.5rem",
  blockGap: "0.75rem",
  sectionTitle: {
    textTransform: "uppercase",
    fontSize: "0.7rem",
    fontWeight: "700",
    letterSpacing: "0.06em",
    borderBottom: "none",
    marginBottom: "0.75rem",
  },
  card: {
    borderRadius: "4px",
    border: "1px solid var(--border)",
    boxShadow: "none",
    padding: "1rem",
    background: "var(--code-bg)",
  },
  table: {
    headerBg: "var(--fg)",
    headerColor: "var(--bg)",
    stripedRows: true,
    borderRadius: "4px",
    outerBorder: "1px solid var(--border)",
  },
  chart: {
    palette: [
      "var(--accent)",
      "var(--success)",
      "var(--warning)",
      "var(--danger)",
      "#6f42c1",
      "#fd7e14",
      "#20c997",
      "#e83e8c",
    ],
    barRadius: 2,
    strokeWidth: 2,
    height: 200,
    gridColor: "var(--border)",
    labelColor: "var(--muted)",
  },
  statValueFontSize: "1.75rem",
  statValueFontWeight: "800",
};

// ---------------------------------------------------------------------------
// Preset registry
// ---------------------------------------------------------------------------

const presets: Record<StyleName, StylePreset> = {
  mckinsey,
  clean,
  minimal,
  dashboard,
};

/**
 * Resolve a preset by name and apply optional overrides.
 * Unknown preset names fall back to "mckinsey".
 */
export function resolvePreset(
  name?: StyleName,
  overrides?: StyleOverrides,
): StylePreset {
  const base = presets[name ?? "mckinsey"] ?? presets.mckinsey;
  if (!overrides) return base;

  return {
    ...base,
    ...(overrides.sectionTitle && {
      sectionTitle: { ...base.sectionTitle, ...overrides.sectionTitle },
    }),
    ...(overrides.card && {
      card: { ...base.card, ...overrides.card },
    }),
    ...(overrides.table && {
      table: { ...base.table, ...overrides.table },
    }),
    ...(overrides.chart && {
      chart: {
        ...base.chart,
        ...overrides.chart,
        // Sanitize user-supplied palette colors to prevent SVG attribute injection
        ...(overrides.chart.palette && {
          palette: overrides.chart.palette.map(sanitizeCssValue),
        }),
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Inline style builder
// ---------------------------------------------------------------------------

/**
 * Convert a key-value map of CSS properties into an inline style string.
 * Null/undefined values are omitted.
 */
export function inlineStyle(
  props: Record<string, string | number | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(props)) {
    if (val === undefined) continue;
    // Convert camelCase to kebab-case
    const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    parts.push(`${cssKey}:${val}`);
  }
  return parts.join(";");
}

/**
 * Wrap an inline style string into a style attribute.
 * Returns empty string if styles is empty.
 */
export function styleAttr(styles: string): string {
  return styles ? ` style="${styles}"` : "";
}

/** Available preset names for tool descriptions. */
export const PRESET_NAMES = Object.keys(presets) as StyleName[];
