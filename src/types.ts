export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export type AgentPresetName = 'custom' | 'claude' | 'copilot';

interface BaseAgentConfig {
  cwd?: string;
  env?: Record<string, string>;
}

export interface CustomAgentCommandConfig extends BaseAgentConfig {
  preset?: 'custom';
  command: string;
  args: string[];
}

export interface ClaudeAgentPresetConfig extends BaseAgentConfig {
  preset: 'claude';
  command?: string;
  extraArgs?: string[];
}

export interface CopilotAgentPresetConfig extends BaseAgentConfig {
  preset: 'copilot';
  command?: string;
  extraArgs?: string[];
}

export type AgentCommandConfig =
  | CustomAgentCommandConfig
  | ClaudeAgentPresetConfig
  | CopilotAgentPresetConfig;

export interface StabilityConfig {
  runs?: number;
  minPassRate?: number;
}

export interface TestConfig {
  files?: string[];
  timeoutMs?: number;
  failOnUnmockedTool?: boolean;
  stability?: StabilityConfig;
}

export interface AgentestConfig {
  agent: AgentCommandConfig;
  tools: ToolDefinition[];
  test?: TestConfig;
}

export interface ReturnStubAction {
  type: 'return';
  value: unknown;
}

export interface ThrowStubAction {
  type: 'throw';
  message: string;
}

export type StubAction = ReturnStubAction | ThrowStubAction;

export interface ToolStubDefinition {
  when?: unknown;
  action: StubAction;
}

export interface TraceEntry {
  tool: string;
  args: Record<string, unknown>;
  matched: boolean;
  isError: boolean;
  timestamp: string;
  stubIndex?: number;
  response?: unknown;
  errorMessage?: string;
}

export interface MockServerState {
  tools: ToolDefinition[];
  stubs: Record<string, ToolStubDefinition[]>;
  traceFilePath: string;
  failOnUnmockedTool: boolean;
}

export interface AgentProcessSnapshot {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export interface AgentRunSnapshot extends AgentProcessSnapshot {
  trace: TraceEntry[];
}

export interface AgentTestOptions {
  runs?: number;
  minPassRate?: number;
  timeoutMs?: number;
}