import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function getText(result) {
  const block = result.content.find((item) => item.type === 'text');
  return block?.text ?? '';
}

async function main() {
  const prompt = getArg('--prompt');
  const mcpConfigPath = getArg('--mcp-config');

  if (!prompt || !mcpConfigPath) {
    throw new Error('fake-agent.mjs requires --prompt and --mcp-config arguments.');
  }

  const mcpConfig = JSON.parse(await readFile(mcpConfigPath, 'utf8'));
  const [serverName, serverConfig] = Object.entries(mcpConfig.mcpServers)[0];

  if (!serverName || !serverConfig) {
    throw new Error('No MCP server configuration was provided.');
  }

  const transport = new StdioClientTransport(serverConfig);
  const client = new Client({ name: 'agentest-fake-agent', version: '0.0.1' }, { capabilities: {} });
  await client.connect(transport);
  await client.listTools();

  if (/TypeError|user-service|name/i.test(prompt)) {
    await client.callTool({
      name: 'grep_search',
      arguments: { query: prompt },
    });

    const fileResult = await client.callTool({
      name: 'read_file',
      arguments: { filePath: 'src/user-service.ts' },
    });

    const source = getText(fileResult);
    const replacement = source.includes('user.name.trim()')
      ? source.replace('user.name.trim()', 'user.name?.trim() ?? "Anonymous"')
      : 'export function getDisplayName(user) {\n  return user.name?.trim() ?? "Anonymous";\n}';

    await client.callTool({
      name: 'replace_string_in_file',
      arguments: {
        filePath: 'src/user-service.ts',
        oldString: source,
        newString: replacement,
      },
    });

    process.stdout.write('Applied null-safe fix to src/user-service.ts\n');
  } else {
    process.stdout.write('No matching workflow for prompt.\n');
  }

  await transport.close();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});