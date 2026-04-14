#!/usr/bin/env node

import { create, type CreateFormat, type CreateOutputKind } from './create/run-create.js';
import { flow, type FlowFormat } from './flow/run-flow.js';
import { run } from './runner/run-tests.js';

type CliFormat = CreateFormat | FlowFormat;

interface ParsedArgs {
  command: string;
  format: CliFormat;
  configPath?: string;
  source?: string;
  outputPath?: string;
  name?: string;
  filePath?: string;
  writePath?: string;
  outputKind: CreateOutputKind;
  runAfterCreate: boolean;
  force: boolean;
  positionals: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = 'run', ...rest] = argv;
  const positionals: string[] = [];
  let configPath: string | undefined;
  let format: CliFormat = 'human';
  let source: string | undefined;
  let outputPath: string | undefined;
  let name: string | undefined;
  let filePath: string | undefined;
  let writePath: string | undefined;
  let outputKind: CreateOutputKind = 'yaml';
  let runAfterCreate = false;
  let force = false;

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === '--config') {
      configPath = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === '--format') {
      const nextValue = rest[index + 1];
      if (nextValue === 'json' || nextValue === 'human' || nextValue === 'mermaid') {
        format = nextValue;
        index += 1;
        continue;
      }

      throw new Error(`Unsupported --format value "${nextValue}". Use "human", "json", or "mermaid".`);
    }

    if (value === '--source') {
      source = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === '--output') {
      outputPath = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === '--name') {
      name = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === '--file') {
      filePath = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === '--write') {
      writePath = rest[index + 1];
      index += 1;
      continue;
    }

    if (value === '--as') {
      const nextValue = rest[index + 1];
      if (nextValue === 'yaml' || nextValue === 'ts') {
        outputKind = nextValue;
        index += 1;
        continue;
      }

      throw new Error(`Unsupported --as value "${nextValue}". Use "yaml" or "ts".`);
    }

    if (value === '--run') {
      runAfterCreate = true;
      continue;
    }

    if (value === '--force') {
      force = true;
      continue;
    }

    positionals.push(value);
  }

  return {
    command,
    format,
    configPath,
    source,
    outputPath,
    name,
    filePath,
    writePath,
    outputKind,
    runAfterCreate,
    force,
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

  if (parsed.command === 'flow') {
    const specFilePath = parsed.filePath ?? parsed.positionals[0];
    if (!specFilePath) {
      throw new Error('agentest flow requires a YAML spec path. Pass it as a positional argument or with --file.');
    }

    await flow({
      filePath: specFilePath,
      format: parsed.format,
      writePath: parsed.writePath,
    });
    process.exitCode = 0;
    return;
  }

  if (parsed.command === 'create') {
    if (parsed.format === 'mermaid') {
      throw new Error('agentest create supports only --format human or --format json.');
    }

    const intent = parsed.positionals.join(' ').trim();
    if (!intent) {
      throw new Error('agentest create requires a natural-language intent.');
    }

    await create({
      intent,
      configPath: parsed.configPath,
      source: parsed.source,
      outputPath: parsed.outputPath,
      name: parsed.name,
      format: parsed.format as CreateFormat,
      outputKind: parsed.outputKind,
      runAfterCreate: parsed.runAfterCreate,
      force: parsed.force,
    });
    process.exitCode = 0;
    return;
  }

  throw new Error(`Unknown command "${parsed.command}". Supported commands: run, flow, create.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});