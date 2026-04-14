import type { AgentTestContext } from './runner/test-context.js';
import type { AgentestConfig, AgentTestOptions, ToolDefinitionInput } from './types.js';

export interface AgentTestDefinition {
  kind: 'agentest/test';
  name: string;
  handler: (context: AgentTestContext) => Promise<void> | void;
  options: AgentTestOptions;
}

export function defineConfig<T extends AgentestConfig>(config: T): T {
  return config;
}

export function tool<T extends ToolDefinitionInput>(definition: T): T {
  return definition;
}

export function agentTest(
  name: string,
  handler: (context: AgentTestContext) => Promise<void> | void,
  options: AgentTestOptions = {},
): AgentTestDefinition {
  return {
    kind: 'agentest/test',
    name,
    handler,
    options,
  };
}