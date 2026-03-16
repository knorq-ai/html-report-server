/**
 * SVG diagram renderer — layered architecture diagrams.
 *
 * Renders DiagramBlock as an SVG with layers stacked vertically,
 * nodes distributed horizontally within layers, optional groups
 * wrapping subsets of nodes, and edges connecting nodes with arrows.
 */

import type { DiagramBlock, DiagramNode, DiagramEdge, DiagramGroup, StylePreset } from "./types.js";
import { escapeHtml, sanitizeCssValue, elem } from "./html-utils.js";
import { inlineStyle } from "./theme.js";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const CANVAS_WIDTH = 1200;
const LAYER_PAD_X = 24;
const LAYER_PAD_INNER = 24;
const LAYER_GAP = 28;
const LAYER_LABEL_HEIGHT = 28;
const NODE_GAP = 14;
const NODE_MIN_W = 140;
const NODE_MAX_W = 280;
const NODE_BASE_H = 72;
const NODE_LINE_H = 17;
const NODE_PAD_LEFT = 16;
const GROUP_PAD = 14;
const GROUP_LABEL_H = 22;
const TITLE_H = 44;
const TOP_PAD = 20;

const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// ---------------------------------------------------------------------------
// Computed position types
// ---------------------------------------------------------------------------

interface NodePos {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

interface ThemeColors {
  canvasBg: string;
  layerBg: (color: string) => string;
  layerBorder: (color: string) => string;
  layerLabelColor: (color: string) => string;
  nodeBg: string;
  nodeBorder: (color: string | undefined) => string;
  nodeShadow: string;
  nodeTitleColor: string;
  nodeTextColor: string;
  groupBorder: (color: string) => string;
  groupLabelColor: (color: string) => string;
  groupLabelBg: string;
  edgeColor: string;
  edgeLabelColor: string;
  edgeLabelBg: string;
  titleColor: string;
  subtitleColor: string;
}

function darkTheme(): ThemeColors {
  return {
    canvasBg: "#16162a",
    layerBg: (c) => hexToRgba(c, 0.08),
    layerBorder: (c) => hexToRgba(c, 0.25),
    layerLabelColor: (c) => lighten(c, 0.45),
    nodeBg: "#1e1e38",
    nodeBorder: (c) => c ? hexToRgba(c, 0.4) : "rgba(255,255,255,0.08)",
    nodeShadow: "rgba(0,0,0,0.3)",
    nodeTitleColor: "#f0f0f8",
    nodeTextColor: "#9898b0",
    groupBorder: (c) => lighten(c, 0.25),
    groupLabelColor: (c) => lighten(c, 0.45),
    groupLabelBg: "#16162a",
    edgeColor: "#6e6e8e",
    edgeLabelColor: "#9898b0",
    edgeLabelBg: "#16162a",
    titleColor: "#f0f0f8",
    subtitleColor: "#8888a8",
  };
}

function lightTheme(): ThemeColors {
  return {
    canvasBg: "var(--bg)",
    layerBg: (c) => hexToRgba(c, 0.05),
    layerBorder: (c) => hexToRgba(c, 0.15),
    layerLabelColor: (c) => c,
    nodeBg: "var(--bg)",
    nodeBorder: (c) => c ?? "var(--border)",
    nodeShadow: "rgba(0,0,0,0.06)",
    nodeTitleColor: "var(--fg)",
    nodeTextColor: "var(--muted)",
    groupBorder: (c) => c,
    groupLabelColor: (c) => c,
    groupLabelBg: "var(--bg)",
    edgeColor: "var(--muted)",
    edgeLabelColor: "var(--muted)",
    edgeLabelBg: "var(--bg)",
    titleColor: "var(--fg)",
    subtitleColor: "var(--muted)",
  };
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length >= 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

function hexToRgba(color: string, alpha: number): string {
  const rgb = parseHex(color);
  if (rgb) return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  return color;
}

function lighten(color: string, amount: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const lightenCh = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `rgb(${lightenCh(rgb[0])},${lightenCh(rgb[1])},${lightenCh(rgb[2])})`;
}

// ---------------------------------------------------------------------------
// Default colors for layers / nodes
// ---------------------------------------------------------------------------

const DEFAULT_LAYER_COLORS = [
  "#4a90d9", "#50b86c", "#e6a23c", "#e25d5d",
  "#9b59b6", "#1abc9c", "#e67e22", "#3498db",
];

function defaultLayerColor(index: number): string {
  return DEFAULT_LAYER_COLORS[index % DEFAULT_LAYER_COLORS.length];
}

// ---------------------------------------------------------------------------
// Layout computation
// ---------------------------------------------------------------------------

interface LayerLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  nodes: Array<{ node: DiagramNode; pos: NodePos }>;
  groups: Array<{ group: DiagramGroup; x: number; y: number; w: number; h: number }>;
}

function computeNodeHeight(node: DiagramNode): number {
  const lineCount = node.lines?.length ?? 0;
  return NODE_BASE_H + lineCount * NODE_LINE_H;
}

function computeLayout(block: DiagramBlock): {
  totalHeight: number;
  layers: LayerLayout[];
  nodeMap: Map<string, NodePos>;
} {
  const hasTitle = !!block.title;
  let currentY = TOP_PAD + (hasTitle ? TITLE_H : 0);
  const layerOuterWidth = CANVAS_WIDTH - 2 * LAYER_PAD_X;
  const layers: LayerLayout[] = [];
  const nodeMap = new Map<string, NodePos>();

  for (let li = 0; li < block.layers.length; li++) {
    const layer = block.layers[li];
    const color = sanitizeCssValue(layer.color ?? defaultLayerColor(li));
    const nodeCount = layer.nodes.length;

    if (nodeCount === 0) {
      const layerH = LAYER_LABEL_HEIGHT + 2 * LAYER_PAD_INNER;
      layers.push({
        x: LAYER_PAD_X, y: currentY, w: layerOuterWidth, h: layerH,
        label: layer.label, color, nodes: [], groups: [],
      });
      currentY += layerH + LAYER_GAP;
      continue;
    }

    const availableW = layerOuterWidth - 2 * LAYER_PAD_INNER;
    const rawNodeW = (availableW - (nodeCount - 1) * NODE_GAP) / nodeCount;
    const nodeW = Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, rawNodeW));

    const nodeHeights = layer.nodes.map(computeNodeHeight);
    const maxNodeH = Math.max(...nodeHeights);

    const nodesAreaTop = LAYER_LABEL_HEIGHT + LAYER_PAD_INNER;
    const hasGroups = (layer.groups?.length ?? 0) > 0;
    const groupExtra = hasGroups ? GROUP_LABEL_H + GROUP_PAD * 2 : 0;
    const layerH = nodesAreaTop + LAYER_PAD_INNER + maxNodeH + groupExtra + LAYER_PAD_INNER;

    const totalNodesW = nodeCount * nodeW + (nodeCount - 1) * NODE_GAP;
    const startX = LAYER_PAD_X + LAYER_PAD_INNER + (availableW - totalNodesW) / 2;
    const nodeY = currentY + nodesAreaTop + LAYER_PAD_INNER + (hasGroups ? GROUP_LABEL_H + GROUP_PAD : 0);

    const layerNodes: LayerLayout["nodes"] = [];
    for (let ni = 0; ni < nodeCount; ni++) {
      const node = layer.nodes[ni];
      const nx = startX + ni * (nodeW + NODE_GAP);
      const nh = nodeHeights[ni];
      const pos: NodePos = {
        x: nx, y: nodeY, w: nodeW, h: nh,
        cx: nx + nodeW / 2, cy: nodeY + nh / 2,
      };
      layerNodes.push({ node, pos });
      nodeMap.set(node.id, pos);
    }

    const groupLayouts: LayerLayout["groups"] = [];
    if (layer.groups) {
      for (const group of layer.groups) {
        const memberPositions = group.nodeIds
          .map((id) => nodeMap.get(id))
          .filter((p): p is NodePos => p !== undefined);
        if (memberPositions.length === 0) continue;

        const gx = Math.min(...memberPositions.map((p) => p.x)) - GROUP_PAD;
        const gy = Math.min(...memberPositions.map((p) => p.y)) - GROUP_PAD - GROUP_LABEL_H;
        const gRight = Math.max(...memberPositions.map((p) => p.x + p.w)) + GROUP_PAD;
        const gBottom = Math.max(...memberPositions.map((p) => p.y + p.h)) + GROUP_PAD;

        groupLayouts.push({ group, x: gx, y: gy, w: gRight - gx, h: gBottom - gy });
      }
    }

    layers.push({
      x: LAYER_PAD_X, y: currentY, w: layerOuterWidth, h: layerH,
      label: layer.label, color, nodes: layerNodes, groups: groupLayouts,
    });
    currentY += layerH + LAYER_GAP;
  }

  return { totalHeight: currentY + TOP_PAD, layers, nodeMap };
}

// ---------------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------------

function renderArrowMarker(id: string, color: string): string {
  return (
    `<marker id="${escapeHtml(id)}" viewBox="0 0 10 7" refX="9" refY="3.5" ` +
    `markerWidth="7" markerHeight="5" orient="auto-start-reverse">` +
    `<path d="M 0 0.5 L 9 3.5 L 0 6.5 z" fill="${sanitizeCssValue(color)}" />` +
    `</marker>`
  );
}

function renderShadowFilter(): string {
  return [
    '<filter id="node-shadow" x="-4%" y="-4%" width="108%" height="116%">',
    '  <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.18" />',
    '</filter>',
  ].join("\n");
}

function renderNode(
  node: DiagramNode,
  pos: NodePos,
  theme: ThemeColors,
): string {
  const parts: string[] = [];
  const accentColor = node.color ? sanitizeCssValue(node.color) : undefined;
  const titleColor = node.textColor
    ? sanitizeCssValue(node.textColor)
    : accentColor ?? theme.nodeTitleColor;
  const borderColor = theme.nodeBorder(accentColor);
  const rx = 6;

  // Node shadow + background
  parts.push(
    `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" ` +
    `rx="${rx}" ry="${rx}" fill="${theme.nodeBg}" filter="url(#node-shadow)" />`,
  );
  // Border
  parts.push(
    `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" ` +
    `rx="${rx}" ry="${rx}" fill="none" stroke="${borderColor}" stroke-width="1" />`,
  );

  // Left accent bar
  if (accentColor) {
    parts.push(
      `<rect x="${pos.x + 1}" y="${pos.y + 6}" width="3" height="${pos.h - 12}" ` +
      `rx="1.5" fill="${accentColor}" />`,
    );
  }

  // Title text
  const textX = pos.x + NODE_PAD_LEFT;
  const textY = pos.y + 26;
  parts.push(
    `<text x="${textX}" y="${textY}" font-family="${FONT_FAMILY}" ` +
    `font-size="13" font-weight="700" fill="${titleColor}">` +
    `${escapeHtml(node.title)}</text>`,
  );

  // Description lines
  if (node.lines) {
    for (let i = 0; i < node.lines.length; i++) {
      parts.push(
        `<text x="${textX}" y="${textY + 18 + i * NODE_LINE_H}" ` +
        `font-family="${FONT_FAMILY}" font-size="11" fill="${theme.nodeTextColor}">` +
        `${escapeHtml(node.lines[i])}</text>`,
      );
    }
  }

  return parts.join("\n");
}

function renderGroupRect(
  gl: { group: DiagramGroup; x: number; y: number; w: number; h: number },
  theme: ThemeColors,
): string {
  const parts: string[] = [];
  const color = gl.group.color ? sanitizeCssValue(gl.group.color) : "#888888";
  const borderColor = theme.groupBorder(color);
  const strokeDash = (gl.group.style ?? "dashed") === "dashed" ? ' stroke-dasharray="6,3"' : "";

  parts.push(
    `<rect x="${gl.x}" y="${gl.y}" width="${gl.w}" height="${gl.h}" ` +
    `rx="6" ry="6" fill="none" stroke="${borderColor}" stroke-width="1.5"${strokeDash} />`,
  );

  if (gl.group.label) {
    const labelColor = theme.groupLabelColor(color);
    // Background pill behind label for readability
    const labelText = gl.group.label.toUpperCase();
    const labelW = labelText.length * 6.5 + 12;
    parts.push(
      `<rect x="${gl.x + 8}" y="${gl.y - 1}" width="${labelW}" height="16" ` +
      `rx="2" fill="${theme.groupLabelBg}" />`,
    );
    parts.push(
      `<text x="${gl.x + 14}" y="${gl.y + 11}" font-family="${FONT_FAMILY}" ` +
      `font-size="9" font-weight="700" letter-spacing="0.06em" fill="${labelColor}">` +
      `${escapeHtml(labelText)}</text>`,
    );
  }

  return parts.join("\n");
}

function renderEdge(
  edge: DiagramEdge,
  nodeMap: Map<string, NodePos>,
  markerId: string,
  theme: ThemeColors,
): string {
  const srcPos = nodeMap.get(edge.from);
  const tgtPos = nodeMap.get(edge.to);
  if (!srcPos || !tgtPos) return "";

  const color = edge.color ? sanitizeCssValue(edge.color) : theme.edgeColor;
  const strokeDash = (edge.style ?? "solid") === "dashed" ? ' stroke-dasharray="5,3"' : "";
  const parts: string[] = [];

  const sameLayer = Math.abs(srcPos.cy - tgtPos.cy) < 20;

  let pathD: string;
  let labelX: number;
  let labelY: number;

  if (sameLayer) {
    const fromRight = srcPos.cx < tgtPos.cx;
    const sx = fromRight ? srcPos.x + srcPos.w : srcPos.x;
    const sy = srcPos.cy;
    const tx = fromRight ? tgtPos.x : tgtPos.x + tgtPos.w;
    const ty = tgtPos.cy;
    pathD = `M ${sx} ${sy} L ${tx} ${ty}`;
    labelX = (sx + tx) / 2;
    labelY = sy - 7;
  } else {
    const goingDown = srcPos.cy < tgtPos.cy;
    const sx = srcPos.cx;
    const sy = goingDown ? srcPos.y + srcPos.h : srcPos.y;
    const tx = tgtPos.cx;
    const ty = goingDown ? tgtPos.y : tgtPos.y + tgtPos.h;
    const midY = (sy + ty) / 2;
    pathD = `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
    labelX = (sx + tx) / 2;
    labelY = midY - 7;
  }

  parts.push(
    `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5"${strokeDash} ` +
    `marker-end="url(#${escapeHtml(markerId)})" />`,
  );

  if (edge.label) {
    // Background pill for label readability
    const labelW = edge.label.length * 6 + 10;
    parts.push(
      `<rect x="${labelX - labelW / 2}" y="${labelY - 10}" width="${labelW}" height="14" ` +
      `rx="3" fill="${theme.edgeLabelBg}" opacity="0.85" />`,
    );
    parts.push(
      `<text x="${labelX}" y="${labelY}" font-family="${FONT_FAMILY}" ` +
      `font-size="9.5" font-style="italic" text-anchor="middle" fill="${theme.edgeLabelColor}">` +
      `${escapeHtml(edge.label)}</text>`,
    );
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderDiagram(block: DiagramBlock, _preset: StylePreset): string {
  if (block.layers.length === 0) return "";

  const theme = block.dark ? darkTheme() : lightTheme();
  const { totalHeight, layers, nodeMap } = computeLayout(block);

  const svgParts: string[] = [];

  // Defs — arrow markers + drop shadow
  svgParts.push("<defs>");
  svgParts.push(renderShadowFilter());
  const arrowId = "diagram-arrow";
  svgParts.push(renderArrowMarker(arrowId, theme.edgeColor));
  const edgeColorSet = new Set<string>();
  for (const edge of block.edges) {
    if (edge.color) {
      const c = sanitizeCssValue(edge.color);
      if (!edgeColorSet.has(c)) {
        edgeColorSet.add(c);
        svgParts.push(renderArrowMarker(`arrow-${edgeColorSet.size}`, c));
      }
    }
  }
  svgParts.push("</defs>");

  const edgeColorMarkers = new Map<string, string>();
  let colorIdx = 0;
  for (const c of edgeColorSet) {
    colorIdx++;
    edgeColorMarkers.set(c, `arrow-${colorIdx}`);
  }

  // Canvas background
  if (block.dark) {
    svgParts.push(
      `<rect x="0" y="0" width="${CANVAS_WIDTH}" height="${totalHeight}" ` +
      `fill="${theme.canvasBg}" rx="10" />`,
    );
  }

  // Title
  if (block.title) {
    svgParts.push(
      `<text x="${CANVAS_WIDTH / 2}" y="${TOP_PAD + 24}" font-family="${FONT_FAMILY}" ` +
      `font-size="16" font-weight="700" text-anchor="middle" fill="${theme.titleColor}">` +
      `${escapeHtml(block.title)}</text>`,
    );
  }

  // Layers
  for (const ll of layers) {
    // Layer background
    svgParts.push(
      `<rect x="${ll.x}" y="${ll.y}" width="${ll.w}" height="${ll.h}" ` +
      `rx="8" ry="8" fill="${theme.layerBg(ll.color)}" ` +
      `stroke="${theme.layerBorder(ll.color)}" stroke-width="1" />`,
    );

    // Layer label
    const labelColor = theme.layerLabelColor(ll.color);
    svgParts.push(
      `<text x="${ll.x + 16}" y="${ll.y + 20}" font-family="${FONT_FAMILY}" ` +
      `font-size="10" font-weight="700" letter-spacing="0.08em" fill="${labelColor}">` +
      `${escapeHtml(ll.label.toUpperCase())}</text>`,
    );

    // Groups (behind nodes)
    for (const gl of ll.groups) {
      svgParts.push(renderGroupRect(gl, theme));
    }

    // Nodes
    for (const { node, pos } of ll.nodes) {
      svgParts.push(renderNode(node, pos, theme));
    }
  }

  // Edges (on top)
  for (const edge of block.edges) {
    const edgeColor = edge.color ? sanitizeCssValue(edge.color) : undefined;
    const mid = edgeColor ? edgeColorMarkers.get(edgeColor) ?? arrowId : arrowId;
    svgParts.push(renderEdge(edge, nodeMap, mid, theme));
  }

  const svg =
    `<svg viewBox="0 0 ${CANVAS_WIDTH} ${totalHeight}" xmlns="http://www.w3.org/2000/svg" ` +
    `role="img" aria-label="${escapeHtml(block.title ?? "Architecture diagram")}">\n` +
    `${svgParts.join("\n")}\n</svg>`;

  return elem("div", { style: inlineStyle({ margin: "0 auto", maxWidth: "100%", marginBottom: "1.25rem" }) }, svg);
}
