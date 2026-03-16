/**
 * HTML utility functions — escaping, attribute building, element helpers.
 */

/** Escape text for safe HTML insertion. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a value for safe insertion inside an HTML attribute. */
function escapeAttr(val: string | number): string {
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Sanitize inline HTML, allowing only safe formatting tags.
 * Allowlist: b, i, em, strong, a, code, br, span, u, small.
 * Strips event handlers, javascript: URLs, and data: URIs.
 * Runs in a loop until stable to prevent nested-tag bypass.
 */
export function sanitizeInlineHtml(html: string): string {
  return sanitizeWithAllowlist(
    html,
    /^(?:b|i|em|strong|a|code|br|span|u|small)$/i,
  );
}

/**
 * Sanitize block-level HTML for the raw `html` escape hatch.
 * Extends the inline allowlist with layout elements safe for reports.
 * Allowlist: div, p, h1-h6, ul, ol, li, table, thead, tbody, tr, th, td,
 *   caption, hr, blockquote, pre, dl, dt, dd, figure, figcaption, section,
 *   header, footer, nav, main, article, aside, details, summary,
 *   plus all inline tags.
 */
export function sanitizeBlockHtml(html: string): string {
  return sanitizeWithAllowlist(
    html,
    /^(?:div|p|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|caption|colgroup|col|hr|blockquote|pre|dl|dt|dd|figure|figcaption|section|header|footer|nav|main|article|aside|details|summary|b|i|em|strong|a|code|br|span|u|small|sub|sup|abbr|cite|mark|time|del|ins|img|svg|path|rect|circle|line|polyline|polygon|text|g|defs|use|clippath|lineargradient|radialgradient|stop)$/i,
  );
}

/**
 * Core allowlist-based HTML sanitizer.
 * - Strips all tags not matching the allowlist regex
 * - Strips event handler attributes (on*)
 * - Strips javascript: and data: URIs in href/src/action
 * - Strips style attributes containing url() or expression()
 * - Runs in a loop until stable to prevent nested-tag bypass
 */
function sanitizeWithAllowlist(html: string, allowedTagPattern: RegExp): string {
  let s = html;
  let prev: string;

  // Loop until stable (prevents nested-tag bypass like <scr<script>ipt>)
  do {
    prev = s;

    // Strip tags not in the allowlist
    s = s.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag: string) => {
      return allowedTagPattern.test(tag) ? match : "";
    });

    // Strip event handler attributes from remaining tags
    s = s.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

    // Strip javascript: and data: URIs in href, src, action, xlink:href
    s = s.replace(/(href|src|action|xlink:href)\s*=\s*["']?\s*(javascript|data):/gi, "$1=\"");

    // Strip style attributes containing url() or expression() (CSS injection vector)
    s = s.replace(/style\s*=\s*"[^"]*(?:url\s*\(|expression\s*\()[^"]*"/gi, 'style=""');
    s = s.replace(/style\s*=\s*'[^']*(?:url\s*\(|expression\s*\()[^']*'/gi, "style=''");
  } while (s !== prev);

  return s;
}

/**
 * Validate a CSS color/value — rejects anything that could break out of
 * a CSS context (semicolons, braces, quotes, angle brackets).
 */
export function sanitizeCssValue(val: string): string {
  const cleaned = val.replace(/[;"'\\<>{}]/g, "");
  // Reject CSS functions that can load external resources or execute code
  if (/url\s*\(|expression\s*\(/i.test(cleaned)) return "";
  return cleaned;
}

/**
 * Build an opening HTML tag with optional attributes.
 * Attribute values are automatically escaped.
 *
 * @param tag - Element name (e.g. "div", "svg")
 * @param attrs - Key-value pairs; undefined values are omitted.
 */
export function openTag(
  tag: string,
  attrs?: Record<string, string | number | undefined>,
): string {
  if (!attrs) return `<${tag}>`;
  const parts: string[] = [];
  for (const [key, val] of Object.entries(attrs)) {
    if (val === undefined) continue;
    parts.push(`${key}="${escapeAttr(val)}"`);
  }
  return parts.length > 0 ? `<${tag} ${parts.join(" ")}>` : `<${tag}>`;
}

/**
 * Build a self-closing HTML/SVG tag.
 * Attribute values are automatically escaped.
 */
export function selfClosingTag(
  tag: string,
  attrs: Record<string, string | number | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(attrs)) {
    if (val === undefined) continue;
    parts.push(`${key}="${escapeAttr(val)}"`);
  }
  return parts.length > 0 ? `<${tag} ${parts.join(" ")} />` : `<${tag} />`;
}

/**
 * Wrap content in a complete element.
 * Attribute values are automatically escaped.
 */
export function elem(
  tag: string,
  attrs: Record<string, string | number | undefined>,
  content: string,
): string {
  return `${openTag(tag, attrs)}${content}</${tag}>`;
}
