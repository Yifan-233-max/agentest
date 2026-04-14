import { glob } from 'tinyglobby';

export interface PromptSourceCandidate {
  kind: 'file' | 'module-candidate';
  path: string;
}

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.git/**',
  '**/.agentest/**',
];

export async function detectPromptSources(workspaceRoot: string): Promise<PromptSourceCandidate[]> {
  const fileSources = await glob([
    'prompts/**/*.{md,txt,prompt}',
    'workflows/**/*.{md,txt,prompt,yaml,yml}',
    'flows/**/*.{md,txt,prompt,yaml,yml}',
    '**/*prompt*.{md,txt}',
    '**/*workflow*.{md,txt,yaml,yml}',
  ], {
    cwd: workspaceRoot,
    onlyFiles: true,
    ignore: IGNORE_PATTERNS,
  });

  const moduleSources = await glob([
    'src/**/*prompt*.{ts,js,mjs,cjs,tsx,jsx}',
    'src/**/*workflow*.{ts,js,mjs,cjs,tsx,jsx}',
    '**/prompts/**/*.{ts,js,mjs,cjs,tsx,jsx}',
    '**/workflows/**/*.{ts,js,mjs,cjs,tsx,jsx}',
    '**/flows/**/*.{ts,js,mjs,cjs,tsx,jsx}',
  ], {
    cwd: workspaceRoot,
    onlyFiles: true,
    ignore: IGNORE_PATTERNS,
  });

  const seen = new Set<string>();
  const promptSources: PromptSourceCandidate[] = [];

  for (const entry of fileSources) {
    const normalized = entry.replaceAll('\\', '/');
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    promptSources.push({
      kind: 'file',
      path: normalized,
    });
  }

  for (const entry of moduleSources) {
    const normalized = entry.replaceAll('\\', '/');
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    promptSources.push({
      kind: 'module-candidate',
      path: normalized,
    });
  }

  return promptSources.sort((left, right) => left.path.localeCompare(right.path));
}