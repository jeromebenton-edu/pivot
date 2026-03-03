export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  chartConfig?: ChartConfig;
  sources?: DataSource[];
  timestamp: Date;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'area' | 'heatmap' | 'treemap' | 'funnel' | 'radar' | 'gauge' | 'waterfall' | 'combo';
  title: string;
  data: Record<string, unknown>[];
  xAxis?: { dataKey: string; label?: string };
  yAxis?: { dataKey: string; label?: string };
  series?: string | string[];
  colors?: string[];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  sampleData?: boolean;
}

export interface DataSource {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

/** Shape of a data chunk from data_chunks.json and the vector store */
export interface DataChunk {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  raw_data?: Record<string, unknown>;
}

/** Lightweight ECharts click event params used by drill-down handlers */
export interface EChartsClickParams {
  name: string;
  value: unknown;
  seriesName?: string;
  dataIndex?: number;
  componentType?: string;
  event?: { event: MouseEvent };
}

/** Extract message and HTTP status from an unknown caught error */
export function getErrorInfo(error: unknown): { message: string; status?: number } {
  const message = error instanceof Error ? error.message : String(error);
  let status: number | undefined;
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.status === 'number') status = e.status;
    else if (typeof e.statusCode === 'number') status = e.statusCode;
  }
  return { message, status };
}

export interface Dataset {
  id: string;
  name: string;
  type: 'builtin' | 'csv' | 'excel' | 'database';
  rowCount?: number;
  columns?: { name: string; type: string }[];
}

// Shared chat message type for LLM clients (#R8 dedup)
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface DashboardWidget {
  id: string;
  chartConfig: ChartConfig;
  title: string;
  width: number;   // grid columns (1-4)
  height: number;  // grid rows (1-3)
  order: number;
}

export interface Dashboard {
  id: string;
  user_id: string;
  title: string;
  widgets: DashboardWidget[];
  created_at: string;
  updated_at: string;
}

export interface ChatRequest {
  messages: Message[];
  sessionId?: string;
  datasetId?: string;
}

export interface ChatResponse {
  message: Message;
  toolCalls?: ToolCall[];
}