import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '../../dist/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  agent: {
    command: process.execPath,
    args: [path.resolve(currentDir, '../simple/fake-agent.mjs'), '--prompt', '{prompt}', '--mcp-config', '{mcpConfig}'],
    cwd: currentDir,
  },
  tools: ['grep_search', 'read_file', 'replace_string_in_file'],
  test: {
    files: ['./tests/**/*.agentest.yaml'],
    timeoutMs: 10_000,
    failOnUnmockedTool: true,
  },
});