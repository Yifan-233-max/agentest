import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeMatcher } from '../matchers.js';
import { RunResult } from '../result.js';
import { resolveAgentInvocation } from './resolve-agent.js';
import type {
  AgentProcessSnapshot,
  MockServerState,
  ResolvedAgentestConfig,
  ToolStubDefinition,
  TraceEntry,
} from '../types.js';

function resolveRuntimePath(relativePath: string): string {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = path.extname(currentFile);
  return fileURLToPath(new URL(relativePath.replace('.js', extension), import.meta.url));
}

function applyPlaceholders(value: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce(
    (current, [key, replacement]) => current.replaceAll(`{${key}}`, replacement),
    value,
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runProcess(options: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<AgentProcessSnapshot> {
  const startedAt = Date.now();
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  child.stdout.on('data', (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      if ('code' in error && error.code === 'ENOENT') {
        reject(
          new Error(
            `Failed to launch agent command "${options.command}". Install the CLI first or override the command path in your agentest config.`,
          ),
        );
        return;
      }

      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  return {
    stdout,
    stderr,
    exitCode,
    timedOut,
    durationMs: Date.now() - startedAt,
  };
}

class ToolMockBuilder {
  constructor(
    private readonly context: AgentTestContext,
    private readonly toolName: string,
    private readonly matcher?: unknown,
  ) {}

  when(matcher: unknown): ToolMockBuilder {
    return new ToolMockBuilder(this.context, this.toolName, matcher);
  }

  returns(value: unknown): ToolMockBuilder {
    this.context.registerStub(this.toolName, {
      when: this.matcher,
      action: { type: 'return', value },
    });

    return this;
  }

  throws(error: Error | string): ToolMockBuilder {
    this.context.registerStub(this.toolName, {
      when: this.matcher,
      action: {
        type: 'throw',
        message: error instanceof Error ? error.message : error,
      },
    });

    return this;
  }
}

export class AgentTestContext {
  private readonly stubs = new Map<string, ToolStubDefinition[]>();
  private promptText = '';

  constructor(
    private readonly config: ResolvedAgentestConfig,
    private readonly projectRoot: string,
    private readonly timeoutMs: number,
    private readonly failOnUnmockedTool: boolean,
  ) {}

  prompt(value: string): void {
    this.promptText = value;
  }

  mock(toolName: string): ToolMockBuilder {
    const toolExists = this.config.tools.some((toolDefinition) => toolDefinition.name === toolName);
    if (!toolExists) {
      const availableTools = this.config.tools.map((toolDefinition) => toolDefinition.name).join(', ');
      throw new Error(
        `Cannot mock unknown tool "${toolName}". Declared tools: ${availableTools || '(none)'}. You can declare tools as strings, for example tools: ['${toolName}'].`,
      );
    }

    return new ToolMockBuilder(this, toolName);
  }

  registerStub(toolName: string, stub: ToolStubDefinition): void {
    const current = this.stubs.get(toolName) ?? [];
    current.push({
      ...stub,
      when: stub.when === undefined ? undefined : serializeMatcher(stub.when),
    });
    this.stubs.set(toolName, current);
  }

  async run(): Promise<RunResult> {
    if (!this.promptText.trim()) {
      throw new Error('A prompt is required before calling run().');
    }

    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'agentest-'));
    const stateFilePath = path.join(runtimeDir, 'mock-state.json');
    const traceFilePath = path.join(runtimeDir, 'trace.json');
    const mcpConfigPath = path.join(runtimeDir, 'mcp-config.json');

    const mockServerState: MockServerState = {
      tools: this.config.tools,
      stubs: Object.fromEntries(this.stubs.entries()),
      traceFilePath,
      failOnUnmockedTool: this.failOnUnmockedTool,
    };

    const mockServerEntry = resolveRuntimePath('../mcp/mock-server-process.js');
    const mockServerArgs = [mockServerEntry, '--state', stateFilePath];

    await writeFile(stateFilePath, JSON.stringify(mockServerState, null, 2), 'utf8');
    await writeFile(
      mcpConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            agentest: {
              type: 'stdio',
              command: process.execPath,
              args: mockServerArgs,
              tools: ['*'],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const agentInvocation = resolveAgentInvocation(this.config.agent);
    const agentCwd = agentInvocation.cwd
      ? path.resolve(this.projectRoot, agentInvocation.cwd)
      : this.config.agent.cwd
      ? path.resolve(this.projectRoot, this.config.agent.cwd)
      : this.projectRoot;

    const processResult = await runProcess({
      command: agentInvocation.command,
      args: agentInvocation.args.map((arg) =>
        applyPlaceholders(arg, {
          prompt: this.promptText,
          mcpConfig: mcpConfigPath,
          agentConfigDir: runtimeDir,
        }),
      ),
      cwd: agentCwd,
      env: {
        ...process.env,
        ...agentInvocation.env,
        AGENTEST_MODE: 'test',
      },
      timeoutMs: this.timeoutMs,
    });

    const trace = (await fileExists(traceFilePath))
      ? (JSON.parse(await readFile(traceFilePath, 'utf8')) as TraceEntry[])
      : [];

    await rm(runtimeDir, { recursive: true, force: true });

    return new RunResult({
      ...processResult,
      trace,
    });
  }
}