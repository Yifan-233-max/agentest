import { defineConfig } from '../../dist/index.js';

export default defineConfig({
  agent: {
    preset: 'copilot',
  },
  tools: [
    {
      name: 'search_code',
      description: 'Search for code across GitHub repositories using a text query. Returns matching file paths, line numbers, and text fragments.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query using GitHub code search syntax',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_file_contents',
      description: 'Get the contents of a file from a GitHub repository.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner (username or organization)',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          path: {
            type: 'string',
            description: 'Path to the file within the repository',
          },
        },
        required: ['owner', 'repo', 'path'],
      },
    },
    {
      name: 'create_issue_comment',
      description: 'Add a comment to an existing GitHub issue.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            description: 'Repository owner',
          },
          repo: {
            type: 'string',
            description: 'Repository name',
          },
          issue_number: {
            type: 'number',
            description: 'The issue number to comment on',
          },
          body: {
            type: 'string',
            description: 'The comment body in markdown format',
          },
        },
        required: ['owner', 'repo', 'issue_number', 'body'],
      },
    },
  ],
  test: {
    files: ['./tests/**/*.agentest.yaml'],
    timeoutMs: 120_000,
    failOnUnmockedTool: true,
  },
});
