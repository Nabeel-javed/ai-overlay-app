export type Provider = 'openai' | 'claude' | 'grok';
export type Model = 'gpt-6-astra' | 'sonnet' | 'opus' | 'grok-4.7';
export interface Settings {
  mode: 'compare' | 'single';
  provider: Provider;
  openaiModel: 'gpt-6-astra';
  grokModel: 'grok-4.7';
  claudeModel: 'sonnet' | 'opus';
  effort: 'low' | 'medium' | 'high';
}
export interface Request {
  requestId: string;
  text: string;
  instructions: string;
  screenshot: string | null;
  provider: Provider;
  model: Model;
  effort: Settings['effort'];
}
export interface Session { sessionId: string; messageId?: string }
export interface Result {
  text: string;
  actualModel: string;
  sessionId: string;
  turnId?: string;
  messageId?: string;
  usage?: unknown;
}
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'model'; model: string }
  | { type: 'usage'; usage: unknown }
  | { type: 'started'; provider: Provider; model: Model };
export interface Adapter {
  run(request: Request, session: Session | null, controls: {
    signal: AbortSignal;
    emit(event: StreamEvent): void;
  }): Promise<Result>;
  status(): Promise<{ installed: boolean; authenticated: boolean; message: string }>;
  close(): void;
}
