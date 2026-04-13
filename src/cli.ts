#!/usr/bin/env node

import { doctor, type DoctorFormat } from './doctor/run-doctor.js';
import { init, type InitAgentPreference } from './init/run-init.js';
import { run } from './runner/run-tests.js';

interface ParsedArgs {
  command: string;
  agent: InitAgentPreference;
  cwd?: string;
  format: DoctorFormat;
  configPath?: string;
  positionals: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'run', ...rest] = argv;
  const positionals: string[] = [];
  let agent: InitAgentPreference = 'auto';
  let configPath: string | undefined;
  let cwd: string | undefined;
  let format: DoctorFormat = 'human';

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === '--agent') {
      const nextValue = rest[index + 1];
      if (nextValue === 'auto' || nextValue === 'claude' || nextValue === 'copilot') {
        agent = nextValue;
        index += 1;
        continue;
      }

      throw new Error(`Unsupported --agent value "${nextValue}". Use "auto", "claude", or "copilot".`);
    }

    if (value === '--config') {
      configPath = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === '--cwd') {
      cwd = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === '--format') {
      const nextValue = rest[index + 1];
      if (nextValue === 'json' || nextValue === 'human') {
        format = nextValue;
        index += 1;
        continue;
      }

      throw new Error(`Unsupported --format value "${nextValue}". Use "human" or "json".`);
    }

    positionals.push(value);
  }

  return {
    command,
    agent,
    cwd,
    format,
    configPath,
    positionals,
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.command === 'run') {
    const summary = await run({
      configPath: parsed.configPath,
      patterns: parsed.positionals,
    });

    process.exitCode = summary.failed > 0 ? 1 : 0;
    return;
  }

  if (parsed.command === 'doctor') {
    const report = await doctor({
      configPath: parsed.configPath,
      format: parsed.format,
    });

    process.exitCode = report.ok ? 0 : 2;
    return;
  }

  if (parsed.command === 'init') {
    await init({
      cwd: parsed.cwd,
      agent: parsed.agent,
      format: parsed.format,
    });
    process.exitCode = 0;
    return;
  }

  throw new Error(`Unknown command "${parsed.command}". Supported commands: init, run, doctor.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});