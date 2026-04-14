import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { isRecord, match } from '../matchers.js';
import { expect } from '../result.js';
import { AgentTestContext } from '../runner/test-context.js';
import type { ResolvedAgentestConfig } from '../types.js';
import type { TestRunSummary } from '../runner/run-tests.js';
import { resolvePromptSource } from './resolve-prompt-source.js';
import type {
  PromptSourceSpec,
  PromptTestSpec,
  PromptTestSpecMock,
  PromptTestSpecOutputAssertions,
  PromptTestSpecProcessAssertions,
  PromptTestSpecToolAssertions,
} from './types.js';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isYamlTestFile(filePath: string): boolean {
  return filePath.endsWith('.agentest.yaml') || filePath.endsWith('.agentest.yml');
}

function convertMatcher(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => convertMatcher(item));
  }

  if (isRecord(value)) {
    if (typeof value.regex === 'string') {
      const flags = typeof value.flags === 'string' ? value.flags : '';
      return new RegExp(value.regex, flags);
    }

    if (typeof value.contains === 'string') {
      return match.stringContaining(value.contains);
    }

    if (value.anything === true) {
      return match.anything();
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, convertMatcher(item)]),
    );
  }

  return value;
}

function normalizeArray(value: unknown[] | undefined): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function loadPromptTestSpec(filePath: string): Promise<PromptTestSpec> {
  const sourceText = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(sourceText) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse prompt test spec at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isRecord(parsed) || typeof parsed.name !== 'string' || !isRecord(parsed.promptSource)) {
    throw new Error(`Invalid prompt test spec at ${filePath}. Expected at least "name" and "promptSource".`);
  }

  if (parsed.version !== '0.1' && parsed.version !== 0.1) {
    throw new Error(`Unsupported prompt test spec version at ${filePath}. Expected version 0.1.`);
  }

  return parsed as unknown as PromptTestSpec;
}

function resolveSpecConfig(baseConfig: ResolvedAgentestConfig, spec: PromptTestSpec): ResolvedAgentestConfig {
  const requestedPreset = spec.agent?.preset;
  if (!requestedPreset) {
    return baseConfig;
  }

  if (baseConfig.agent.preset === undefined || baseConfig.agent.preset === 'custom') {
    throw new Error(
      `Spec "${spec.name}" requests preset "${requestedPreset}", but the resolved config uses a custom agent command. Configure the desired preset in the base config or remove the spec override.`,
    );
  }

  if (baseConfig.agent.preset === requestedPreset) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    agent: {
      preset: requestedPreset,
      cwd: baseConfig.agent.cwd,
      env: baseConfig.agent.env,
    },
  };
}

function applyMocks(context: AgentTestContext, mocks: PromptTestSpecMock[] | undefined): void {
  for (const mockDefinition of mocks ?? []) {
    if (!mockDefinition.tool) {
      throw new Error('Each mock entry requires a tool name.');
    }

    const hasReturns = Object.prototype.hasOwnProperty.call(mockDefinition, 'returns');
    const hasThrows = Object.prototype.hasOwnProperty.call(mockDefinition, 'throws');

    if (hasReturns === hasThrows) {
      throw new Error(
        `Mock for tool "${mockDefinition.tool}" must define exactly one of "returns" or "throws".`,
      );
    }

    let builder = context.mock(mockDefinition.tool);
    if (mockDefinition.when !== undefined) {
      builder = builder.when(convertMatcher(mockDefinition.when));
    }

    if (hasReturns) {
      builder.returns(mockDefinition.returns);
      continue;
    }

    builder.throws(mockDefinition.throws ?? 'Mocked tool failure');
  }
}

function applyToolAssertions(tools: PromptTestSpecToolAssertions | undefined, result: ReturnType<typeof expect>): void {
  if (!tools) {
    return;
  }

  for (const toolName of tools.required ?? []) {
    result.toHaveCalledTool(toolName);
  }

  if (Array.isArray(tools.sequence) && tools.sequence.length > 0) {
    result.toHaveToolSubsequence(tools.sequence);
  }

  if (Array.isArray(tools.only) && tools.only.length > 0) {
    result.toOnlyCallTools(tools.only);
  }

  if (tools.noUnmatchedCalls) {
    result.toHaveNoUnmatchedToolCalls();
  }

  for (const callAssertion of tools.calls ?? []) {
    if (callAssertion.times !== undefined) {
      result.toHaveCalledToolTimes(callAssertion.tool, callAssertion.times);
    }

    if (callAssertion.with !== undefined) {
      result.toHaveCalledToolWith(callAssertion.tool, convertMatcher(callAssertion.with));
    }
  }
}

function applyProcessAssertions(
  processAssertions: PromptTestSpecProcessAssertions | undefined,
  result: ReturnType<typeof expect>,
): void {
  if (processAssertions?.timeout === true) {
    result.toHaveTimedOut();
  } else {
    if (processAssertions?.exitCode !== undefined) {
      result.toExitWithCode(processAssertions.exitCode);
    } else {
      result.toExitSuccessfully();
    }

    if (processAssertions?.timeout === false) {
      result.not.toHaveTimedOut();
    }
  }

  if (processAssertions?.durationMsMax !== undefined) {
    result.toFinishWithin(processAssertions.durationMsMax);
  }
}

function applyOutputAssertions(
  outputAssertions: PromptTestSpecOutputAssertions | undefined,
  result: ReturnType<typeof expect>,
): void {
  if (!outputAssertions) {
    return;
  }

  for (const matcher of normalizeArray(outputAssertions.stdoutContains)) {
    result.toContainStdout(convertMatcher(matcher));
  }

  for (const matcher of normalizeArray(outputAssertions.stderrContains)) {
    result.toContainStderr(convertMatcher(matcher));
  }

  for (const matcher of normalizeArray(outputAssertions.stdoutNotContains)) {
    result.not.toContainStdout(convertMatcher(matcher));
  }

  for (const matcher of normalizeArray(outputAssertions.stderrNotContains)) {
    result.not.toContainStderr(convertMatcher(matcher));
  }
}

function assertPromptTestResult(resultValue: import('../result.js').RunResult, spec: PromptTestSpec): void {
  const result = expect(resultValue);
  applyToolAssertions(spec.assert?.tools, result);
  applyProcessAssertions(spec.assert?.process, result);
  applyOutputAssertions(spec.assert?.output, result);
}

export async function runPromptSpec(options: {
  filePath: string;
  config: ResolvedAgentestConfig;
  projectRoot: string;
}): Promise<TestRunSummary> {
  const spec = await loadPromptTestSpec(options.filePath);
  const effectiveConfig = resolveSpecConfig(options.config, spec);
  const runs = spec.execution?.stability?.runs ?? effectiveConfig.test?.stability?.runs ?? 1;
  const minPassRate = spec.execution?.stability?.minPassRate ?? effectiveConfig.test?.stability?.minPassRate ?? 1;
  const timeoutMs = spec.execution?.timeoutMs ?? effectiveConfig.test?.timeoutMs ?? 60_000;
  const failOnUnmockedTool = effectiveConfig.test?.failOnUnmockedTool ?? true;

  let passes = 0;
  let firstError: Error | undefined;

  for (let index = 0; index < runs; index += 1) {
    const context = new AgentTestContext(
      effectiveConfig,
      options.projectRoot,
      timeoutMs,
      failOnUnmockedTool,
    );

    try {
      const prompt = await resolvePromptSource({
        promptSource: spec.promptSource as PromptSourceSpec,
        projectRoot: options.projectRoot,
        specFilePath: options.filePath,
      });

      context.prompt(prompt);
      applyMocks(context, spec.mocks);

      const resultValue = await context.run();
      assertPromptTestResult(resultValue, spec);
      passes += 1;
    } catch (error) {
      if (!firstError) {
        firstError = toError(error);
      }
    }
  }

  const actualPassRate = runs === 0 ? 0 : passes / runs;

  return {
    name: spec.name,
    passed: actualPassRate >= minPassRate,
    passes,
    runs,
    minPassRate,
    error: actualPassRate >= minPassRate ? undefined : firstError,
  };
}

export { isYamlTestFile };