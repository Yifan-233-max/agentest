import { agentTest, expect, match } from '../../../dist/index.js';

export default agentTest('uses mocked MCP tools to validate a null-safe fix workflow', async (t) => {
  t.prompt('Fix the TypeError in user-service.ts where name may be undefined');

  t.mock('grep_search')
    .when({ query: /user-service|TypeError|name/ })
    .returns([
      { file: 'src/user-service.ts', line: 2, text: 'return user.name.trim();' },
    ]);

  t.mock('read_file')
    .when({ filePath: 'src/user-service.ts' })
    .returns([
      'export function getDisplayName(user) {',
      '  return user.name.trim();',
      '}',
    ].join('\n'));

  t.mock('replace_string_in_file').returns({ success: true });

  const result = await t.run();

  expect(result).toExitSuccessfully();
  expect(result).toExitWithCode(0);
  expect(result).not.toHaveTimedOut();
  expect(result).toFinishWithin(10_000);
  expect(result).toHaveCalledTool('grep_search');
  expect(result).toHaveCalledTool('read_file');
  expect(result).toHaveCalledTool('replace_string_in_file');
  expect(result).toHaveCalledToolTimes('replace_string_in_file', 1);
  expect(result).toOnlyCallTools([
    'grep_search',
    'read_file',
    'replace_string_in_file',
  ]);
  expect(result).toHaveToolSubsequence([
    'grep_search',
    'read_file',
    'replace_string_in_file',
  ]);
  expect(result).toHaveCalledToolWith('replace_string_in_file', {
    filePath: 'src/user-service.ts',
    newString: /user\.name\?\./,
  });
  expect(result).toContainStdout(match.stringContaining('Applied null-safe fix'));
  expect(result).not.toContainStderr(/./);
  expect(result).toHaveNoUnmatchedToolCalls();
});