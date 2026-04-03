/**
 * Shared color utilities for SVG renderers (diagrams, graphs).
 */

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
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

export function hexToRgba(color: string, alpha: number): string {
  const rgb = parseHex(color);
  if (rgb) return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  return color;
}

export function lighten(color: string, amount: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const lightenCh = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `rgb(${lightenCh(rgb[0])},${lightenCh(rgb[1])},${lightenCh(rgb[2])})`;
}
