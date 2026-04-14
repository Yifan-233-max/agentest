import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, tool } from '../../dist/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  agent: {
    command: process.execPath,
    args: [path.join(currentDir, 'fake-agent.mjs'), '--prompt', '{prompt}', '--mcp-config', '{mcpConfig}'],
    cwd: path.resolve(currentDir, '../..'),
  },
  tools: [
    tool({
      name: 'grep_search',
      description: 'Search text patterns in files',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    }),
    tool({
      name: 'read_file',
      description: 'Read file contents',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
        },
        required: ['filePath'],
      },
    }),
    tool({
      name: 'replace_string_in_file',
      description: 'Replace text in a file',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          oldString: { type: 'string' },
          newString: { type: 'string' },
        },
        required: ['filePath', 'oldString', 'newString'],
      },
    }),
  ],
  test: {
    files: ['./tests/**/*.agent.test.mjs', './tests/**/*.agentest.yaml'],
    timeoutMs: 10_000,
    failOnUnmockedTool: true,
    stability: {
      runs: 1,
      minPassRate: 1,
    },
  },
});