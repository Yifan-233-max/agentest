import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

interface HelperResult<T> {
  value: T;
}

function resolveRuntimePath(relativePath: string): string {
  const currentFile = fileURLToPath(import.meta.url);
  const extension = path.extname(currentFile);
  return fileURLToPath(new URL(relativePath.replace('.js', extension), import.meta.url));
}

function isTypeScriptModule(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.ts' || extension === '.tsx';
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function runTypeScriptHelper<T>(options: {
  filePath: string;
  exportName: string;
  mode: 'export' | 'invoke';
  args?: unknown;
}): Promise<T> {
  const helperPath = resolveRuntimePath('./load-module-process.js');
  const tsxLoaderPath = pathToFileURL(require.resolve('tsx/esm')).href;
  const childArgs = [
    '--import',
    tsxLoaderPath,
    helperPath,
    '--file',
    options.filePath,
    '--export',
    options.exportName,
    '--mode',
    options.mode,
  ];

  if (options.mode === 'invoke') {
    childArgs.push('--args-json', JSON.stringify(options.args ?? {}));
  }

  const child = spawn(process.execPath, childArgs, {
    cwd: process.cwd(),
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
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    const details = stderr.trim() || stdout.trim() || `exitCode=${exitCode}`;
    throw new Error(`Failed to load TypeScript module ${options.filePath}: ${details}`);
  }

  try {
    return (JSON.parse(stdout) as HelperResult<T>).value;
  } catch (error) {
    throw new Error(
      `Failed to parse TypeScript module output for ${options.filePath}: ${toError(error).message}`,
    );
  }
}

export async function importModuleExport<T>(filePath: string, exportName = 'default'): Promise<T> {
  if (isTypeScriptModule(filePath)) {
    return runTypeScriptHelper<T>({
      filePath,
      exportName,
      mode: 'export',
    });
  }

  const importedModule = await import(pathToFileURL(filePath).href);
  if (!(exportName in importedModule)) {
    throw new Error(`Export "${exportName}" was not found in ${filePath}.`);
  }

  return importedModule[exportName] as T;
}

export async function invokeModuleExport<T>(filePath: string, exportName: string, args?: unknown): Promise<T> {
  if (isTypeScriptModule(filePath)) {
    return runTypeScriptHelper<T>({
      filePath,
      exportName,
      mode: 'invoke',
      args,
    });
  }

  const importedModule = await import(pathToFileURL(filePath).href);
  if (!(exportName in importedModule)) {
    throw new Error(`Export "${exportName}" was not found in ${filePath}.`);
  }

  const value = importedModule[exportName];
  if (typeof value !== 'function') {
    throw new Error(`Export "${exportName}" in ${filePath} is not a function.`);
  }

  return value(args) as T;
}

export async function importModuleDefault<T>(filePath: string): Promise<T> {
  return importModuleExport<T>(filePath, 'default');
}