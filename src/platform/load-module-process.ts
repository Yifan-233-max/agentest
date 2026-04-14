import { pathToFileURL } from 'node:url';

type Mode = 'export' | 'invoke';

interface Options {
  filePath: string;
  exportName: string;
  mode: Mode;
  argsJson?: string;
}

function parseArgs(argv: string[]): Options {
  const options: Partial<Options> = {};

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      continue;
    }

    if (flag === '--file') {
      options.filePath = value;
      continue;
    }

    if (flag === '--export') {
      options.exportName = value;
      continue;
    }

    if (flag === '--mode' && (value === 'export' || value === 'invoke')) {
      options.mode = value;
      continue;
    }

    if (flag === '--args-json') {
      options.argsJson = value;
    }
  }

  if (!options.filePath || !options.exportName || !options.mode) {
    throw new Error('load-module-process requires --file, --export, and --mode arguments.');
  }

  return options as Options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const importedModule = await import(pathToFileURL(options.filePath).href);

  if (!(options.exportName in importedModule)) {
    throw new Error(`Export "${options.exportName}" was not found in ${options.filePath}.`);
  }

  let value = importedModule[options.exportName];
  if (options.mode === 'invoke') {
    if (typeof value !== 'function') {
      throw new Error(`Export "${options.exportName}" in ${options.filePath} is not a function.`);
    }

    const args = options.argsJson ? JSON.parse(options.argsJson) : undefined;
    value = await value(args);
  }

  process.stdout.write(JSON.stringify({ value }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});