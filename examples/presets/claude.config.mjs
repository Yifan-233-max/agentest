import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, tool } from '../../dist/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  agent: {
    preset: 'claude',
    command: process.env.CLAUDE_BIN ?? 'claude',
    cwd: currentDir,
    extraArgs: [
      '--dangerously-skip-permissions',
      '--append-system-prompt',
      'Use available MCP tools instead of guessing when the prompt explicitly names them.',
      '--output-format',
      'text',
    ],
  },
  tools: [
    tool({
      name: 'get_feature_spec',
      description: 'Read a feature specification by name',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    }),
    tool({
      name: 'get_bug_report',
      description: 'Read a bug report by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    }),
    tool({
      name: 'submit_release_note',
      description: 'Submit a release note summary',
      inputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
        required: ['summary'],
      },
    }),
  ],
  test: {
    files: ['./claude.agent.test.mjs'],
    timeoutMs: 60_000,
    failOnUnmockedTool: true,
  },
});