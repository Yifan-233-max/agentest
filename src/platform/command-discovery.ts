import path from 'node:path';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

interface ProbeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runProbe(options: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
}): Promise<ProbeResult> {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
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
  };
}

export interface LocatedCommand {
  found: boolean;
  location?: string;
  error?: string;
}

export async function locateCommand(command: string, cwd: string): Promise<LocatedCommand> {
  const hasPathSeparator = command.includes('/') || command.includes('\\');
  if (path.isAbsolute(command) || hasPathSeparator) {
    const resolvedPath = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    try {
      await access(resolvedPath);
      return {
        found: true,
        location: resolvedPath,
      };
    } catch {
      return {
        found: false,
        error: `Resolved path not found: ${resolvedPath}`,
      };
    }
  }

  const locatorCommand = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = await runProbe({
      command: locatorCommand,
      args: [command],
      cwd,
      timeoutMs: 5_000,
    });

    if (result.exitCode === 0) {
      const location = result.stdout.trim().split(/\r?\n/)[0];
      return {
        found: location.length > 0,
        location,
      };
    }

    return {
      found: false,
      error: result.stderr.trim() || result.stdout.trim() || `Unable to locate command "${command}" in PATH.`,
    };
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}