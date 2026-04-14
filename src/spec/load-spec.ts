import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import type { PromptTestSpec } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function isYamlTestFile(filePath: string): boolean {
  return filePath.endsWith('.agentest.yaml') || filePath.endsWith('.agentest.yml');
}

export async function loadPromptTestSpec(filePath: string): Promise<PromptTestSpec> {
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