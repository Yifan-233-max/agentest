import { readFile, writeFile } from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { isRecord, matchesValue, reviveMatcher } from '../matchers.js';
import type {
  MockServerState,
  ReturnStubAction,
  ThrowStubAction,
  ToolStubDefinition,
  TraceEntry,
} from '../types.js';

function parseArgs(argv: string[]): string {
  const stateIndex = argv.indexOf('--state');
  if (stateIndex >= 0 && argv[stateIndex + 1]) {
    return argv[stateIndex + 1];
  }

  if (argv[0]) {
    return argv[0];
  }

  throw new Error('Missing --state <path> argument for mock MCP server.');
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function toToolResult(value: unknown, isError = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: toText(value),
      },
    ],
    ...(isRecord(value) ? { structuredContent: value } : {}),
    ...(isError ? { isError: true } : {}),
  };
}

async function main(): Promise<void> {
  const statePath = parseArgs(process.argv.slice(2));
  const state = JSON.parse(await readFile(statePath, 'utf8')) as MockServerState;
  const trace: TraceEntry[] = [];

  const server = new Server(
    { name: 'agentest-mock-mcp', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  async function flushTrace() {
    await writeFile(state.traceFilePath, JSON.stringify(trace, null, 2), 'utf8');
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: state.tools.map((toolDefinition) => ({
        name: toolDefinition.name,
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema as {
          type: 'object';
          properties?: Record<string, object>;
          required?: string[];
        },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const candidates = state.stubs[toolName] ?? [];

    const matchIndex = candidates.findIndex((stub) => {
      if (stub.when === undefined) {
        return true;
      }

      return matchesValue(args, reviveMatcher(stub.when));
    });

    const stub = matchIndex >= 0 ? candidates[matchIndex] : undefined;

    if (!stub) {
      const errorMessage = `No mock response matched tool "${toolName}" with args ${JSON.stringify(args)}.`;
      trace.push({
        tool: toolName,
        args,
        matched: false,
        isError: true,
        timestamp: new Date().toISOString(),
        errorMessage,
      });
      await flushTrace();

      return toToolResult(errorMessage, state.failOnUnmockedTool);
    }

    if (stub.action.type === 'throw') {
      const errorMessage = (stub.action as ThrowStubAction).message;
      trace.push({
        tool: toolName,
        args,
        matched: true,
        isError: true,
        timestamp: new Date().toISOString(),
        stubIndex: matchIndex,
        errorMessage,
      });
      await flushTrace();

      return toToolResult(errorMessage, true);
    }

    const response = (stub.action as ReturnStubAction).value;
    trace.push({
      tool: toolName,
      args,
      matched: true,
      isError: false,
      timestamp: new Date().toISOString(),
      stubIndex: matchIndex,
      response,
    });
    await flushTrace();

    return toToolResult(response);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});