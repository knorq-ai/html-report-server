/**
 * Core type definitions for the HTML report engine.
 *
 * ReportDocument is the top-level JSON DSL that Claude outputs.
 * Block is a discriminated union of all renderable component types.
 * StylePreset defines the design tokens that control visual output.
 */

// ---------------------------------------------------------------------------
// Block types — each variant maps to a component renderer
// ---------------------------------------------------------------------------

export interface SectionBlock {
  type: "section";
  title: string;
  subtitle?: string;
}

export interface HeadingBlock {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface ParagraphBlock {
  type: "paragraph";
  text: string; // supports inline HTML (bold, links, code)
}

export interface ListBlock {
  type: "list";
  ordered?: boolean;
  items: string[];
}

export interface CalloutBlock {
  type: "callout";
  variant?: "info" | "warning" | "success" | "danger";
  title?: string;
  text: string;
}

export interface StatCard {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "neutral";
}

export interface StatCardsBlock {
  type: "stat_cards";
  cards: StatCard[];
}

export interface TableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartBlock {
  type: "bar_chart";
  title?: string;
  data: ChartDataPoint[];
  unit?: string;
  horizontal?: boolean;
}

export interface LineSeriesPoint {
  x: string;
  y: number;
}

export interface LineSeries {
  name: string;
  data: LineSeriesPoint[];
}

export interface LineChartBlock {
  type: "line_chart";
  title?: string;
  series: LineSeries[];
  unit?: string;
}

export interface PieChartBlock {
  type: "pie_chart";
  title?: string;
  data: ChartDataPoint[];
  donut?: boolean;
}

export interface ProgressBar {
  label: string;
  value: number;
  max?: number;
  color?: string;
}

export interface ProgressBarsBlock {
  type: "progress_bars";
  bars: ProgressBar[];
}

export interface TimelineEntry {
  date: string;
  title: string;
  description?: string;
  status?: string;
}

export interface TimelineBlock {
  type: "timeline";
  entries: TimelineEntry[];
}

export interface CardGridCard {
  title: string;
  body: string;
  badge?: string;
  badgeVariant?: "success" | "warning" | "danger" | "info" | "neutral";
}

export interface CardGridBlock {
  type: "card_grid";
  columns?: number;
  cards: CardGridCard[];
}

export interface ComparisonItem {
  title: string;
  points: string[];
  highlight?: boolean;
}

export interface ComparisonBlock {
  type: "comparison";
  items: ComparisonItem[];
}

export interface BadgeItem {
  text: string;
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
}

export interface BadgesBlock {
  type: "badges";
  items: BadgeItem[];
}

export interface MetadataItem {
  label: string;
  value: string;
}

export interface MetadataBlock {
  type: "metadata";
  items: MetadataItem[];
}

export interface HeroStat {
  value: string;
  label: string;
  subtitle?: string;
  color?: string;
}

export interface HeroStatsBlock {
  type: "hero_stats";
  stats: HeroStat[];
}

export interface DividerBlock {
  type: "divider";
  color?: string;
  gradient?: string; // e.g. "var(--accent), var(--success)"
  height?: number;
}

export interface RawHtmlBlock {
  type: "html";
  content: string;
}

export type Block =
  | SectionBlock
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | CalloutBlock
  | StatCardsBlock
  | TableBlock
  | BarChartBlock
  | LineChartBlock
  | PieChartBlock
  | ProgressBarsBlock
  | TimelineBlock
  | CardGridBlock
  | ComparisonBlock
  | BadgesBlock
  | MetadataBlock
  | HeroStatsBlock
  | DividerBlock
  | RawHtmlBlock;

// ---------------------------------------------------------------------------
// Style preset — design tokens consumed by component renderers
// ---------------------------------------------------------------------------

export interface SectionTitleStyle {
  textTransform: "uppercase" | "none";
  fontSize: string;
  fontWeight: string;
  letterSpacing: string;
  borderBottom: string;
  marginBottom: string;
}

export interface CardStyle {
  borderRadius: string;
  border: string;
  boxShadow: string;
  padding: string;
  background: string;
}

export interface TableStyle {
  headerBg: string;
  headerColor: string;
  stripedRows: boolean;
  borderRadius: string;
  outerBorder: string;
}

export interface ChartStyle {
  palette: string[];
  barRadius: number;
  strokeWidth: number;
  height: number;
  gridColor: string;
  labelColor: string;
}

export interface StylePreset {
  name: string;
  maxWidth: string;
  sectionGap: string;
  blockGap: string;
  sectionTitle: SectionTitleStyle;
  card: CardStyle;
  table: TableStyle;
  chart: ChartStyle;
  statValueFontSize: string;
  statValueFontWeight: string;
}

// ---------------------------------------------------------------------------
// Report document — the top-level JSON DSL
// ---------------------------------------------------------------------------

export type StyleName = "mckinsey" | "clean" | "minimal" | "dashboard";

export interface StyleOverrides {
  card?: Partial<CardStyle>;
  table?: Partial<TableStyle>;
  chart?: Partial<ChartStyle>;
  sectionTitle?: Partial<SectionTitleStyle>;
}

export interface ReportDocument {
  title: string;
  subtitle?: string;
  badge?: string;
  style?: StyleName;
  styleOverrides?: StyleOverrides;
  blocks: Block[];
}

// ---------------------------------------------------------------------------
// Edit operations for edit_report tool
// ---------------------------------------------------------------------------

export interface ReplaceOp {
  op: "replace";
  index: number;
  block: Block;
}

export interface InsertOp {
  op: "insert";
  index: number;
  block: Block;
}

export interface DeleteOp {
  op: "delete";
  index: number;
}

export type EditOp = ReplaceOp | InsertOp | DeleteOp;
