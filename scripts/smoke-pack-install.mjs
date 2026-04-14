import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const npmCommand = 'npm';
const npmExecPath = process.env.npm_execpath;

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = command === npmCommand && npmExecPath
      ? spawn(process.execPath, [npmExecPath, ...args], {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(command, args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function assertAgentKit(projectRoot) {
  const resolveManifestResult = await runCommand(
    npmCommand,
    ['exec', '--', 'node', '-e', "console.log(require.resolve('agentest/agent-kit/manifest.json'))"],
    projectRoot,
  );

  if (resolveManifestResult.exitCode !== 0) {
    throw new Error(
      resolveManifestResult.stderr
      || resolveManifestResult.stdout
      || 'Failed to resolve agentest/agent-kit/manifest.json from the installed package.',
    );
  }

  const manifestPath = resolveManifestResult.stdout.trim();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestDir = path.dirname(manifestPath);

  const requiredRelativePaths = [
    manifest.docs.overview,
    manifest.docs.agent,
    manifest.docs.usage,
    manifest.docs.minimalTemplate,
    manifest.examples.consumer.config,
    manifest.examples.consumer.prompt,
    manifest.examples.consumer.spec,
    manifest.examples.githubIssueTriage.readme,
    manifest.examples.githubIssueTriage.config,
    manifest.examples.githubIssueTriage.prompt,
    manifest.examples.githubIssueTriage.spec,
  ];

  for (const relativePath of requiredRelativePaths) {
    await access(path.resolve(manifestDir, relativePath));
  }
}

async function writeProjectFiles(projectRoot) {
  await mkdir(path.join(projectRoot, 'src', 'prompts'), { recursive: true });
  await mkdir(path.join(projectRoot, 'tests'), { recursive: true });

  await writeFile(
    path.join(projectRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'agentest-pack-smoke',
        private: true,
        type: 'module',
        agentest: './agentest.config.ts',
      },
      null,
      2,
    ),
    'utf8',
  );

  await writeFile(
    path.join(projectRoot, 'agentest.config.ts'),
    [
      "import path from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "import { defineConfig } from 'agentest';",
      '',
      'const currentDir = path.dirname(fileURLToPath(import.meta.url));',
      '',
      'export default defineConfig({',
      '  agent: {',
      '    command: process.execPath,',
      "    args: [path.join(currentDir, 'fake-agent.mjs'), '--prompt', '{prompt}', '--mcp-config', '{mcpConfig}'],",
      '    cwd: currentDir,',
      '  },',
      "  tools: ['grep_search', 'read_file', 'replace_string_in_file'],",
      '  test: {',
      "    files: ['./tests/**/*.agentest.yaml'],",
      '    timeoutMs: 10000,',
      '    failOnUnmockedTool: true,',
      '  },',
      '});',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    path.join(projectRoot, 'src', 'prompts', 'fix-null.ts'),
    [
      'export function buildPrompt(): string {',
      "  return 'Fix the TypeError in user-service.ts where name may be undefined';",
      '}',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    path.join(projectRoot, 'tests', 'fix-null.agentest.yaml'),
    [
      'version: 0.1',
      'name: packed install smoke test loads TypeScript config and prompt module',
      '',
      'promptSource:',
      '  kind: module',
      '  ref: ../src/prompts/fix-null.ts#buildPrompt',
      '',
      'execution:',
      '  timeoutMs: 10000',
      '',
      'mocks:',
      '  - tool: grep_search',
      '    when:',
      '      query:',
      '        regex: user-service|TypeError|name',
      '    returns:',
      '      - file: src/user-service.ts',
      '        line: 2',
      '        text: return user.name.trim();',
      '',
      '  - tool: read_file',
      '    when:',
      '      filePath: src/user-service.ts',
      '    returns: |',
      '      export function getDisplayName(user) {',
      '        return user.name.trim();',
      '      }',
      '',
      '  - tool: replace_string_in_file',
      '    returns:',
      '      success: true',
      '',
      'assert:',
      '  tools:',
      '    required:',
      '      - grep_search',
      '      - read_file',
      '      - replace_string_in_file',
      '    noUnmatchedCalls: true',
      '',
      '  process:',
      '    exitCode: 0',
      '    timeout: false',
      '',
      '  output:',
      '    stdoutContains:',
      '      - contains: Applied null-safe fix',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    path.join(projectRoot, 'fake-agent.mjs'),
    [
      "import path from 'node:path';",
      "import { createRequire } from 'node:module';",
      "import { readFile } from 'node:fs/promises';",
      "import { pathToFileURL } from 'node:url';",
      '',
      'const require = createRequire(import.meta.url);',
      "const agentestEntry = require.resolve('agentest');",
      "const sdkClientPath = require.resolve('@modelcontextprotocol/sdk/client/index.js', { paths: [path.dirname(agentestEntry)] });",
      "const sdkTransportPath = require.resolve('@modelcontextprotocol/sdk/client/stdio.js', { paths: [path.dirname(agentestEntry)] });",
      "const { Client } = await import(pathToFileURL(sdkClientPath).href);",
      "const { StdioClientTransport } = await import(pathToFileURL(sdkTransportPath).href);",
      '',
      'function getArg(flag) {',
      '  const index = process.argv.indexOf(flag);',
      '  return index >= 0 ? process.argv[index + 1] : undefined;',
      '}',
      '',
      'function getText(result) {',
      "  const block = result.content.find((item) => item.type === 'text');",
      "  return block?.text ?? '';",
      '}',
      '',
      'async function main() {',
      "  const prompt = getArg('--prompt');",
      "  const mcpConfigPath = getArg('--mcp-config');",
      '',
      '  if (!prompt || !mcpConfigPath) {',
      "    throw new Error('fake-agent.mjs requires --prompt and --mcp-config arguments.');",
      '  }',
      '',
      "  const mcpConfig = JSON.parse(await readFile(mcpConfigPath, 'utf8'));",
      '  const [serverName, serverConfig] = Object.entries(mcpConfig.mcpServers)[0];',
      '',
      '  if (!serverName || !serverConfig) {',
      "    throw new Error('No MCP server configuration was provided.');",
      '  }',
      '',
      '  const transport = new StdioClientTransport(serverConfig);',
      "  const client = new Client({ name: 'agentest-pack-smoke-agent', version: '0.0.1' }, { capabilities: {} });",
      '  await client.connect(transport);',
      '  await client.listTools();',
      '',
      '  if (/TypeError|user-service|name/i.test(prompt)) {',
      '    await client.callTool({',
      "      name: 'grep_search',",
      '      arguments: { query: prompt },',
      '    });',
      '',
      '    const fileResult = await client.callTool({',
      "      name: 'read_file',",
      "      arguments: { filePath: 'src/user-service.ts' },",
      '    });',
      '',
      '    const source = getText(fileResult);',
      "    const replacement = source.includes('user.name.trim()')",
      "      ? source.replace('user.name.trim()', 'user.name?.trim() ?? \"Anonymous\"')",
      "      : 'export function getDisplayName(user) {\\n  return user.name?.trim() ?? \"Anonymous\";\\n}';",
      '',
      '    await client.callTool({',
      "      name: 'replace_string_in_file',",
      '      arguments: {',
      "        filePath: 'src/user-service.ts',",
      '        oldString: source,',
      '        newString: replacement,',
      '      },',
      '    });',
      '',
      "    process.stdout.write('Applied null-safe fix to src/user-service.ts\\n');",
      '  } else {',
      "    process.stdout.write('No matching workflow for prompt.\\n');",
      '  }',
      '',
      '  await transport.close();',
      '}',
      '',
      'main().catch((error) => {',
      "  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\\n`);",
      '  process.exit(1);',
      '});',
      '',
    ].join('\n'),
    'utf8',
  );
}

async function main() {
  const packResult = await runCommand(npmCommand, ['pack', '--json'], repoRoot);
  if (packResult.exitCode !== 0) {
    throw new Error(packResult.stderr || packResult.stdout || 'npm pack failed.');
  }

  const packOutput = JSON.parse(packResult.stdout);
  const tarballPath = path.resolve(repoRoot, packOutput[0].filename);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agentest-pack-smoke-'));
  const projectRoot = path.join(tempRoot, 'consumer');

  try {
    await mkdir(projectRoot, { recursive: true });
    await writeProjectFiles(projectRoot);

    const installResult = await runCommand(npmCommand, ['install', '--no-package-lock', '--save-dev', tarballPath], projectRoot);
    if (installResult.exitCode !== 0) {
      throw new Error(installResult.stderr || installResult.stdout || 'npm install failed.');
    }

    await assertAgentKit(projectRoot);

    const runResult = await runCommand(npmCommand, ['exec', '--', 'agentest', 'run'], projectRoot);
    process.stdout.write(runResult.stdout);
    if (runResult.stderr.trim()) {
      process.stderr.write(runResult.stderr);
    }

    if (runResult.exitCode !== 0) {
      throw new Error(`Packed install smoke test failed in ${projectRoot}.`);
    }
  } catch (error) {
    process.stderr.write(`Smoke project retained at ${projectRoot}\n`);
    throw error;
  } finally {
    await unlink(tarballPath).catch(() => undefined);
  }

  await rm(tempRoot, { recursive: true, force: true });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
