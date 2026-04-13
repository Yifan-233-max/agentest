import { AgentTestContext } from './test-context.js';
import {
  discoverTestFiles,
  importDefaultModule,
  loadConfig,
  resolveConfigReference,
} from '../config/load-config.js';
import type { AgentTestDefinition } from '../api.js';
import type { AgentestConfig } from '../types.js';

export interface RunCliOptions {
  configPath?: string;
  patterns?: string[];
}

export interface TestRunSummary {
  name: string;
  passed: boolean;
  passes: number;
  runs: number;
  minPassRate: number;
  error?: Error;
}

export interface SuiteSummary {
  configPath: string;
  total: number;
  passed: number;
  failed: number;
  tests: TestRunSummary[];
}

async function loadTests(filePath: string): Promise<AgentTestDefinition[]> {
  const exported = await importDefaultModule<AgentTestDefinition | AgentTestDefinition[]>(filePath);
  const values = Array.isArray(exported) ? exported : [exported];

  return values.filter((value): value is AgentTestDefinition => value?.kind === 'agentest/test');
}

async function runSingleTest(options: {
  config: AgentestConfig;
  projectRoot: string;
  testDefinition: AgentTestDefinition;
}): Promise<TestRunSummary> {
  const runs = options.testDefinition.options.runs ?? options.config.test?.stability?.runs ?? 1;
  const minPassRate = options.testDefinition.options.minPassRate ?? options.config.test?.stability?.minPassRate ?? 1;
  const timeoutMs = options.testDefinition.options.timeoutMs ?? options.config.test?.timeoutMs ?? 60_000;
  const failOnUnmockedTool = options.config.test?.failOnUnmockedTool ?? true;

  let passes = 0;
  let firstError: Error | undefined;

  for (let index = 0; index < runs; index += 1) {
    const context = new AgentTestContext(
      options.config,
      options.projectRoot,
      timeoutMs,
      failOnUnmockedTool,
    );

    try {
      await options.testDefinition.handler(context);
      passes += 1;
    } catch (error) {
      if (!firstError) {
        firstError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  const actualPassRate = runs === 0 ? 0 : passes / runs;

  return {
    name: options.testDefinition.name,
    passed: actualPassRate >= minPassRate,
    passes,
    runs,
    minPassRate,
    error: actualPassRate >= minPassRate ? undefined : firstError,
  };
}

function printSummary(summary: SuiteSummary): void {
  for (const test of summary.tests) {
    const status = test.passed ? 'PASS' : 'FAIL';
    const ratio = `${test.passes}/${test.runs}`;
    process.stdout.write(`${status} ${test.name} (${ratio}, need ${(test.minPassRate * 100).toFixed(0)}%)\n`);

    if (!test.passed && test.error) {
      process.stdout.write(`${test.error.message}\n`);
    }
  }

  process.stdout.write(
    `\n${summary.passed} passed, ${summary.failed} failed, ${summary.total} total\n`,
  );
}

export async function run(options: RunCliOptions = {}): Promise<SuiteSummary> {
  const configReference = await resolveConfigReference(options.configPath);
  const config = await loadConfig(configReference);
  const projectRoot = configReference.projectRoot;
  const files = await discoverTestFiles(projectRoot, config, options.patterns ?? []);

  if (files.length === 0) {
    throw new Error('No agent tests were found.');
  }

  const summaries: TestRunSummary[] = [];
  for (const filePath of files) {
    const tests = await loadTests(filePath);
    for (const testDefinition of tests) {
      summaries.push(
        await runSingleTest({
          config,
          projectRoot,
          testDefinition,
        }),
      );
    }
  }

  const suiteSummary: SuiteSummary = {
    configPath: configReference.configPath,
    total: summaries.length,
    passed: summaries.filter((item) => item.passed).length,
    failed: summaries.filter((item) => !item.passed).length,
    tests: summaries,
  };

  printSummary(suiteSummary);
  return suiteSummary;
}