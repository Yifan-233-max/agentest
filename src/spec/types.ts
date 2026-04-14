import type { StabilityConfig } from '../types.js';

export interface PromptTestSpecAgent {
  preset?: 'claude' | 'copilot';
}

export interface InlinePromptSourceSpec {
  kind: 'inline';
  text: string;
}

export interface FilePromptSourceSpec {
  kind: 'file';
  path: string;
}

export interface ModulePromptSourceSpec {
  kind: 'module';
  ref: string;
  args?: Record<string, unknown>;
}

export interface CommandPromptSourceSpec {
  kind: 'command';
  command: string;
  args?: string[];
}

export type PromptSourceSpec =
  | InlinePromptSourceSpec
  | FilePromptSourceSpec
  | ModulePromptSourceSpec
  | CommandPromptSourceSpec;

export interface PromptTestSpecExecution {
  timeoutMs?: number;
  stability?: StabilityConfig;
}

export interface PromptTestSpecMock {
  tool: string;
  when?: unknown;
  returns?: unknown;
  throws?: string;
}

export interface PromptTestSpecToolCallAssertion {
  tool: string;
  times?: number;
  with?: unknown;
}

export interface PromptTestSpecToolAssertions {
  required?: string[];
  sequence?: string[];
  only?: string[];
  noUnmatchedCalls?: boolean;
  calls?: PromptTestSpecToolCallAssertion[];
}

export interface PromptTestSpecProcessAssertions {
  exitCode?: number;
  timeout?: boolean;
  durationMsMax?: number;
}

export interface PromptTestSpecOutputAssertions {
  stdoutContains?: unknown[];
  stderrContains?: unknown[];
  stdoutNotContains?: unknown[];
  stderrNotContains?: unknown[];
}

export interface PromptTestSpecAssertions {
  tools?: PromptTestSpecToolAssertions;
  process?: PromptTestSpecProcessAssertions;
  output?: PromptTestSpecOutputAssertions;
}

export interface PromptTestSpec {
  version: number | string;
  name: string;
  description?: string;
  tags?: string[];
  agent?: PromptTestSpecAgent;
  promptSource: PromptSourceSpec;
  execution?: PromptTestSpecExecution;
  mocks?: PromptTestSpecMock[];
  assert?: PromptTestSpecAssertions;
}