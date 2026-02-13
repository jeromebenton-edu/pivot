export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  chartConfig?: ChartConfig;
  sources?: DataSource[];
  timestamp: Date;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'area';
  title: string;
  data: Record<string, unknown>[];
  xAxis?: { dataKey: string; label?: string };
  yAxis?: { dataKey: string; label?: string };
  series?: string;
  colors?: string[];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}

export interface DataSource {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export interface ChatRequest {
  messages: Message[];
  sessionId?: string;
}

export interface ChatResponse {
  message: Message;
  toolCalls?: ToolCall[];
}