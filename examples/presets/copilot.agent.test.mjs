import { agentTest, expect, match } from '../../dist/index.js';

export default agentTest('Copilot CLI runs the mocked release note workflow end to end', async (t) => {
  t.prompt([
    'Use the get_feature_spec tool with name "checkout-v2".',
    'Then use the get_bug_report tool with id "checkout-null-name".',
    'Finally call submit_release_note with one concise release note sentence.',
    'Do not answer from prior knowledge and do not skip any tool.',
  ].join(' '));

  t.mock('get_feature_spec')
    .when({ name: 'checkout-v2' })
    .returns([
      'Feature: checkout-v2',
      'Behavior: display names should be trimmed before rendering.',
      'Fallback: when a display name is missing, use "Anonymous".',
    ].join('\n'));

  t.mock('get_bug_report')
    .when({ id: 'checkout-null-name' })
    .returns([
      'Bug ID: checkout-null-name',
      'Observed failure: checkout crashes when user.name is undefined.',
      'Suggested fix: null-safe trim and fallback string.',
    ].join('\n'));

  t.mock('submit_release_note')
    .returns({ accepted: true, id: 'release-note-001' });

  const result = await t.run();

  expect(result).toExitSuccessfully();
  expect(result).not.toHaveTimedOut();
  expect(result).toHaveCalledTool('get_feature_spec');
  expect(result).toHaveCalledTool('get_bug_report');
  expect(result).toHaveCalledTool('submit_release_note');
  expect(result).toHaveToolSubsequence([
    'get_feature_spec',
    'get_bug_report',
    'submit_release_note',
  ]);
  expect(result).toHaveCalledToolWith('submit_release_note', match.objectContaining({
    summary: /Anonymous|null-safe|undefined/i,
  }));
  expect(result).toOnlyCallTools([
    'get_feature_spec',
    'get_bug_report',
    'submit_release_note',
  ]);
  expect(result).toHaveNoUnmatchedToolCalls();
});