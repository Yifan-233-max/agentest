import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { importModuleExport, invokeModuleExport } from '../platform/load-module.js';
import type {
  CommandPromptSourceSpec,
  FilePromptSourceSpec,
  ModulePromptSourceSpec,
  PromptSourceSpec,
} from './types.js';

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function toPromptText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.join('\n');
  }

  return JSON.stringify(value, null, 2);
}

async function runCommand(options: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
}): Promise<CommandResult> {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
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
    }, options.timeoutMs ?? 10_000);

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

async function resolveFilePromptSource(source: FilePromptSourceSpec, specDir: string): Promise<string> {
  const resolvedPath = path.resolve(specDir, source.path);
  try {
    return await readFile(resolvedPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to resolve promptSource.file "${source.path}" from ${specDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseModuleRef(ref: string): { modulePath: string; exportName: string } {
  const [modulePath, exportName = 'default'] = ref.split('#');
  if (!modulePath) {
    throw new Error(`Invalid promptSource.ref "${ref}". Expected "./path/to/module.js#exportName".`);
  }

  return {
    modulePath,
    exportName,
  };
}

async function resolveModulePromptSource(source: ModulePromptSourceSpec, specDir: string): Promise<string> {
  const { modulePath, exportName } = parseModuleRef(source.ref);
  const resolvedModulePath = path.resolve(specDir, modulePath);

  try {
    try {
      return toPromptText(await invokeModuleExport(resolvedModulePath, exportName, source.args));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('is not a function')) {
        throw error;
      }
    }

    const exportedValue = await importModuleExport<unknown>(resolvedModulePath, exportName);
    if (source.args !== undefined) {
      throw new Error(
        `Prompt source export "${exportName}" in ${resolvedModulePath} is not a function, but args were provided.`,
      );
    }

    return toPromptText(exportedValue);
  } catch (error) {
    throw new Error(
      `Failed to resolve promptSource.module "${source.ref}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function resolveCommandPromptSource(source: CommandPromptSourceSpec, projectRoot: string): Promise<string> {
  const result = await runCommand({
    command: source.command,
    args: source.args ?? [],
    cwd: projectRoot,
  });

  if (result.timedOut) {
    throw new Error(`Prompt source command "${source.command}" timed out.`);
  }

  if (result.exitCode !== 0) {
    const details = result.stderr.trim() || result.stdout.trim() || `exitCode=${result.exitCode}`;
    throw new Error(`Prompt source command "${source.command}" failed: ${details}`);
  }

  return result.stdout;
}

export async function resolvePromptSource(options: {
  promptSource: PromptSourceSpec;
  projectRoot: string;
  specFilePath: string;
}): Promise<string> {
  const specDir = path.dirname(options.specFilePath);

  switch (options.promptSource.kind) {
    case 'inline':
      return options.promptSource.text;
    case 'file':
      return resolveFilePromptSource(options.promptSource, specDir);
    case 'module':
      return resolveModulePromptSource(options.promptSource, specDir);
    case 'command':
      return resolveCommandPromptSource(options.promptSource, options.projectRoot);
    default:
      throw new Error(`Unsupported promptSource kind in ${options.specFilePath}.`);
  }
}