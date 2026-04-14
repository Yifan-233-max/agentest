import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { discoverTestFiles, loadConfig, tryResolveConfigPath } from '../config/load-config.js';
import { locateCommand } from '../platform/command-discovery.js';
import { resolveAgentInvocation } from '../runner/resolve-agent.js';
import type { MockServerState, ResolvedAgentestConfig } from '../types.js';

export type DoctorStatus = 'pass' | 'warn' | 'fail';
export type DoctorFormat = 'human' | 'json';

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  summary: string;
  details?: string;
}

export interface DoctorReport {
  ok: boolean;
  configPath?: string;
  checks: DoctorCheck[];
  warnings: number;
  failures: number;
}

export interface DoctorCliOptions {
  configPath?: string;
  format?: DoctorFormat;
}

interface ProbeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function resolveRuntimePath(relativePath: string): string {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = path.extname(currentFile);
  return fileURLToPath(new URL(relativePath.replace('.js', extension), import.meta.url));
}

function pushCheck(checks: DoctorCheck[], check: DoctorCheck): void {
  checks.push(check);
}

function toHumanStatus(status: DoctorStatus): string {
  return status.toUpperCase();
}

function formatHumanReport(report: DoctorReport): string {
  const lines: string[] = [];

  for (const check of report.checks) {
    lines.push(`${toHumanStatus(check.status)} ${check.summary}`);
    if (check.details) {
      lines.push(check.details);
    }
  }

  lines.push('');
  lines.push(`${report.checks.length} checks, ${report.warnings} warning(s), ${report.failures} failure(s)`);
  return lines.join('\n');
}

async function runProbe(options: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<ProbeResult> {
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
    }, options.timeoutMs ?? 5_000);

    child.on('error', reject);
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
  };
}

function resolveAgentCwd(config: ResolvedAgentestConfig, projectRoot: string): string {
  const agentInvocation = resolveAgentInvocation(config.agent);
  if (agentInvocation.cwd) {
    return path.resolve(projectRoot, agentInvocation.cwd);
  }

  if (config.agent.cwd) {
    return path.resolve(projectRoot, config.agent.cwd);
  }

  return projectRoot;
}

async function checkAgentCommand(checks: DoctorCheck[], config: ResolvedAgentestConfig, projectRoot: string): Promise<void> {
  const agentInvocation = resolveAgentInvocation(config.agent);
  const agentCwd = resolveAgentCwd(config, projectRoot);
  const resolvedAgent = await locateCommand(agentInvocation.command, agentCwd);

  if (!resolvedAgent.found) {
    pushCheck(checks, {
      id: 'agent-command',
      status: 'fail',
      summary: `Agent command "${agentInvocation.command}" was not found`,
      details: resolvedAgent.error,
    });
    return;
  }

  pushCheck(checks, {
    id: 'agent-command',
    status: 'pass',
    summary: `Agent command detected: ${agentInvocation.command}`,
    details: resolvedAgent.location,
  });

  if (config.agent.preset === 'claude' || config.agent.preset === 'copilot') {
    try {
      const result = await runProbe({
        command: agentInvocation.command,
        args: ['--version'],
        cwd: agentCwd,
        env: {
          ...process.env,
          ...agentInvocation.env,
        },
        timeoutMs: 10_000,
      });

      if (result.timedOut) {
        pushCheck(checks, {
          id: 'agent-version',
          status: 'warn',
          summary: `Agent version probe for ${config.agent.preset} timed out`,
        });
        return;
      }

      if (result.exitCode === 0) {
        const versionSummary = result.stdout.trim().split(/\r?\n/)[0] || 'Version probe succeeded.';
        pushCheck(checks, {
          id: 'agent-version',
          status: 'pass',
          summary: `${config.agent.preset} CLI responded to --version`,
          details: versionSummary,
        });
        return;
      }

      pushCheck(checks, {
        id: 'agent-version',
        status: 'warn',
        summary: `${config.agent.preset} CLI was found but did not pass a --version probe`,
        details: result.stderr.trim() || result.stdout.trim() || `exitCode=${result.exitCode}`,
      });
      return;
    } catch (error) {
      pushCheck(checks, {
        id: 'agent-version',
        status: 'warn',
        summary: `${config.agent.preset} CLI was found but version probing failed`,
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  pushCheck(checks, {
    id: 'agent-version',
    status: 'warn',
    summary: 'Custom agent command located; no standard version probe was attempted',
  });
}

async function checkMockServer(checks: DoctorCheck[], config?: ResolvedAgentestConfig): Promise<void> {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'agentest-doctor-'));
  const stateFilePath = path.join(runtimeDir, 'mock-state.json');
  const traceFilePath = path.join(runtimeDir, 'trace.json');
  const mockServerEntry = resolveRuntimePath('../mcp/mock-server-process.js');

  const mockServerState: MockServerState = {
    tools: config?.tools ?? [],
    stubs: {},
    traceFilePath,
    failOnUnmockedTool: true,
  };

  try {
    await writeFile(stateFilePath, JSON.stringify(mockServerState, null, 2), 'utf8');

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mockServerEntry, '--state', stateFilePath],
    });

    const client = new Client({ name: 'agentest-doctor', version: '0.0.1' }, { capabilities: {} });
    await client.connect(transport);
    const tools = await client.listTools();
    await transport.close();

    pushCheck(checks, {
      id: 'mock-mcp-server',
      status: 'pass',
      summary: `Mock MCP server booted successfully`,
      details: `Exposed ${tools.tools.length} tool(s).`,
    });
  } catch (error) {
    pushCheck(checks, {
      id: 'mock-mcp-server',
      status: 'fail',
      summary: 'Mock MCP server failed to boot',
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await rm(runtimeDir, { recursive: true, force: true });
  }
}

function buildReport(checks: DoctorCheck[], configPath?: string): DoctorReport {
  const warnings = checks.filter((check) => check.status === 'warn').length;
  const failures = checks.filter((check) => check.status === 'fail').length;

  return {
    ok: failures === 0,
    configPath,
    checks,
    warnings,
    failures,
  };
}

export async function doctor(options: DoctorCliOptions = {}): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  pushCheck(checks, {
    id: 'node-version',
    status: 'pass',
    summary: `Node.js detected: ${process.version}`,
  });

  const configResolution = await tryResolveConfigPath(options.configPath);
  let configPath = configResolution.configReference?.configPath;
  let config: ResolvedAgentestConfig | undefined;
  let projectRoot: string | undefined;

  if (!configPath) {
    pushCheck(checks, {
      id: 'config-file',
      status: 'fail',
      summary: 'No agentest config file was found',
      details: configResolution.error?.message,
    });
  } else {
    pushCheck(checks, {
      id: 'config-file',
      status: 'pass',
      summary: 'Agentest config found',
      details: configPath,
    });

    try {
      config = await loadConfig(configResolution.configReference!);
      projectRoot = configResolution.configReference!.projectRoot;
      pushCheck(checks, {
        id: 'config-load',
        status: 'pass',
        summary: 'Agentest config loaded successfully',
      });
    } catch (error) {
      pushCheck(checks, {
        id: 'config-load',
        status: 'fail',
        summary: 'Agentest config failed to load',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (config && projectRoot) {
    const files = await discoverTestFiles(projectRoot, config, []);
    if (files.length === 0) {
      pushCheck(checks, {
        id: 'test-files',
        status: 'fail',
        summary: 'No agent tests were found for the current config',
      });
    } else {
      pushCheck(checks, {
        id: 'test-files',
        status: 'pass',
        summary: `Detected ${files.length} test file(s)`,
      });
    }

    await checkAgentCommand(checks, config, projectRoot);
  }

  await checkMockServer(checks, config);

  const report = buildReport(checks, configPath);
  const format = options.format ?? 'human';
  const output = format === 'json'
    ? JSON.stringify(report, null, 2)
    : formatHumanReport(report);

  process.stdout.write(`${output}\n`);
  return report;
}