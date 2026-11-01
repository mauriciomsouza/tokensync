/**
 * Posts the Markdown report as a single sticky comment on the pull request,
 * found by the hidden `<!-- tokensync:report -->` marker and updated in place.
 * When the PR is back in sync, the existing comment is updated to say so;
 * no comment is created for a PR that never drifted.
 */
import { readFileSync } from 'node:fs';
import { gh, repo } from './github.mjs';

const MARKER = '<!-- tokensync:report -->';
const { owner, name } = repo();
const pr = Number(process.env.TS_PR);
const drift = process.env.TS_DRIFT === 'true';
let body = readFileSync(process.env.TS_REPORT, 'utf8');
if (process.env.TS_RUN_URL)
  body += `\n<sub>[Visual report and logs](${process.env.TS_RUN_URL}) (artifact \`tokensync-report\`).</sub>\n`;

let existing;
for (let page = 1; page <= 10 && !existing; page++) {
  const comments = await gh('GET', `/repos/${owner}/${name}/issues/${pr}/comments?per_page=100&page=${page}`);
  existing = comments.find((c) => c.body?.includes(MARKER));
  if (comments.length < 100) break;
}

if (existing) {
  await gh('PATCH', `/repos/${owner}/${name}/issues/comments/${existing.id}`, { body });
  console.log(`Updated tokensync comment ${existing.html_url}`);
} else if (drift) {
  const c = await gh('POST', `/repos/${owner}/${name}/issues/${pr}/comments`, { body });
  console.log(`Posted tokensync comment ${c.html_url}`);
} else {
  console.log('No drift and no previous comment; nothing to post.');
}
