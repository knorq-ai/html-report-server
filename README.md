# html-report-server

A local [MCP](https://modelcontextprotocol.io/) server for generating styled HTML reports from structured JSON. Works with Claude Code, Cursor, and any MCP-compatible client.

**4 tools** to render publication-quality HTML reports — stat cards, tables, SVG charts, timelines, and more — with **80-90% fewer output tokens** compared to raw HTML generation.

## Why

When an LLM generates HTML reports, it outputs verbose inline styles, SVG paths, and layout markup. This server lets the LLM describe the report as compact JSON blocks, and the server expands them into fully-styled HTML with charts, cards, and professional layouts — all running locally via stdio with no file uploads.

## Features

| Category | Tools |
|---|---|
| **Render** | `render_report` — JSON DSL → styled HTML file (one call for an entire report) |
| **Read** | `read_report` — extract JSON structure from existing report for re-editing |
| **Edit** | `edit_report` — patch operations (replace, insert, delete blocks) |
| **Reference** | `get_component_examples` — example JSON for every block type |

### Style presets

| Preset | Character |
|---|---|
| `mckinsey` | Executive: uppercase headers, thin borders, generous whitespace |
| `clean` | Modern SaaS: subtle shadows, rounded corners, no borders |
| `minimal` | Content-dense: tight spacing, 720px width, no decoration |
| `dashboard` | Data-dense: 1200px width, dark header tables, compact layout |

### Block types (19)

`section` · `heading` · `paragraph` · `list` · `callout` · `stat_cards` · `hero_stats` · `metadata` · `table` · `bar_chart` · `line_chart` · `pie_chart` · `progress_bars` · `timeline` · `card_grid` · `comparison` · `badges` · `divider` · `html`

### Token efficiency

| Component | Raw HTML tokens | JSON DSL tokens | Savings |
|---|---|---|---|
| Stat card grid (3 cards) | ~350 | ~60 | **83%** |
| Data table (5×10) | ~600 | ~150 | **75%** |
| Bar chart (8 bars) | ~800 | ~60 | **92%** |
| SVG line chart | ~1200 | ~80 | **93%** |
| Full report (10 sections) | ~4000 | ~800 | **~80%** |

## Installation

### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "html-report": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "html-report-server@latest"]
    }
  }
}
```

### Cursor

Add to your MCP server configuration:

```json
{
  "html-report": {
    "command": "npx",
    "args": ["-y", "html-report-server@latest"]
  }
}
```

### Local development

```bash
git clone https://github.com/knorq-ai/html-report-server.git
cd html-report-server
npm install
npm run build
npm run dev  # or: node dist/index.js
```

## Usage

### render_report

The primary tool. Pass a complete report with title, style preset, and array of block objects:

```json
{
  "file_path": "/tmp/report.html",
  "title": "Q4 Performance Report",
  "subtitle": "Google Sheets → Cloud SQL Migration",
  "badge": "PERFORMANCE REPORT",
  "style": "mckinsey",
  "blocks": [
    { "type": "section", "title": "Key Metrics" },
    {
      "type": "stat_cards",
      "cards": [
        { "label": "Revenue", "value": "$4.2M", "delta": "+15%", "trend": "up" },
        { "label": "Users", "value": "12,847", "delta": "+28%", "trend": "up" }
      ]
    },
    {
      "type": "bar_chart",
      "title": "Monthly Revenue",
      "data": [
        { "label": "Jan", "value": 280 },
        { "label": "Feb", "value": 310 },
        { "label": "Mar", "value": 350 }
      ],
      "unit": "K"
    }
  ]
}
```

### Round-trip editing

```
1. render_report  → creates report.html
2. read_report    → returns JSON structure + block summary
3. edit_report    → patch operations (replace/insert/delete blocks)
```

The JSON source is embedded as an HTML comment in the output file, enabling seamless round-trip editing without a separate database.

### get_component_examples

Call this tool (no parameters) to get example JSON snippets for every block type. Useful for learning the DSL.

## Security

Since this server generates HTML from user input, all output is sanitized:

- **Text content**: escaped via `escapeHtml()` (prevents XSS in all text fields)
- **Inline HTML** (paragraph, callout): allowlist-based sanitizer permits only safe formatting tags (`b`, `i`, `em`, `strong`, `a`, `code`, `br`, `span`)
- **Raw HTML block**: allowlist-based sanitizer permits layout + formatting tags, strips `<script>`, `<iframe>`, event handlers, `javascript:` / `data:` URIs
- **CSS values** (user-supplied colors): sanitized to reject injection characters
- **HTML attributes**: auto-escaped in all element builders
- **JSON embedding**: `-->` escaped to prevent HTML comment breakout
- Sanitizers run in a loop until stable to prevent nested-tag bypass attacks

## Architecture

```
src/
├── index.ts           MCP server + 4 tool definitions
├── html-engine.ts     Public API barrel module
└── engine/
    ├── types.ts       TypeScript types (Block union, presets, DSL)
    ├── errors.ts      Structured error codes
    ├── file-lock.ts   Per-file write serialization
    ├── theme.ts       4 style presets + inline style builder
    ├── html-utils.ts  HTML escaping + sanitization
    ├── charts.ts      SVG bar/line/pie/donut charts
    ├── components.ts  19 block type renderers
    ├── renderer.ts    Main render loop + block summarizer
    └── html-io.ts     File I/O + JSON comment round-trip
```

## Limitations

- **No JavaScript in output**: all `<script>` tags and event handlers are stripped
- **No external CSS**: output uses inline styles only (CSS variables from host)
- **No image insertion**: charts are inline SVG, no raster image support
- **No formula recalculation**: chart data is static
- **CJK text width**: SVG chart legend spacing uses character-count heuristic

## License

MIT
