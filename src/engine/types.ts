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
  color?: string;   // dot/date color, e.g. "var(--success)" or "#6f42c1"
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
  highlight?: boolean | string;  // true = accent, or "accent" | "purple" | "success" | "warning" | "danger"
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

export interface HeroStatBreakdownItem {
  label: string;
  value: string;
  struck?: boolean;    // render with strikethrough (e.g. already contracted)
}

export interface HeroStat {
  value: string;
  label: string;
  subtitle?: string;
  color?: string;
  breakdown?: HeroStatBreakdownItem[];   // optional line-item breakdown
  breakdownTotal?: string;               // "label|value" or just "value"
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

// ---------------------------------------------------------------------------
// Diagram block — layered architecture diagrams
// ---------------------------------------------------------------------------

export interface DiagramNode {
  id: string;
  title: string;
  lines?: string[];        // description lines below title
  color?: string;          // border/accent color
  textColor?: string;      // title text color
}

export interface DiagramGroup {
  label?: string;
  nodeIds: string[];
  color?: string;
  style?: "solid" | "dashed";
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
  color?: string;
}

export interface DiagramLayer {
  label: string;
  color?: string;          // layer accent color (used for label + background tint)
  nodes: DiagramNode[];
  groups?: DiagramGroup[];
}

export interface DiagramBlock {
  type: "diagram";
  title?: string;
  layers: DiagramLayer[];
  edges: DiagramEdge[];
  dark?: boolean;          // dark theme (default false)
}

export interface BeforeAfterItem {
  title: string;
  before: { label: string; value: number; unit?: string };
  after: { label: string; value: number; unit?: string };
  improvement?: string;   // e.g. "55% 高速化"
}

export interface BeforeAfterBlock {
  type: "before_after";
  items: BeforeAfterItem[];
}

export interface StepItem {
  label?: string;      // defaults to "STEP {n}" if omitted
  title: string;
  description?: string;
}

export interface StepsBlock {
  type: "steps";
  steps: StepItem[];
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
  | RawHtmlBlock
  | DiagramBlock
  | BeforeAfterBlock
  | StepsBlock;

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

export type ThemeMode = "auto" | "light" | "dark";

export interface ReportDocument {
  title: string;
  subtitle?: string;
  badge?: string;
  style?: StyleName;
  styleOverrides?: StyleOverrides;
  theme?: ThemeMode;
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
