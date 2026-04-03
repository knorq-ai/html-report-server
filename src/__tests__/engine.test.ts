import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  renderReport,
  readReport,
  editReport,
  getComponentExamples,
} from "../html-engine.js";
import type { ReportDocument } from "../html-engine.js";
import { renderDocument, summarizeBlocks } from "../engine/renderer.js";
import { resolvePreset } from "../engine/theme.js";
import { renderBlock } from "../engine/components.js";
import { extractJsonComment } from "../engine/html-io.js";
import { renderBarChart, renderLineChart, renderPieChart } from "../engine/charts.js";
import {
  escapeHtml,
  sanitizeInlineHtml,
  sanitizeBlockHtml,
  sanitizeCssValue,
} from "../engine/html-utils.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleDoc: ReportDocument = {
  title: "Q4 Performance Report",
  style: "mckinsey",
  blocks: [
    { type: "section", title: "Key Metrics" },
    {
      type: "stat_cards",
      cards: [
        { label: "Revenue", value: "$4.2M", delta: "+15%", trend: "up" },
        { label: "Users", value: "12,847", delta: "+8%", trend: "up" },
        { label: "Churn", value: "3.2%", delta: "+0.5%", trend: "down" },
      ],
    },
    {
      type: "table",
      headers: ["Region", "Revenue", "Growth"],
      rows: [
        ["North America", "$2.1M", "+18%"],
        ["EMEA", "$1.4M", "+12%"],
      ],
    },
    {
      type: "bar_chart",
      title: "Monthly Revenue",
      data: [
        { label: "Jan", value: 320 },
        { label: "Feb", value: 380 },
        { label: "Mar", value: 410 },
      ],
      unit: "K",
    },
    {
      type: "line_chart",
      title: "User Growth",
      series: [
        {
          name: "MAU",
          data: [
            { x: "Q1", y: 8200 },
            { x: "Q2", y: 9400 },
            { x: "Q3", y: 11200 },
          ],
        },
      ],
    },
    {
      type: "pie_chart",
      title: "Revenue Split",
      data: [
        { label: "Enterprise", value: 60 },
        { label: "SMB", value: 25 },
        { label: "Consumer", value: 15 },
      ],
      donut: true,
    },
    { type: "divider" },
    {
      type: "paragraph",
      text: "Overall performance exceeded expectations across all segments.",
    },
  ],
};

let tmpDir: string;
let tmpFile: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "html-report-test-"));
  tmpFile = path.join(tmpDir, "report.html");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Theme / Preset tests
// ---------------------------------------------------------------------------

describe("resolvePreset", () => {
  it("returns mckinsey as default", () => {
    const preset = resolvePreset();
    expect(preset.name).toBe("mckinsey");
  });

  it("resolves each named preset", () => {
    for (const name of ["mckinsey", "clean", "minimal", "dashboard"] as const) {
      const preset = resolvePreset(name);
      expect(preset.name).toBe(name);
    }
  });

  it("applies overrides to base preset", () => {
    const preset = resolvePreset("mckinsey", {
      card: { borderRadius: "0" },
    });
    expect(preset.card.borderRadius).toBe("0");
    // Other card properties remain from base
    expect(preset.card.padding).toBe("1.25rem 1.5rem");
  });
});

// ---------------------------------------------------------------------------
// Renderer tests
// ---------------------------------------------------------------------------

describe("renderDocument", () => {
  it("renders a complete document with wrapper div", () => {
    const html = renderDocument(sampleDoc);
    expect(html).toContain("<div");
    expect(html).toContain("Q4 Performance Report");
    expect(html).toContain("max-width:960px");
  });

  it("renders all block types without errors", () => {
    const allBlocksDoc: ReportDocument = {
      title: "All Types",
      blocks: [
        { type: "section", title: "Section" },
        { type: "heading", level: 2, text: "Heading" },
        { type: "paragraph", text: "Paragraph" },
        { type: "list", items: ["A", "B"] },
        { type: "callout", variant: "info", text: "Note" },
        { type: "stat_cards", cards: [{ label: "X", value: "1" }] },
        { type: "table", headers: ["A"], rows: [["1"]] },
        { type: "bar_chart", data: [{ label: "A", value: 1 }] },
        { type: "line_chart", series: [{ name: "S", data: [{ x: "a", y: 1 }] }] },
        { type: "pie_chart", data: [{ label: "A", value: 1 }] },
        { type: "progress_bars", bars: [{ label: "P", value: 50 }] },
        { type: "timeline", entries: [{ date: "2024", title: "Event" }] },
        { type: "card_grid", cards: [{ title: "Card", body: "Body" }] },
        { type: "comparison", items: [{ title: "A", points: ["x"] }] },
        { type: "badges", items: [{ text: "OK", variant: "success" }] },
        { type: "metadata", items: [{ label: "Date", value: "2024-01-01" }] },
        { type: "hero_stats", stats: [{ value: "55%", label: "Improvement" }] },
        { type: "before_after", items: [{ title: "Speed", before: { label: "Old", value: 1.0, unit: "s" }, after: { label: "New", value: 0.5, unit: "s" }, improvement: "50% faster" }] },
        { type: "steps", steps: [{ title: "A" }, { title: "B" }] },
        { type: "divider" },
        { type: "html", content: "<em>custom</em>" },
        {
          type: "comparison_matrix",
          columns: [{ id: "a", label: "A" }],
          rows: [{ a: "val" }],
        },
        {
          type: "sectioned_table",
          sections: [{ title: "S", headers: ["H"], rows: [["r"]] }],
        },
        {
          type: "relationship_graph",
          nodes: [{ id: "n1", name: "N1" }, { id: "n2", name: "N2" }],
          edges: [{ from: "n1", to: "n2" }],
        },
      ],
    };
    const html = renderDocument(allBlocksDoc);
    expect(html).toBeTruthy();
    expect(html).toContain("Section");
    expect(html).toContain("Heading");
    expect(html).toContain("<em>custom</em>");
    expect(html).toContain("<table"); // comparison_matrix
    expect(html).toContain("<svg"); // relationship_graph
  });
});

describe("summarizeBlocks", () => {
  it("generates indexed summary", () => {
    const summary = summarizeBlocks(sampleDoc.blocks);
    expect(summary).toContain("[0] section:");
    expect(summary).toContain("[1] stat_cards:");
    expect(summary).toContain("[2] table:");
  });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe("renderBlock", () => {
  const preset = resolvePreset("mckinsey");

  it("renders section with uppercase text-transform in mckinsey style", () => {
    const html = renderBlock({ type: "section", title: "Overview" }, preset);
    expect(html).toContain("text-transform:uppercase");
    expect(html).toContain("Overview");
  });

  it("renders stat_cards as a grid", () => {
    const html = renderBlock(
      {
        type: "stat_cards",
        cards: [{ label: "Rev", value: "$1M", delta: "+10%", trend: "up" }],
      },
      preset,
    );
    expect(html).toContain("display:grid");
    expect(html).toContain("Rev");
    expect(html).toContain("$1M");
    expect(html).toContain("+10%");
    expect(html).toContain("&#x25B2;"); // ▲
  });

  it("renders table with headers and rows", () => {
    const html = renderBlock(
      {
        type: "table",
        headers: ["Name", "Value"],
        rows: [["A", "1"]],
      },
      preset,
    );
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("Name");
    expect(html).toContain("<td");
    expect(html).toContain("1");
  });

  it("renders timeline with dots and entries", () => {
    const html = renderBlock(
      {
        type: "timeline",
        entries: [{ date: "2024-01", title: "Launch", description: "V2 released" }],
      },
      preset,
    );
    expect(html).toContain("2024-01");
    expect(html).toContain("Launch");
    expect(html).toContain("V2 released");
    expect(html).toContain("border-radius:50%"); // dot
  });

  it("renders callout with accent border", () => {
    const html = renderBlock(
      { type: "callout", variant: "warning", text: "Watch out" },
      preset,
    );
    expect(html).toContain("border-left:4px solid var(--warning)");
    expect(html).toContain("Watch out");
  });

  it("renders progress bars with percentage", () => {
    const html = renderBlock(
      { type: "progress_bars", bars: [{ label: "Goal", value: 75 }] },
      preset,
    );
    expect(html).toContain("75%");
    expect(html).toContain("Goal");
  });

  it("renders before_after comparison cards", () => {
    const html = renderBlock({
      type: "before_after",
      items: [{
        title: "Load Time",
        before: { label: "Old", value: 1.0, unit: "s" },
        after: { label: "New", value: 0.5, unit: "s" },
        improvement: "50% faster",
      }],
    }, preset);
    expect(html).toContain("Load Time");
    expect(html).toContain("50% faster");
    expect(html).toContain("Old");
    expect(html).toContain("New");
    expect(html).toContain("1"); // before value
    expect(html).toContain("0.5"); // after value
  });

  it("renders steps with titles, auto-generated labels, and descriptions", () => {
    const html = renderBlock(
      {
        type: "steps",
        steps: [
          { title: "Upload", description: "Upload source files" },
          { title: "Process", description: "Parse and validate" },
          { title: "Export" },
        ],
      },
      preset,
    );
    expect(html).toContain("display:flex");
    expect(html).toContain("Upload");
    expect(html).toContain("Process");
    expect(html).toContain("Export");
    expect(html).toContain("STEP 1");
    expect(html).toContain("STEP 2");
    expect(html).toContain("STEP 3");
    expect(html).toContain("Upload source files");
    expect(html).toContain("Parse and validate");
    // Arrow chevrons between steps
    expect(html).toContain("&#x276F;");
  });

  it("renders steps with custom labels overriding auto-numbering", () => {
    const html = renderBlock(
      {
        type: "steps",
        steps: [
          { label: "Phase A", title: "Design" },
          { label: "Phase B", title: "Build" },
        ],
      },
      preset,
    );
    expect(html).toContain("Phase A");
    expect(html).toContain("Phase B");
    expect(html).not.toContain("STEP 1");
    expect(html).not.toContain("STEP 2");
  });

  it("renders clean style with shadows instead of borders", () => {
    const cleanPreset = resolvePreset("clean");
    const html = renderBlock(
      {
        type: "stat_cards",
        cards: [{ label: "X", value: "1" }],
      },
      cleanPreset,
    );
    expect(html).toContain("box-shadow");
    expect(html).not.toContain("border:1px");
  });
});

// ---------------------------------------------------------------------------
// Chart tests
// ---------------------------------------------------------------------------

describe("charts", () => {
  const preset = resolvePreset("mckinsey");

  it("renders bar chart SVG", () => {
    const html = renderBarChart(
      {
        type: "bar_chart",
        data: [
          { label: "A", value: 10 },
          { label: "B", value: 20 },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("</svg>");
    expect(html).toContain("A");
    expect(html).toContain("B");
  });

  it("renders horizontal bar chart", () => {
    const html = renderBarChart(
      {
        type: "bar_chart",
        horizontal: true,
        data: [{ label: "X", value: 50 }],
      },
      preset,
    );
    expect(html).toContain("<svg");
  });

  it("renders line chart SVG with polyline", () => {
    const html = renderLineChart(
      {
        type: "line_chart",
        series: [
          { name: "S1", data: [{ x: "Jan", y: 10 }, { x: "Feb", y: 20 }] },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("<polyline");
    expect(html).toContain("Jan");
  });

  it("renders dual-axis line chart with independent Y scales", () => {
    const html = renderLineChart(
      {
        type: "line_chart",
        title: "DAU vs MAU",
        dualAxis: true,
        series: [
          { name: "DAU", data: [{ x: "Q1", y: 100 }, { x: "Q2", y: 200 }] },
          { name: "MAU", data: [{ x: "Q1", y: 8000 }, { x: "Q2", y: 12000 }] },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    // Two polylines (one per series)
    expect(html.match(/<polyline/g)?.length).toBe(2);
    // Left axis shows DAU-scale values, right axis shows MAU-scale values
    expect(html).toContain("200"); // DAU max
    expect(html).toContain("12.0k"); // MAU max
    // Both series should use full plot height — DAU should NOT be flat
    const polylines = html.match(/points="([^"]+)"/g) ?? [];
    expect(polylines.length).toBe(2);
  });

  it("falls back to shared axis when dualAxis is false or >2 series", () => {
    const html = renderLineChart(
      {
        type: "line_chart",
        dualAxis: false,
        series: [
          { name: "A", data: [{ x: "X", y: 100 }] },
          { name: "B", data: [{ x: "X", y: 10000 }] },
        ],
      },
      preset,
    );
    // Should NOT have right-axis labels (text-anchor="start" near right edge)
    // Only left-axis labels with shared scale showing 10.0k
    expect(html).toContain("10.0k");
  });

  it("renders pie chart SVG with path elements", () => {
    const html = renderPieChart(
      {
        type: "pie_chart",
        data: [
          { label: "A", value: 50 },
          { label: "B", value: 50 },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("<path");
  });

  it("renders donut chart with inner radius", () => {
    const html = renderPieChart(
      {
        type: "pie_chart",
        donut: true,
        data: [
          { label: "A", value: 70 },
          { label: "B", value: 30 },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    // Donut has arc commands for both inner and outer rings
    expect(html.match(/<path/g)?.length).toBe(2);
  });

  it("returns empty string for empty data", () => {
    expect(renderBarChart({ type: "bar_chart", data: [] }, preset)).toBe("");
    expect(renderLineChart({ type: "line_chart", series: [] }, preset)).toBe("");
    expect(renderPieChart({ type: "pie_chart", data: [] }, preset)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// HTML I/O round-trip tests
// ---------------------------------------------------------------------------

describe("JSON comment round-trip", () => {
  it("embeds and extracts JSON from HTML", () => {
    const jsonComment = `<!-- REPORT_JSON: ${JSON.stringify(sampleDoc)} -->`;
    const html = jsonComment + "\n<div>hello</div>";
    const extracted = extractJsonComment(html);
    expect(extracted).toEqual(sampleDoc);
  });

  it("returns null for HTML without JSON comment", () => {
    expect(extractJsonComment("<div>no json</div>")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(extractJsonComment("<!-- REPORT_JSON: {invalid -->")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Public API integration tests (file I/O)
// ---------------------------------------------------------------------------

describe("renderReport", () => {
  it("creates HTML file and returns summary", async () => {
    const result = await renderReport(tmpFile, sampleDoc);
    expect(result).toContain("Rendered 8 blocks");
    expect(result).toContain(tmpFile);

    const content = await fs.readFile(tmpFile, "utf-8");
    expect(content).toContain("<!-- REPORT_JSON:");
    expect(content).toContain("Q4 Performance Report");
    expect(content).toContain("<svg"); // chart
  });

  it("throws for missing directory", async () => {
    const badPath = path.join(tmpDir, "nonexistent", "report.html");
    await expect(renderReport(badPath, sampleDoc)).rejects.toThrow(
      "Directory does not exist",
    );
  });
});

describe("readReport", () => {
  it("reads back the JSON structure", async () => {
    await renderReport(tmpFile, sampleDoc);
    const result = await readReport(tmpFile);
    expect(result).toContain("Q4 Performance Report");
    expect(result).toContain("stat_cards");
    expect(result).toContain("Full document JSON:");
  });

  it("throws for file without embedded JSON", async () => {
    await fs.writeFile(tmpFile, "<div>plain html</div>", "utf-8");
    await expect(readReport(tmpFile)).rejects.toThrow("No embedded report JSON");
  });

  it("throws for missing file", async () => {
    await expect(readReport("/nonexistent/file.html")).rejects.toThrow(
      "File not found",
    );
  });
});

describe("editReport", () => {
  it("replaces a block", async () => {
    await renderReport(tmpFile, sampleDoc);
    const result = await editReport(tmpFile, [
      {
        op: "replace",
        index: 0,
        block: { type: "section", title: "Updated Section" },
      },
    ]);
    expect(result).toContain("Replaced block [0]");

    const readResult = await readReport(tmpFile);
    expect(readResult).toContain("Updated Section");
  });

  it("inserts a block", async () => {
    await renderReport(tmpFile, sampleDoc);
    const result = await editReport(tmpFile, [
      {
        op: "insert",
        index: 0,
        block: { type: "heading", level: 1, text: "New Heading" },
      },
    ]);
    expect(result).toContain("Inserted heading at [0]");
    expect(result).toContain("9 blocks total");
  });

  it("deletes a block", async () => {
    await renderReport(tmpFile, sampleDoc);
    const result = await editReport(tmpFile, [
      { op: "delete", index: 6 }, // divider
    ]);
    expect(result).toContain("Deleted block [6]");
    expect(result).toContain("7 blocks total");
  });

  it("handles batch operations", async () => {
    await renderReport(tmpFile, sampleDoc);
    const result = await editReport(tmpFile, [
      { op: "delete", index: 7 }, // delete last paragraph
      { op: "delete", index: 6 }, // delete divider
      {
        op: "replace",
        index: 0,
        block: { type: "section", title: "Refreshed" },
      },
      {
        op: "insert",
        index: 0,
        block: { type: "badges", items: [{ text: "New", variant: "success" }] },
      },
    ]);
    expect(result).toContain("Applied 4 operations");
  });

  it("throws for empty operations", async () => {
    await renderReport(tmpFile, sampleDoc);
    await expect(editReport(tmpFile, [])).rejects.toThrow("No operations provided");
  });

  it("throws for out-of-range index", async () => {
    await renderReport(tmpFile, sampleDoc);
    await expect(
      editReport(tmpFile, [{ op: "delete", index: 999 }]),
    ).rejects.toThrow("out of range");
  });
});

// ---------------------------------------------------------------------------
// Security tests
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes quotes and ampersands", () => {
    expect(escapeHtml('"foo" & \'bar\'')).toBe("&quot;foo&quot; &amp; &#39;bar&#39;");
  });
});

describe("sanitizeInlineHtml", () => {
  it("preserves allowed tags", () => {
    const html = "<b>bold</b> <em>italic</em> <a href=\"/link\">link</a>";
    expect(sanitizeInlineHtml(html)).toBe(html);
  });

  it("strips script tags", () => {
    const result = sanitizeInlineHtml('<script>alert(1)</script>');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("</script");
  });

  it("strips event handlers", () => {
    expect(sanitizeInlineHtml('<b onmouseover="alert(1)">text</b>')).not.toContain("onmouseover");
    expect(sanitizeInlineHtml('<b onmouseover="alert(1)">text</b>')).toContain("<b");
  });

  it("strips javascript: URLs", () => {
    const result = sanitizeInlineHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  it("strips data: URIs in href", () => {
    const result = sanitizeInlineHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(result).not.toContain("data:");
  });

  it("strips disallowed tags like div, img, iframe", () => {
    expect(sanitizeInlineHtml("<div>content</div>")).toBe("content");
    expect(sanitizeInlineHtml("<img src=x>")).toBe("");
    expect(sanitizeInlineHtml("<iframe src=x></iframe>")).toBe("");
  });

  it("handles nested-tag bypass attempt", () => {
    const result = sanitizeInlineHtml("<scr<script>ipt>alert(1)</scr</script>ipt>");
    expect(result).not.toContain("<script");
    // Text remnants like "alert(1)" are harmless without script tags
  });
});

describe("sanitizeBlockHtml", () => {
  it("allows layout tags", () => {
    const html = '<div style="color:red"><p>hello</p><table><tr><td>cell</td></tr></table></div>';
    expect(sanitizeBlockHtml(html)).toContain("<div");
    expect(sanitizeBlockHtml(html)).toContain("<table");
  });

  it("allows SVG elements for inline charts", () => {
    const svg = '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" /></svg>';
    expect(sanitizeBlockHtml(svg)).toContain("<svg");
    expect(sanitizeBlockHtml(svg)).toContain("<rect");
  });

  it("strips script tags", () => {
    expect(sanitizeBlockHtml("<div><script>alert(1)</script></div>")).not.toContain("<script");
  });

  it("strips iframe tags", () => {
    expect(sanitizeBlockHtml('<iframe src="evil.com"></iframe>')).not.toContain("<iframe");
  });

  it("strips style tags (CSS injection)", () => {
    expect(sanitizeBlockHtml("<style>body{display:none}</style>")).not.toContain("<style");
  });

  it("strips form/input tags", () => {
    expect(sanitizeBlockHtml('<form action="/steal"><input type="password"></form>')).not.toContain("<form");
    expect(sanitizeBlockHtml('<form action="/steal"><input type="password"></form>')).not.toContain("<input");
  });

  it("strips event handlers on allowed tags", () => {
    const result = sanitizeBlockHtml('<div onclick="alert(1)">x</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("<div");
  });

  it("strips style attributes with url()", () => {
    const result = sanitizeBlockHtml('<div style="background:url(javascript:alert(1))">x</div>');
    expect(result).not.toContain("url(");
  });

  it("handles nested-tag bypass attempt", () => {
    const result = sanitizeBlockHtml("<scr<script>ipt>alert(1)</scr</script>ipt>");
    expect(result).not.toContain("<script");
  });
});

describe("sanitizeCssValue", () => {
  it("passes through valid CSS colors", () => {
    expect(sanitizeCssValue("var(--accent)")).toBe("var(--accent)");
    expect(sanitizeCssValue("#ff0000")).toBe("#ff0000");
    expect(sanitizeCssValue("red")).toBe("red");
  });

  it("strips semicolons, braces, and quotes", () => {
    expect(sanitizeCssValue("red;} .x{background:evil")).toBe("red .xbackground:evil");
    expect(sanitizeCssValue('red" onclick="')).toBe("red onclick=");
  });
});

describe("security in rendered blocks", () => {
  const preset = resolvePreset("mckinsey");

  it("escapes XSS in stat_cards values", () => {
    const html = renderBlock(
      {
        type: "stat_cards",
        cards: [{ label: "<script>", value: '<img onerror="alert(1)">' }],
      },
      preset,
    );
    // Tags are escaped — <script> becomes &lt;script&gt;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // Attributes are escaped — onerror="..." becomes onerror=&quot;...&quot;
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain("onerror=&quot;");
  });

  it("escapes XSS in table cells", () => {
    const html = renderBlock(
      {
        type: "table",
        headers: ["<script>x</script>"],
        rows: [['<img src=x onerror="alert(1)">']],
      },
      preset,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('onerror="alert');
  });

  it("sanitizes paragraph text (inline HTML allowlist)", () => {
    const html = renderBlock(
      { type: "paragraph", text: '<strong>ok</strong><script>bad</script>' },
      preset,
    );
    expect(html).toContain("<strong>ok</strong>");
    expect(html).not.toContain("<script>");
  });

  it("sanitizes callout text (inline HTML allowlist)", () => {
    const html = renderBlock(
      { type: "callout", text: '<b>ok</b><iframe src="evil"></iframe>' },
      preset,
    );
    expect(html).toContain("<b>ok</b>");
    expect(html).not.toContain("<iframe");
  });

  it("escapes XSS in steps title, description, and label", () => {
    const html = renderBlock(
      {
        type: "steps",
        steps: [
          {
            label: '<script>alert("label")</script>',
            title: '<img onerror="alert(1)">',
            description: '<script>alert("desc")</script>',
          },
        ],
      },
      preset,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img onerror=&quot;alert(1)&quot;&gt;");
  });

  it("sanitizes raw html block", () => {
    const html = renderBlock(
      { type: "html", content: '<div>ok</div><script>alert(1)</script>' },
      preset,
    );
    expect(html).toContain("<div>ok</div>");
    expect(html).not.toContain("<script>");
  });
});

describe("JSON comment security", () => {
  it("escapes --> in embedded JSON to prevent comment breakout", () => {
    const doc = { ...sampleDoc, title: "test-->breakout" };
    const jsonComment = `<!-- REPORT_JSON: ${JSON.stringify(doc).replace(/-->/g, "--\\u003e")} -->`;
    expect(jsonComment).not.toContain("test-->");
    expect(jsonComment).toContain("test--\\u003e");
  });
});

// ---------------------------------------------------------------------------
// Diagram tests
// ---------------------------------------------------------------------------

describe("diagram block", () => {
  const preset = resolvePreset("mckinsey");

  it("renders a basic diagram with layers and nodes", () => {
    const html = renderBlock(
      {
        type: "diagram",
        layers: [
          {
            label: "Frontend",
            color: "#4a90d9",
            nodes: [
              { id: "web", title: "Web App", lines: [":3000"], color: "#4a90d9" },
            ],
          },
          {
            label: "Backend",
            color: "#50b86c",
            nodes: [
              { id: "api", title: "API", color: "#50b86c" },
            ],
          },
        ],
        edges: [{ from: "web", to: "api" }],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("FRONTEND");
    expect(html).toContain("BACKEND");
    expect(html).toContain("Web App");
    expect(html).toContain("API");
    expect(html).toContain("<path"); // edge
  });

  it("renders dark theme with canvas background", () => {
    const html = renderBlock(
      {
        type: "diagram",
        dark: true,
        layers: [
          { label: "Layer", nodes: [{ id: "a", title: "Node" }] },
        ],
        edges: [],
      },
      preset,
    );
    expect(html).toContain("#16162a"); // dark canvas bg
  });

  it("renders groups with dashed borders", () => {
    const html = renderBlock(
      {
        type: "diagram",
        layers: [
          {
            label: "Storage",
            nodes: [
              { id: "pg", title: "PostgreSQL" },
              { id: "redis", title: "Redis" },
            ],
            groups: [{ label: "DATA", nodeIds: ["pg", "redis"], style: "dashed" }],
          },
        ],
        edges: [],
      },
      preset,
    );
    expect(html).toContain("DATA");
    expect(html).toContain("stroke-dasharray");
  });

  it("renders edge labels", () => {
    const html = renderBlock(
      {
        type: "diagram",
        layers: [
          {
            label: "L",
            nodes: [
              { id: "a", title: "A" },
              { id: "b", title: "B" },
            ],
          },
        ],
        edges: [{ from: "a", to: "b", label: "HTTP" }],
      },
      preset,
    );
    expect(html).toContain("HTTP");
  });

  it("handles dashed edges", () => {
    const html = renderBlock(
      {
        type: "diagram",
        layers: [
          { label: "L", nodes: [{ id: "a", title: "A" }, { id: "b", title: "B" }] },
        ],
        edges: [{ from: "a", to: "b", style: "dashed" }],
      },
      preset,
    );
    expect(html).toContain("stroke-dasharray");
  });

  it("returns empty string for empty layers", () => {
    const html = renderBlock(
      { type: "diagram", layers: [], edges: [] },
      preset,
    );
    expect(html).toBe("");
  });

  it("ignores edges referencing non-existent nodes", () => {
    const html = renderBlock(
      {
        type: "diagram",
        layers: [
          { label: "L", nodes: [{ id: "a", title: "A" }] },
        ],
        edges: [{ from: "a", to: "missing" }],
      },
      preset,
    );
    expect(html).toContain("<svg");
    // Should not throw, just skip the bad edge
  });

  it("escapes HTML in node titles and edge labels", () => {
    const html = renderBlock(
      {
        type: "diagram",
        layers: [
          { label: "<script>", nodes: [{ id: "a", title: '<img onerror="alert(1)">' }] },
        ],
        edges: [{ from: "a", to: "a", label: '<script>xss</script>' }],
      },
      preset,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;script&gt;");
  });

  it("sanitizes color values in nodes", () => {
    const html = renderBlock(
      {
        type: "diagram",
        layers: [
          {
            label: "L",
            nodes: [{ id: "a", title: "A", color: 'red"; onload="alert(1)' }],
          },
        ],
        edges: [],
      },
      preset,
    );
    // sanitizeCssValue strips quotes
    expect(html).not.toContain('onload="alert');
  });
});

describe("getComponentExamples", () => {
  it("returns markdown with all block types", () => {
    const result = getComponentExamples();
    expect(result).toContain("# HTML Report DSL");
    expect(result).toContain("stat_cards");
    expect(result).toContain("bar_chart");
    expect(result).toContain("line_chart");
    expect(result).toContain("pie_chart");
    expect(result).toContain("timeline");
    expect(result).toContain("comparison");
    expect(result).toContain("mckinsey");
  });
});

// ---------------------------------------------------------------------------
// New feature tests (v1.2)
// ---------------------------------------------------------------------------

describe("theme mode", () => {
  it("forces light theme — no prefers-color-scheme media query", async () => {
    const doc: ReportDocument = { ...sampleDoc, theme: "light" };
    await renderReport(tmpFile, doc);
    const content = await fs.readFile(tmpFile, "utf-8");
    expect(content).not.toContain("prefers-color-scheme");
    expect(content).toContain("--fg: #1f2328"); // light vars
    expect(content).toContain("color-scheme: light");
  });

  it("forces dark theme — no prefers-color-scheme media query", async () => {
    const doc: ReportDocument = { ...sampleDoc, theme: "dark" };
    await renderReport(tmpFile, doc);
    const content = await fs.readFile(tmpFile, "utf-8");
    expect(content).not.toContain("prefers-color-scheme");
    expect(content).toContain("--fg: #e6edf3"); // dark vars
    expect(content).toContain("color-scheme: dark");
  });

  it("auto theme includes media query", async () => {
    const doc: ReportDocument = { ...sampleDoc, theme: "auto" };
    await renderReport(tmpFile, doc);
    const content = await fs.readFile(tmpFile, "utf-8");
    expect(content).toContain("prefers-color-scheme: dark");
    expect(content).toContain("color-scheme: light dark");
  });

  it("omitted theme defaults to auto behavior", async () => {
    await renderReport(tmpFile, sampleDoc);
    const content = await fs.readFile(tmpFile, "utf-8");
    expect(content).toContain("prefers-color-scheme: dark");
  });
});

describe("section eyebrow badge", () => {
  const preset = resolvePreset("mckinsey");

  it("renders numbered title as eyebrow pill badge", () => {
    const html = renderBlock(
      { type: "section", title: "01 · PROBLEM", subtitle: "課題の概要" },
      preset,
    );
    // Eyebrow should contain the full title in a badge
    expect(html).toContain("01 · PROBLEM");
    // Subtitle promoted to h2
    expect(html).toContain("<h2");
    expect(html).toContain("課題の概要");
  });

  it("falls back to original style for non-numbered titles", () => {
    const html = renderBlock(
      { type: "section", title: "Overview" },
      preset,
    );
    expect(html).not.toContain("<h2");
    expect(html).toContain("Overview");
  });

  it("only adds rule for eyebrow or when preset has border", () => {
    const cleanPreset = resolvePreset("clean"); // borderBottom: "none"
    const html = renderBlock(
      { type: "section", title: "No Number" },
      cleanPreset,
    );
    // Clean preset has borderBottom: "none", no rule should appear
    expect(html).not.toContain('height:1px');
  });
});

describe("callout variant backgrounds", () => {
  const preset = resolvePreset("mckinsey");

  it("uses warning-light background for warning callout", () => {
    const html = renderBlock(
      { type: "callout", variant: "warning", text: "test" },
      preset,
    );
    expect(html).toContain("var(--warning-light)");
    expect(html).toContain("var(--warning)"); // border accent
  });

  it("uses success-light background for success callout", () => {
    const html = renderBlock(
      { type: "callout", variant: "success", text: "test" },
      preset,
    );
    expect(html).toContain("var(--success-light)");
  });
});

describe("timeline entry colors", () => {
  const preset = resolvePreset("mckinsey");

  it("uses custom color for dot and date", () => {
    const html = renderBlock(
      {
        type: "timeline",
        entries: [{ date: "W1", title: "Task", color: "var(--success)" }],
      },
      preset,
    );
    expect(html).toContain("var(--success)");
  });

  it("defaults to accent color when no color specified", () => {
    const html = renderBlock(
      {
        type: "timeline",
        entries: [{ date: "W1", title: "Task" }],
      },
      preset,
    );
    expect(html).toContain("var(--accent)");
  });

  it("sanitizes user-supplied color values", () => {
    const html = renderBlock(
      {
        type: "timeline",
        entries: [{ date: "W1", title: "Task", color: 'red"; onclick="alert(1)' }],
      },
      preset,
    );
    expect(html).not.toContain('onclick="alert');
  });
});

describe("comparison highlight colors", () => {
  const preset = resolvePreset("mckinsey");

  it("supports string highlight 'purple'", () => {
    const html = renderBlock(
      {
        type: "comparison",
        items: [{ title: "A", points: ["x"], highlight: "purple" }],
      },
      preset,
    );
    expect(html).toContain("var(--purple)");
    expect(html).toContain("var(--purple-light)"); // background
  });

  it("supports boolean highlight (backwards compat)", () => {
    const html = renderBlock(
      {
        type: "comparison",
        items: [{ title: "A", points: ["x"], highlight: true }],
      },
      preset,
    );
    expect(html).toContain("var(--accent)");
  });

  it("renders plain border when highlight is false", () => {
    const html = renderBlock(
      {
        type: "comparison",
        items: [{ title: "A", points: ["x"], highlight: false }],
      },
      preset,
    );
    expect(html).not.toContain("var(--accent-light)");
    expect(html).not.toContain("var(--purple)");
  });
});

describe("hero stats breakdown", () => {
  const preset = resolvePreset("mckinsey");

  it("renders breakdown rows", () => {
    const html = renderBlock(
      {
        type: "hero_stats",
        stats: [{
          value: "$4.2M",
          label: "Revenue",
          breakdown: [
            { label: "Enterprise", value: "$2.5M" },
            { label: "Legacy", value: "$500K", struck: true },
          ],
          breakdownTotal: "Total|$4.2M",
        }],
      },
      preset,
    );
    expect(html).toContain("Enterprise");
    expect(html).toContain("$2.5M");
    expect(html).toContain("line-through"); // struck item
    expect(html).toContain("Total");
    expect(html).toContain("$4.2M");
  });

  it("handles breakdownTotal without pipe (label defaults to 合計)", () => {
    const html = renderBlock(
      {
        type: "hero_stats",
        stats: [{
          value: "100",
          label: "Count",
          breakdown: [{ label: "A", value: "100" }],
          breakdownTotal: "$100",
        }],
      },
      preset,
    );
    expect(html).toContain("合計");
    expect(html).toContain("$100");
  });

  it("skips breakdown section when breakdown is empty", () => {
    const html = renderBlock(
      {
        type: "hero_stats",
        stats: [{ value: "42", label: "Simple", breakdown: [] }],
      },
      preset,
    );
    // No breakdown divider rendered
    expect(html).not.toContain("0 0 0.625rem");
  });

  it("renders without breakdown (backwards compat)", () => {
    const html = renderBlock(
      {
        type: "hero_stats",
        stats: [{ value: "42", label: "Simple" }],
      },
      preset,
    );
    expect(html).toContain("42");
    expect(html).toContain("Simple");
  });
});

// ---------------------------------------------------------------------------
// Analyzer tests
// ---------------------------------------------------------------------------

import { analyzeHtmlContent } from "../engine/analyzer.js";

describe("analyzeHtmlContent", () => {
  it("detects embedded REPORT_JSON and takes fast path", async () => {
    // Render a report, then analyze the output
    await renderReport(tmpFile, sampleDoc);
    const html = await fs.readFile(tmpFile, "utf-8");
    const result = analyzeHtmlContent(html);

    expect(result).toContain("html-report-server (embedded JSON detected)");
    expect(result).toContain("Q4 Performance Report");
    expect(result).toContain("read_report");
    expect(result).toContain("Blocks: 8");
  });

  it("analyzes external HTML with table detection", () => {
    const html = `<html><body>
      <h1>Report</h1>
      <table><thead><tr><th>Name</th><th>Value</th></tr></thead>
      <tbody><tr><td>Revenue</td><td>$4.2M</td></tr></tbody></table>
    </body></html>`;
    const result = analyzeHtmlContent(html);

    expect(result).toContain("external HTML");
    expect(result).toContain("Report");
    expect(result).toContain("table: 2 cols × 1 rows (Name | Value)");
    expect(result).toContain("Revenue | $4.2M");
  });

  it("detects headings, paragraphs, and lists", () => {
    const html = `<html><body>
      <h2>Section</h2>
      <p>Some paragraph text here.</p>
      <ul><li>Item A</li><li>Item B</li></ul>
    </body></html>`;
    const result = analyzeHtmlContent(html);

    expect(result).toContain('heading (h2): "Section"');
    expect(result).toContain('paragraph: "Some paragraph text here."');
    expect(result).toContain("list: 2 items");
    expect(result).toContain("Item A");
  });

  it("detects callout with warning variant", () => {
    const html = `<html><body>
      <div style="border-left: 4px solid #e67e22; padding: 1rem;">
        <strong>Warning</strong>
        <p>Something went wrong</p>
      </div>
    </body></html>`;
    const result = analyzeHtmlContent(html);

    expect(result).toContain("callout (warning)");
  });

  it("detects dividers", () => {
    const html = `<html><body><hr><p>After divider</p></body></html>`;
    const result = analyzeHtmlContent(html);

    expect(result).toContain("divider");
    expect(result).toContain("After divider");
  });

  it("detects grid layouts", () => {
    const html = `<html><body>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
        <div><h3>Card A</h3><p>Body A</p></div>
        <div><h3>Card B</h3><p>Body B</p></div>
      </div>
    </body></html>`;
    const result = analyzeHtmlContent(html);

    expect(result).toContain("card grid");
    expect(result).toContain("2-col");
  });

  it("handles empty HTML gracefully", () => {
    const result = analyzeHtmlContent("<html><body></body></html>");
    expect(result).toContain("external HTML");
    expect(result).toContain("Content blocks: 0");
  });
});

// ---------------------------------------------------------------------------
// comparison_matrix
// ---------------------------------------------------------------------------

describe("comparison_matrix", () => {
  const preset = resolvePreset("mckinsey");

  it("renders table with correct headers", () => {
    const html = renderBlock(
      {
        type: "comparison_matrix",
        columns: [
          { id: "item", label: "Item" },
          { id: "a", label: "Party A" },
          { id: "b", label: "Party B" },
        ],
        rows: [
          { item: "Point 1", a: "Yes", b: "No" },
        ],
      },
      preset,
    );
    expect(html).toContain("<table");
    expect(html).toContain("Item");
    expect(html).toContain("Party A");
    expect(html).toContain("Party B");
    expect(html).toContain("Point 1");
  });

  it("renders badge cells with colored styling", () => {
    const html = renderBlock(
      {
        type: "comparison_matrix",
        columns: [
          { id: "name", label: "Name" },
          { id: "status", label: "Status", type: "badge" },
        ],
        rows: [
          { name: "Task 1", status: { text: "Done", variant: "success" } },
        ],
      },
      preset,
    );
    expect(html).toContain("Done");
    expect(html).toContain("var(--success)");
  });

  it("renders tags columns as pill elements", () => {
    const html = renderBlock(
      {
        type: "comparison_matrix",
        columns: [
          { id: "item", label: "Item" },
          { id: "tags", label: "Tags", type: "tags" },
        ],
        rows: [
          { item: "Row 1", tags: ["alpha", "beta"] },
        ],
      },
      preset,
    );
    expect(html).toContain("alpha");
    expect(html).toContain("beta");
    expect(html).toContain("display:flex");
  });

  it("renders optional title", () => {
    const html = renderBlock(
      {
        type: "comparison_matrix",
        title: "My Matrix",
        columns: [{ id: "a", label: "A" }],
        rows: [{ a: "val" }],
      },
      preset,
    );
    expect(html).toContain("My Matrix");
  });

  it("escapes text cells", () => {
    const html = renderBlock(
      {
        type: "comparison_matrix",
        columns: [{ id: "x", label: "X" }],
        rows: [{ x: "<script>alert(1)</script>" }],
      },
      preset,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ---------------------------------------------------------------------------
// sectioned_table
// ---------------------------------------------------------------------------

describe("sectioned_table", () => {
  const preset = resolvePreset("clean");

  it("renders section titles", () => {
    const html = renderBlock(
      {
        type: "sectioned_table",
        sections: [
          {
            title: "Section A",
            headers: ["Col1", "Col2"],
            rows: [["a", "b"]],
          },
          {
            title: "Section B",
            headers: ["Col1", "Col2"],
            rows: [["c", "d"]],
          },
        ],
      },
      preset,
    );
    expect(html).toContain("Section A");
    expect(html).toContain("Section B");
  });

  it("renders subtotal row", () => {
    const html = renderBlock(
      {
        type: "sectioned_table",
        sections: [
          {
            title: "Revenue",
            headers: ["Item", "Amount"],
            rows: [["Sales", "$1M"]],
            subtotal: { label: "Total", column: 1, value: "$1M" },
          },
        ],
      },
      preset,
    );
    expect(html).toContain("Total");
    expect(html).toContain("$1M");
  });

  it("renders grand total at bottom", () => {
    const html = renderBlock(
      {
        type: "sectioned_table",
        sections: [
          {
            title: "Part 1",
            headers: ["A"],
            rows: [["x"]],
          },
        ],
        grandTotal: { label: "Grand Total", value: "$5M" },
      },
      preset,
    );
    expect(html).toContain("Grand Total");
    expect(html).toContain("$5M");
  });

  it("renders optional title", () => {
    const html = renderBlock(
      {
        type: "sectioned_table",
        title: "Financial Report",
        sections: [
          { title: "S1", headers: ["A"], rows: [["1"]] },
        ],
      },
      preset,
    );
    expect(html).toContain("Financial Report");
  });
});

// ---------------------------------------------------------------------------
// relationship_graph
// ---------------------------------------------------------------------------

describe("relationship_graph", () => {
  const preset = resolvePreset("mckinsey");

  it("renders SVG with nodes", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          { id: "a", name: "Alice" },
          { id: "b", name: "Bob" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
  });

  it("renders edge labels", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        edges: [{ from: "a", to: "b", label: "connects" }],
      },
      preset,
    );
    expect(html).toContain("connects");
  });

  it("renders double-line edges as parallel lines", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        edges: [{ from: "a", to: "b", type: "double-line" }],
      },
      preset,
    );
    // Double-line produces two <line> or <path> elements without marker-end
    expect(html).not.toContain('marker-end');
  });

  it("renders dashed edges with stroke-dasharray", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        edges: [{ from: "a", to: "b", type: "dashed" }],
      },
      preset,
    );
    expect(html).toContain("stroke-dasharray");
  });

  it("supports dark mode", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        dark: true,
        nodes: [{ id: "a", name: "A" }],
        edges: [],
      },
      preset,
    );
    expect(html).toContain("#16162a");
  });

  it("supports serif font", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        style: { font: "serif" },
        nodes: [{ id: "a", name: "A" }],
        edges: [],
      },
      preset,
    );
    expect(html).toContain("Georgia");
  });

  it("supports monochrome mode", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        style: { color: "monochrome" },
        nodes: [
          { id: "a", name: "A", color: "#ff0000" },
        ],
        edges: [],
      },
      preset,
    );
    // Monochrome overrides node colors — accent bar should not appear
    expect(html).not.toContain("#ff0000");
  });

  it("renders with radial layout", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        layout: "radial",
        nodes: [
          { id: "a", name: "Center" },
          { id: "b", name: "Outer1" },
          { id: "c", name: "Outer2" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "a", to: "c" },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("Center");
  });

  it("renders with force layout", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        layout: "force",
        nodes: [
          { id: "a", name: "Node1" },
          { id: "b", name: "Node2" },
          { id: "c", name: "Node3" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("Node1");
    expect(html).toContain("Node3");
  });

  it("renders node role and fields", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          {
            id: "a",
            name: "Alice",
            role: "CEO",
            fields: [{ label: "Dept", value: "Executive" }],
          },
        ],
        edges: [],
      },
      preset,
    );
    expect(html).toContain("CEO");
    expect(html).toContain("Dept");
    expect(html).toContain("Executive");
  });

  it("renders LR direction", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        direction: "LR",
        nodes: [
          { id: "a", name: "Left" },
          { id: "b", name: "Right" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("Left");
    expect(html).toContain("Right");
  });

  it("returns empty string for zero nodes", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [],
        edges: [],
      },
      preset,
    );
    expect(html).toBe("");
  });

  // --- XSS tests ---

  it("escapes node name, role, and field values", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          {
            id: "a",
            name: '<script>alert("xss")</script>',
            role: '<img onerror="hack">',
            fields: [{ label: "<b>L</b>", value: "<i>V</i>" }],
          },
        ],
        edges: [],
      },
      preset,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<img onerror');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&lt;i&gt;");
  });

  it("escapes edge labels", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        edges: [{ from: "a", to: "b", label: '<script>alert(1)</script>' }],
      },
      preset,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes title", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        title: '<img src=x onerror=alert(1)>',
        nodes: [{ id: "a", name: "A" }],
        edges: [],
      },
      preset,
    );
    expect(html).not.toContain("<img src");
    expect(html).toContain("&lt;img");
  });

  // --- Edge case tests ---

  it("handles self-loop edges without crashing", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [{ id: "a", name: "Self" }],
        edges: [{ from: "a", to: "a", label: "recursive" }],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("Self");
    expect(html).toContain("recursive");
  });

  it("handles cyclic graphs (A→B→C→A)", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
          { id: "c", name: "C" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
          { from: "c", to: "a" },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("A");
    expect(html).toContain("B");
    expect(html).toContain("C");
  });

  it("handles disconnected components", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
          { id: "c", name: "C" },
          { id: "d", name: "D" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "c", to: "d" },
        ],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("A");
    expect(html).toContain("D");
  });

  it("handles edges referencing non-existent nodes", () => {
    const html = renderBlock(
      {
        type: "relationship_graph",
        nodes: [{ id: "a", name: "A" }],
        edges: [{ from: "a", to: "nonexistent" }],
      },
      preset,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("A");
  });
});

// ---------------------------------------------------------------------------
// comparison_matrix — additional edge cases
// ---------------------------------------------------------------------------

describe("comparison_matrix edge cases", () => {
  const preset = resolvePreset("mckinsey");

  it("renders empty rows", () => {
    const html = renderBlock(
      {
        type: "comparison_matrix",
        columns: [{ id: "a", label: "A" }],
        rows: [],
      },
      preset,
    );
    expect(html).toContain("<table");
    expect(html).toContain("A");
  });

  it("handles missing column IDs in row gracefully", () => {
    const html = renderBlock(
      {
        type: "comparison_matrix",
        columns: [
          { id: "x", label: "X" },
          { id: "y", label: "Y" },
        ],
        rows: [{ x: "val" }], // missing "y"
      },
      preset,
    );
    expect(html).toContain("val");
    // Should not crash
  });
});

// ---------------------------------------------------------------------------
// sectioned_table — additional edge cases
// ---------------------------------------------------------------------------

describe("sectioned_table edge cases", () => {
  const preset = resolvePreset("mckinsey");

  it("handles subtotal column=0 without losing value", () => {
    const html = renderBlock(
      {
        type: "sectioned_table",
        sections: [
          {
            title: "S",
            headers: ["Amount"],
            rows: [["$100"]],
            subtotal: { label: "Total", column: 0, value: "$100" },
          },
        ],
      },
      preset,
    );
    expect(html).toContain("Total");
    expect(html).toContain("$100");
  });

  it("handles subtotal column exceeding header count", () => {
    const html = renderBlock(
      {
        type: "sectioned_table",
        sections: [
          {
            title: "S",
            headers: ["A", "B"],
            rows: [["1", "2"]],
            subtotal: { label: "Total", column: 99, value: "$500" },
          },
        ],
      },
      preset,
    );
    // Should clamp to last column and still render the value
    expect(html).toContain("Total");
    expect(html).toContain("$500");
  });

  it("renders empty sections", () => {
    const html = renderBlock(
      {
        type: "sectioned_table",
        sections: [],
      },
      preset,
    );
    // Should not crash
    expect(html).toBeTruthy();
  });
});
