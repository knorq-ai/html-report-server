/**
 * SVG relationship graph renderer — node-and-edge diagrams
 * with hierarchical, radial, and force-directed layouts.
 *
 * Follows the same pure-SVG, zero-dependency pattern as diagrams.ts.
 *
 * Performance: force layout is O(n²) per iteration × 80 iterations.
 * The Zod schema caps nodes at 100, bounding worst case to ~400K pair
 * computations (~10-50ms on modern hardware).
 */

import type {
  RelationshipGraphBlock,
  GraphNode,
  GraphEdge,
  GraphEdgeType,
  GraphStyle,
  StylePreset,
} from "./types.js";
import { escapeHtml, sanitizeCssValue, elem } from "./html-utils.js";
import { inlineStyle } from "./theme.js";
import { hexToRgba } from "./color-utils.js";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const NODE_PAD_X = 16;
const NODE_PAD_Y = 12;
const NODE_MIN_W = 160;
const NODE_MAX_W = 300;
const NODE_GAP_H = 50;
const NODE_GAP_V = 70;
const ROLE_FONT_SIZE = 10;
const NAME_FONT_SIZE = 14;
const FIELD_FONT_SIZE = 11;
const FIELD_LINE_H = 16;
const TITLE_H = 44;
const TOP_PAD = 30;
const CANVAS_PAD = 40;

const SANS_SERIF_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF_FONT =
  "'Georgia', 'Times New Roman', 'Hiragino Mincho ProN', 'Yu Mincho', serif";

// ---------------------------------------------------------------------------
// CJK-aware text width estimation
// ---------------------------------------------------------------------------

/**
 * Estimate rendered text width in pixels. CJK characters are counted as
 * ~1.8× the width of Latin characters (a rough but practical heuristic
 * matching the typical glyph metrics in proportional fonts).
 */
function estimateTextWidth(text: string, charW: number, fontSize: number): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs, Hiragana, Katakana, CJK Symbols, fullwidth forms
    const isCjk =
      (code >= 0x2E80 && code <= 0x9FFF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFF00 && code <= 0xFFEF) ||
      (code >= 0x20000 && code <= 0x2FA1F);
    units += isCjk ? 1.8 : 1;
  }
  return units * charW * (fontSize / 12);
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

interface ThemeColors {
  canvasBg: string;
  nodeBg: string;
  nodeBorder: string;
  nodeShadow: string;
  roleColor: string;
  nameColor: string;
  fieldLabelColor: string;
  fieldValueColor: string;
  edgeColor: string;
  edgeLabelColor: string;
  edgeLabelBg: string;
  titleColor: string;
}

function darkTheme(mono: boolean): ThemeColors {
  const border = mono ? "#666" : "rgba(255,255,255,0.15)";
  return {
    canvasBg: "#16162a",
    nodeBg: "#1e1e38",
    nodeBorder: border,
    nodeShadow: "rgba(0,0,0,0.3)",
    roleColor: mono ? "#aaa" : "#9898b0",
    nameColor: "#f0f0f8",
    fieldLabelColor: "#8888a8",
    fieldValueColor: "#c0c0d0",
    edgeColor: mono ? "#888" : "#6e6e8e",
    edgeLabelColor: "#9898b0",
    edgeLabelBg: "#16162a",
    titleColor: "#f0f0f8",
  };
}

function lightTheme(mono: boolean): ThemeColors {
  const border = mono ? "#999" : "var(--border)";
  return {
    canvasBg: "var(--bg)",
    nodeBg: "var(--bg)",
    nodeBorder: border,
    nodeShadow: "rgba(0,0,0,0.06)",
    roleColor: mono ? "#666" : "var(--muted)",
    nameColor: "var(--fg)",
    fieldLabelColor: "var(--muted)",
    fieldValueColor: "var(--fg)",
    edgeColor: mono ? "#888" : "var(--muted)",
    edgeLabelColor: "var(--muted)",
    edgeLabelBg: "var(--bg)",
    titleColor: "var(--fg)",
  };
}

// ---------------------------------------------------------------------------
// Default node colors
// ---------------------------------------------------------------------------

const DEFAULT_NODE_COLORS = [
  "#4a90d9", "#50b86c", "#e6a23c", "#e25d5d",
  "#9b59b6", "#1abc9c", "#e67e22", "#3498db",
];

// ---------------------------------------------------------------------------
// Safe min/max helpers (avoid spread on large arrays)
// ---------------------------------------------------------------------------

function safeMax(values: number[], fallback = 0): number {
  return values.length === 0 ? fallback : values.reduce((a, b) => Math.max(a, b), -Infinity);
}

function safeMin(values: number[], fallback = 0): number {
  return values.length === 0 ? fallback : values.reduce((a, b) => Math.min(a, b), Infinity);
}

// ---------------------------------------------------------------------------
// Node sizing
// ---------------------------------------------------------------------------

interface NodePos {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

function computeNodeSize(node: GraphNode, fontFamily: string): { w: number; h: number } {
  const charW = fontFamily.startsWith("'Georgia") ? 8.5 : 7.5;
  const nameW = estimateTextWidth(node.name, charW, NAME_FONT_SIZE);
  const roleW = node.role ? estimateTextWidth(node.role, charW, ROLE_FONT_SIZE) : 0;
  const fieldWidths = (node.fields ?? []).map(
    (f) => estimateTextWidth(`${f.label}: ${f.value}`, charW, FIELD_FONT_SIZE),
  );
  const maxTextW = safeMax([nameW, roleW, ...fieldWidths]);
  const w = Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, maxTextW + NODE_PAD_X * 2 + 8));

  let h = NODE_PAD_Y * 2;
  if (node.role) h += ROLE_FONT_SIZE + 6;
  h += NAME_FONT_SIZE + 4;
  if (node.fields && node.fields.length > 0) {
    h += 6 + node.fields.length * FIELD_LINE_H;
  }
  h = Math.max(48, h);

  return { w, h };
}

// ---------------------------------------------------------------------------
// Layout algorithms
// ---------------------------------------------------------------------------

interface LayoutResult {
  positions: Map<string, NodePos>;
  width: number;
  height: number;
}

function buildAdjacency(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { children: Map<string, string[]>; parents: Map<string, string[]> } {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const n of nodes) {
    children.set(n.id, []);
    parents.set(n.id, []);
  }
  for (const e of edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    if (e.from === e.to) continue; // Skip self-loops for layout
    children.get(e.from)!.push(e.to);
    parents.get(e.to)!.push(e.from);
  }
  return { children, parents };
}

/**
 * Assign BFS levels starting from root nodes (no parents).
 * Handles disconnected components by restarting BFS from unvisited nodes.
 * Handles cycles by treating first-visit level as final.
 */
function bfsLevels(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, number> {
  const { children, parents } = buildAdjacency(nodes, edges);
  const levels = new Map<string, number>();
  const visited = new Set<string>();

  // Roots = nodes with no parents
  const roots = nodes.filter((n) => parents.get(n.id)!.length === 0);
  // If no clear roots (fully cyclic), pick the first node
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0]);

  const queue: Array<{ id: string; level: number }> = roots.map((n) => ({ id: n.id, level: 0 }));
  for (const r of queue) visited.add(r.id);

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    levels.set(id, level);
    for (const childId of children.get(id) ?? []) {
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push({ id: childId, level: level + 1 });
      }
    }

    // If queue is empty but unvisited nodes remain (disconnected components),
    // pick the next unvisited node as a new root at the current max level + 1.
    if (queue.length === 0) {
      for (const n of nodes) {
        if (!visited.has(n.id)) {
          const nextLevel = levels.size > 0 ? safeMax([...levels.values()]) + 1 : 0;
          visited.add(n.id);
          queue.push({ id: n.id, level: nextLevel });
          break;
        }
      }
    }
  }

  return levels;
}

function hierarchicalLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: "TB" | "LR",
  fontFamily: string,
): LayoutResult {
  const levels = bfsLevels(nodes, edges);
  const sizes = new Map(nodes.map((n) => [n.id, computeNodeSize(n, fontFamily)]));

  // Group nodes by level
  const maxLevel = safeMax([...levels.values()]);
  const levelGroups: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const [id, level] of levels) {
    levelGroups[level].push(id);
  }

  // Preserve input order within each level
  for (const group of levelGroups) {
    group.sort((a, b) => nodes.findIndex((n) => n.id === a) - nodes.findIndex((n) => n.id === b));
  }

  const positions = new Map<string, NodePos>();

  if (direction === "TB") {
    let currentY = 0;
    for (const group of levelGroups) {
      if (group.length === 0) continue;
      const totalW = group.reduce((sum, id) => sum + sizes.get(id)!.w, 0) + (group.length - 1) * NODE_GAP_H;
      let x = -totalW / 2;
      const maxH = safeMax(group.map((id) => sizes.get(id)!.h));
      for (const id of group) {
        const { w, h } = sizes.get(id)!;
        const y = currentY + (maxH - h) / 2;
        positions.set(id, { x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
        x += w + NODE_GAP_H;
      }
      currentY += maxH + NODE_GAP_V;
    }
  } else {
    // LR
    let currentX = 0;
    for (const group of levelGroups) {
      if (group.length === 0) continue;
      const totalH = group.reduce((sum, id) => sum + sizes.get(id)!.h, 0) + (group.length - 1) * NODE_GAP_H;
      let y = -totalH / 2;
      const maxW = safeMax(group.map((id) => sizes.get(id)!.w));
      for (const id of group) {
        const { w, h } = sizes.get(id)!;
        const x = currentX + (maxW - w) / 2;
        positions.set(id, { x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
        y += h + NODE_GAP_H;
      }
      currentX += maxW + NODE_GAP_V;
    }
  }

  // Normalize to positive coordinates
  return normalizePositions(positions);
}

function radialLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  fontFamily: string,
): LayoutResult {
  const levels = bfsLevels(nodes, edges);
  const sizes = new Map(nodes.map((n) => [n.id, computeNodeSize(n, fontFamily)]));

  const maxLevel = safeMax([...levels.values()]);
  const levelGroups: string[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const [id, level] of levels) {
    levelGroups[level].push(id);
  }

  const ringGap = 140;
  const positions = new Map<string, NodePos>();

  // Compute centroid of root group for ring centering
  let rootCenterX = 0;
  for (let li = 0; li < levelGroups.length; li++) {
    const group = levelGroups[li];
    if (group.length === 0) continue;

    if (li === 0) {
      // Center node(s), compute centroid
      let offsetX = 0;
      const totalW = group.reduce((sum, id) => sum + sizes.get(id)!.w, 0) + (group.length - 1) * NODE_GAP_H;
      const startX = -totalW / 2;
      offsetX = startX;
      for (const id of group) {
        const { w, h } = sizes.get(id)!;
        positions.set(id, {
          x: offsetX,
          y: -h / 2,
          w, h,
          cx: offsetX + w / 2,
          cy: 0,
        });
        offsetX += w + NODE_GAP_H;
      }
      rootCenterX = startX + totalW / 2;
    } else {
      const radius = li * ringGap;
      const angleStep = (2 * Math.PI) / Math.max(group.length, 1);
      const startAngle = -Math.PI / 2;
      for (let ni = 0; ni < group.length; ni++) {
        const id = group[ni];
        const { w, h } = sizes.get(id)!;
        const angle = startAngle + ni * angleStep;
        const cx = rootCenterX + Math.cos(angle) * radius;
        const cy = Math.sin(angle) * radius;
        positions.set(id, {
          x: cx - w / 2,
          y: cy - h / 2,
          w, h, cx, cy,
        });
      }
    }
  }

  return normalizePositions(positions);
}

function forceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  fontFamily: string,
): LayoutResult {
  const sizes = new Map(nodes.map((n) => [n.id, computeNodeSize(n, fontFamily)]));
  const nodeIds = nodes.map((n) => n.id);

  // Initialize positions in a grid
  const cols = Math.ceil(Math.sqrt(nodeIds.length));
  const posMap = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < nodeIds.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    posMap.set(nodeIds[i], { x: col * 200, y: row * 150 });
  }

  const validEdges = edges.filter((e) => posMap.has(e.from) && posMap.has(e.to) && e.from !== e.to);

  // Force simulation
  const iterations = 80;
  const repulsion = 50000;
  const attraction = 0.005;
  const damping = 0.9;

  const vel = new Map<string, { vx: number; vy: number }>();
  for (const id of nodeIds) vel.set(id, { vx: 0, vy: 0 });

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations;

    // Repulsion between all pairs
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = posMap.get(nodeIds[i])!;
        const b = posMap.get(nodeIds[j])!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = (repulsion * temp) / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        vel.get(nodeIds[i])!.vx -= dx;
        vel.get(nodeIds[i])!.vy -= dy;
        vel.get(nodeIds[j])!.vx += dx;
        vel.get(nodeIds[j])!.vy += dy;
      }
    }

    // Attraction along edges
    for (const e of validEdges) {
      const a = posMap.get(e.from)!;
      const b = posMap.get(e.to)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const force = attraction * temp;
      vel.get(e.from)!.vx += dx * force;
      vel.get(e.from)!.vy += dy * force;
      vel.get(e.to)!.vx -= dx * force;
      vel.get(e.to)!.vy -= dy * force;
    }

    // Apply velocities
    for (const id of nodeIds) {
      const v = vel.get(id)!;
      const p = posMap.get(id)!;
      v.vx *= damping;
      v.vy *= damping;
      p.x += v.vx;
      p.y += v.vy;
    }
  }

  // Build positions
  const positions = new Map<string, NodePos>();
  for (const id of nodeIds) {
    const p = posMap.get(id)!;
    const { w, h } = sizes.get(id)!;
    positions.set(id, {
      x: p.x - w / 2,
      y: p.y - h / 2,
      w, h,
      cx: p.x,
      cy: p.y,
    });
  }

  return normalizePositions(positions);
}

/** Shift all positions so min-x/min-y is 0, compute bounding dimensions. */
function normalizePositions(positions: Map<string, NodePos>): LayoutResult {
  const allPos = [...positions.values()];
  if (allPos.length === 0) return { positions, width: 0, height: 0 };

  const minX = safeMin(allPos.map((p) => p.x));
  const minY = safeMin(allPos.map((p) => p.y));
  for (const pos of positions.values()) {
    pos.x -= minX;
    pos.y -= minY;
    pos.cx = pos.x + pos.w / 2;
    pos.cy = pos.y + pos.h / 2;
  }

  const width = safeMax(allPos.map((p) => p.x + p.w - minX));
  const height = safeMax(allPos.map((p) => p.y + p.h - minY));

  return { positions, width, height };
}

// ---------------------------------------------------------------------------
// SVG rendering helpers
// ---------------------------------------------------------------------------

function renderShadowFilter(uid: string): string {
  return [
    `<filter id="gshadow-${uid}" x="-4%" y="-4%" width="108%" height="116%">`,
    '  <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15" />',
    "</filter>",
  ].join("\n");
}

function renderArrowMarker(id: string, color: string): string {
  return (
    `<marker id="${escapeHtml(id)}" viewBox="0 0 10 7" refX="9" refY="3.5" ` +
    `markerWidth="7" markerHeight="5" orient="auto-start-reverse">` +
    `<path d="M 0 0.5 L 9 3.5 L 0 6.5 z" fill="${sanitizeCssValue(color)}" />` +
    `</marker>`
  );
}

function renderGraphNode(
  node: GraphNode,
  pos: NodePos,
  theme: ThemeColors,
  fontFamily: string,
  mono: boolean,
  colorIndex: number,
  uid: string,
): string {
  const parts: string[] = [];
  const accentColor = mono
    ? "#666"
    : node.color
      ? sanitizeCssValue(node.color)
      : DEFAULT_NODE_COLORS[colorIndex % DEFAULT_NODE_COLORS.length];

  const rx = 8;

  // Shadow + background
  parts.push(
    `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" ` +
    `rx="${rx}" ry="${rx}" fill="${theme.nodeBg}" filter="url(#gshadow-${uid})" />`,
  );

  // Border — use hexToRgba only for hex colors, fallback to solid for CSS vars
  const isHexColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accentColor);
  const borderColor = mono
    ? theme.nodeBorder
    : isHexColor ? hexToRgba(accentColor, 0.4) : accentColor;
  parts.push(
    `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" ` +
    `rx="${rx}" ry="${rx}" fill="none" stroke="${borderColor}" stroke-width="1.5" />`,
  );

  // Left accent bar
  if (!mono) {
    parts.push(
      `<rect x="${pos.x + 1}" y="${pos.y + 8}" width="3" height="${pos.h - 16}" ` +
      `rx="1.5" fill="${accentColor}" />`,
    );
  }

  let textY = pos.y + NODE_PAD_Y;
  const textX = pos.x + NODE_PAD_X + (mono ? 0 : 6);

  // Role label
  if (node.role) {
    textY += ROLE_FONT_SIZE;
    parts.push(
      `<text x="${textX}" y="${textY}" font-family="${fontFamily}" ` +
      `font-size="${ROLE_FONT_SIZE}" font-weight="600" letter-spacing="0.04em" ` +
      `fill="${mono ? theme.roleColor : accentColor}">${escapeHtml(node.role)}</text>`,
    );
    textY += 6;
  }

  // Name
  textY += NAME_FONT_SIZE;
  parts.push(
    `<text x="${textX}" y="${textY}" font-family="${fontFamily}" ` +
    `font-size="${NAME_FONT_SIZE}" font-weight="700" fill="${theme.nameColor}">` +
    `${escapeHtml(node.name)}</text>`,
  );

  // Fields
  if (node.fields && node.fields.length > 0) {
    textY += 6;
    for (const field of node.fields) {
      textY += FIELD_LINE_H;
      parts.push(
        `<text x="${textX}" y="${textY}" font-family="${fontFamily}" ` +
        `font-size="${FIELD_FONT_SIZE}" fill="${theme.fieldLabelColor}">` +
        `${escapeHtml(field.label)}: ` +
        `<tspan fill="${theme.fieldValueColor}">${escapeHtml(field.value)}</tspan></text>`,
      );
    }
  }

  return parts.join("\n");
}

/**
 * Render a self-loop as a curved arc above/right of the node.
 */
function renderSelfLoopEdge(
  edge: GraphEdge,
  pos: NodePos,
  markerId: string,
  edgeColorMarkers: Map<string, string>,
  theme: ThemeColors,
  fontFamily: string,
): string {
  const edgeType: GraphEdgeType = edge.type ?? "single-line";
  const color = edge.color ? sanitizeCssValue(edge.color) : theme.edgeColor;
  const parts: string[] = [];

  // Arc from right-top to right-bottom of node
  const sx = pos.x + pos.w;
  const sy = pos.cy - 10;
  const tx = pos.x + pos.w;
  const ty = pos.cy + 10;
  const bulge = 30;

  if (edgeType === "double-line") {
    for (const offset of [-2, 2]) {
      parts.push(
        `<path d="M ${sx} ${sy + offset} C ${sx + bulge + offset} ${sy - 15} ${tx + bulge + offset} ${ty + 15} ${tx} ${ty + offset}" ` +
        `fill="none" stroke="${color}" stroke-width="1.5" />`,
      );
    }
  } else {
    const dashAttr = edgeType === "dashed" ? ' stroke-dasharray="6,3"' : "";
    const mid = edge.color ? (edgeColorMarkers.get(sanitizeCssValue(edge.color)) ?? markerId) : markerId;
    parts.push(
      `<path d="M ${sx} ${sy} C ${sx + bulge} ${sy - 15} ${tx + bulge} ${ty + 15} ${tx} ${ty}" ` +
      `fill="none" stroke="${color}" stroke-width="1.5"${dashAttr} ` +
      `marker-end="url(#${escapeHtml(mid)})" />`,
    );
  }

  if (edge.label) {
    const labelX = sx + bulge + 5;
    const labelY = pos.cy;
    const labelW = estimateTextWidth(edge.label, 6, 9.5) + 10;
    parts.push(
      `<rect x="${labelX - labelW / 2}" y="${labelY - 7}" width="${labelW}" height="14" ` +
      `rx="3" fill="${theme.edgeLabelBg}" opacity="0.85" />`,
    );
    parts.push(
      `<text x="${labelX}" y="${labelY + 3}" font-family="${fontFamily}" ` +
      `font-size="9.5" font-style="italic" text-anchor="middle" fill="${theme.edgeLabelColor}">` +
      `${escapeHtml(edge.label)}</text>`,
    );
  }

  return parts.join("\n");
}

function renderGraphEdge(
  edge: GraphEdge,
  positions: Map<string, NodePos>,
  markerId: string,
  edgeColorMarkers: Map<string, string>,
  theme: ThemeColors,
  fontFamily: string,
): string {
  const srcPos = positions.get(edge.from);
  const tgtPos = positions.get(edge.to);
  if (!srcPos || !tgtPos) return "";

  // Self-loop: render as curved arc
  if (edge.from === edge.to) {
    return renderSelfLoopEdge(edge, srcPos, markerId, edgeColorMarkers, theme, fontFamily);
  }

  const edgeType: GraphEdgeType = edge.type ?? "single-line";
  const color = edge.color ? sanitizeCssValue(edge.color) : theme.edgeColor;
  const parts: string[] = [];

  // Compute connection points
  const dx = tgtPos.cx - srcPos.cx;
  const dy = tgtPos.cy - srcPos.cy;

  let sx: number, sy: number, tx: number, ty: number;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection
    if (dx > 0) {
      sx = srcPos.x + srcPos.w;
      tx = tgtPos.x;
    } else {
      sx = srcPos.x;
      tx = tgtPos.x + tgtPos.w;
    }
    sy = srcPos.cy;
    ty = tgtPos.cy;
  } else {
    // Vertical connection
    if (dy > 0) {
      sy = srcPos.y + srcPos.h;
      ty = tgtPos.y;
    } else {
      sy = srcPos.y;
      ty = tgtPos.y + tgtPos.h;
    }
    sx = srcPos.cx;
    tx = tgtPos.cx;
  }

  // For non-adjacent levels, use an L-shaped path via midpoint.
  // Choose routing direction based on the dominant axis:
  //   horizontal-dominant (|dx| > |dy|): route →↓→  (horizontal-first)
  //   vertical-dominant   (|dy| ≥ |dx|): route ↓→↓  (vertical-first)
  // Use a fixed offset from the source (not dependent on target) so sibling
  // edges from the same parent share the same bend position and look aligned.
  const bendOffset = NODE_GAP_V * 0.4;
  const midX = dx > 0 ? sx + bendOffset : sx - bendOffset;
  const midY = dy > 0 ? sy + bendOffset : sy - bendOffset;
  const isLShaped = Math.abs(dx) > 20 && Math.abs(dy) > 20;
  const horizontalFirst = Math.abs(dx) >= Math.abs(dy);

  // Build the path string
  function buildLPath(ox = 0, oy = 0): string {
    if (horizontalFirst) {
      // → ↓ →  (natural for LR layouts)
      return `M ${sx + ox} ${sy + oy} L ${midX + ox} ${sy + oy} L ${midX + ox} ${ty + oy} L ${tx + ox} ${ty + oy}`;
    }
    // ↓ → ↓  (natural for TB layouts)
    return `M ${sx + ox} ${sy + oy} L ${sx + ox} ${midY + oy} L ${tx + ox} ${midY + oy} L ${tx + ox} ${ty + oy}`;
  }

  // Label position: place at the bend midpoint
  const labelPosX = horizontalFirst ? midX : (sx + tx) / 2;
  const labelPosY = horizontalFirst ? (sy + ty) / 2 : midY;

  if (edgeType === "double-line") {
    // Two parallel lines, no arrowhead
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = 3;

    for (const sign of [-1, 1]) {
      const ox = nx * offset * sign;
      const oy = ny * offset * sign;
      if (isLShaped) {
        parts.push(
          `<path d="${buildLPath(ox, oy)}" fill="none" stroke="${color}" stroke-width="1.5" />`,
        );
      } else {
        parts.push(
          `<line x1="${sx + ox}" y1="${sy + oy}" x2="${tx + ox}" y2="${ty + oy}" ` +
          `stroke="${color}" stroke-width="1.5" />`,
        );
      }
    }
  } else {
    // Single or dashed line with arrow
    const dashAttr = edgeType === "dashed" ? ' stroke-dasharray="6,3"' : "";
    const mid = edge.color ? (edgeColorMarkers.get(sanitizeCssValue(edge.color)) ?? markerId) : markerId;

    if (isLShaped) {
      parts.push(
        `<path d="${buildLPath()}" fill="none" stroke="${color}" stroke-width="1.5"${dashAttr} ` +
        `marker-end="url(#${escapeHtml(mid)})" />`,
      );
    } else {
      parts.push(
        `<path d="M ${sx} ${sy} L ${tx} ${ty}" ` +
        `fill="none" stroke="${color}" stroke-width="1.5"${dashAttr} ` +
        `marker-end="url(#${escapeHtml(mid)})" />`,
      );
    }
  }

  // Edge label
  if (edge.label) {
    const labelW = estimateTextWidth(edge.label, 6, 9.5) + 10;

    // For L-shaped paths, place label at the bend; for straight paths, at midpoint.
    // For straight same-level edges where the label is wider than the gap,
    // position the label below the edge to avoid clipping into nodes.
    let labelX = isLShaped ? labelPosX : midX;
    let labelY: number;

    const edgeGap = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);
    if (!isLShaped && labelW > edgeGap * 0.8) {
      // Label would clip into nodes — place below both nodes' bottom edges
      labelY = Math.max(srcPos.y + srcPos.h, tgtPos.y + tgtPos.h) + 10;
    } else if (isLShaped) {
      labelY = labelPosY - 7;
    } else {
      labelY = midY - 7;
    }

    parts.push(
      `<rect x="${labelX - labelW / 2}" y="${labelY - 10}" width="${labelW}" height="14" ` +
      `rx="3" fill="${theme.edgeLabelBg}" opacity="0.85" />`,
    );
    parts.push(
      `<text x="${labelX}" y="${labelY}" font-family="${fontFamily}" ` +
      `font-size="9.5" font-style="italic" text-anchor="middle" fill="${theme.edgeLabelColor}">` +
      `${escapeHtml(edge.label)}</text>`,
    );
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Counter for generating unique SVG IDs across multiple graph blocks. */
let graphInstanceCounter = 0;

export function renderRelationshipGraph(
  block: RelationshipGraphBlock,
  _preset: StylePreset,
): string {
  if (block.nodes.length === 0) return "";

  const uid = String(++graphInstanceCounter);
  const graphStyle: GraphStyle = block.style ?? {};
  const mono = graphStyle.color === "monochrome";
  const printReady = graphStyle.printReady ?? false;
  const fontFamily = graphStyle.font === "serif" ? SERIF_FONT : SANS_SERIF_FONT;

  const theme: ThemeColors = {
    ...(block.dark && !printReady ? darkTheme(mono) : lightTheme(mono)),
    ...(printReady ? {
      canvasBg: "#ffffff",
      nodeBg: "#ffffff",
      nodeShadow: "none",
      edgeLabelBg: "#ffffff",
    } : {}),
  };

  // Layout
  const layout = block.layout ?? "hierarchical";
  const direction = block.direction ?? "TB";
  let result: LayoutResult;

  switch (layout) {
    case "hierarchical":
      result = hierarchicalLayout(block.nodes, block.edges, direction, fontFamily);
      break;
    case "radial":
      result = radialLayout(block.nodes, block.edges, fontFamily);
      break;
    case "force":
      result = forceLayout(block.nodes, block.edges, fontFamily);
      break;
  }

  const { positions } = result;

  // Compute canvas dimensions
  const totalW = result.width + CANVAS_PAD * 2;
  const hasTitle = !!block.title;
  const titleOffset = hasTitle ? TITLE_H : 0;
  const totalH = result.height + CANVAS_PAD * 2 + titleOffset;

  // Offset all positions by padding + title
  for (const pos of positions.values()) {
    pos.x += CANVAS_PAD;
    pos.y += CANVAS_PAD + titleOffset;
    pos.cx = pos.x + pos.w / 2;
    pos.cy = pos.y + pos.h / 2;
  }

  const canvasW = Math.max(totalW, 400);

  const svgParts: string[] = [];

  // Defs — unique IDs per graph instance to avoid collisions
  svgParts.push("<defs>");
  svgParts.push(renderShadowFilter(uid));
  const arrowId = `garrow-${uid}`;
  svgParts.push(renderArrowMarker(arrowId, theme.edgeColor));
  const edgeColorSet = new Set<string>();
  for (const edge of block.edges) {
    if (edge.color) {
      const c = sanitizeCssValue(edge.color);
      if (!edgeColorSet.has(c)) {
        edgeColorSet.add(c);
        svgParts.push(renderArrowMarker(`garrow-${uid}-${edgeColorSet.size}`, c));
      }
    }
  }
  svgParts.push("</defs>");

  const edgeColorMarkers = new Map<string, string>();
  let colorIdx = 0;
  for (const c of edgeColorSet) {
    colorIdx++;
    edgeColorMarkers.set(c, `garrow-${uid}-${colorIdx}`);
  }

  // Canvas background
  if (block.dark || printReady) {
    svgParts.push(
      `<rect x="0" y="0" width="${canvasW}" height="${totalH}" ` +
      `fill="${theme.canvasBg}" rx="10" />`,
    );
  }

  // Title
  if (block.title) {
    svgParts.push(
      `<text x="${canvasW / 2}" y="${TOP_PAD + 20}" font-family="${fontFamily}" ` +
      `font-size="16" font-weight="700" text-anchor="middle" fill="${theme.titleColor}">` +
      `${escapeHtml(block.title)}</text>`,
    );
  }

  // Edges (rendered behind nodes)
  for (const edge of block.edges) {
    svgParts.push(renderGraphEdge(edge, positions, arrowId, edgeColorMarkers, theme, fontFamily));
  }

  // Nodes
  let nodeColorIdx = 0;
  for (const node of block.nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    svgParts.push(renderGraphNode(node, pos, theme, fontFamily, mono, nodeColorIdx, uid));
    nodeColorIdx++;
  }

  const svg =
    `<svg viewBox="0 0 ${canvasW} ${totalH}" xmlns="http://www.w3.org/2000/svg" ` +
    `role="img" aria-label="${escapeHtml(block.title ?? "Relationship graph")}">\n` +
    `${svgParts.join("\n")}\n</svg>`;

  return elem(
    "div",
    { style: inlineStyle({ margin: "0 auto", maxWidth: "100%", marginBottom: "1.25rem" }) },
    svg,
  );
}
