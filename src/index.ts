export { agentTest, defineConfig, tool } from './api.js';
export { doctor } from './doctor/run-doctor.js';
export { init } from './init/run-init.js';
export { match } from './matchers.js';
export { expect, RunResult } from './result.js';
export { run } from './runner/run-tests.js';
export type { AgentTestDefinition } from './api.js';
export type {
  AgentCommandConfig,
  AgentestConfig,
  AgentRunSnapshot,
  AgentTestOptions,
  AgentPresetName,
  ClaudeAgentPresetConfig,
  CopilotAgentPresetConfig,
  CustomAgentCommandConfig,
  TestConfig,
  ToolDefinition,
  TraceEntry,
} from './types.js';