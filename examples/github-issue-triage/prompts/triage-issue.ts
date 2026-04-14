export function buildPrompt(args: {
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
}): string {
  return [
    `Analyze GitHub issue #${args.issueNumber} in ${args.owner}/${args.repo}.`,
    ``,
    `Issue title: ${args.issueTitle}`,
    ``,
    `Issue body:`,
    args.issueBody,
    ``,
    `Your task:`,
    `1. Use search_code to find code related to this issue in the repository`,
    `2. Use get_file_contents to read the relevant source file`,
    `3. Use create_issue_comment to post a comment with your root cause analysis and suggested fix`,
    ``,
    `Rules:`,
    `- Do NOT modify any files`,
    `- Do NOT close or label the issue`,
    `- Only use the three tools listed above`,
  ].join('\n');
}
