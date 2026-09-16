import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public release builds production-profile bytes once, accepts them, then publishes only the transferred exact files', async () => {
  const workflow = await readFile('.github/workflows/public-release.yml', 'utf8');
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /confirm_release:/);
  assert.match(workflow, /test "\$CONFIRM_RELEASE" = "\$tag"/);
  const publish = workflow.slice(workflow.indexOf('\n  publish:'));
  assert.match(publish, /gh issue comment 2/);
  assert.match(publish, /gh issue close 2/);
  assert.match(workflow, /environment: public-release/);
  assert.match(workflow, /TEAM_DEVSPACE_RELEASE_PROFILE_JSON: \$\{\{ vars\.TEAM_DEVSPACE_RELEASE_PROFILE \}\}/);
  assert.match(workflow, /requireProductionProfile/);
  assert.match(workflow, /acceptance:platform -- --direct-windows-installer/);
  assert.match(workflow, /acceptance:platform -- --system-macos-installer/);
  assert.match(workflow, /verify-redistribution\.mjs/);
  assert.match(workflow, /prepare-public-release\.mjs/);
  assert.match(workflow, /gh release create[\s\S]*--draft/);
  assert.match(workflow, /private Draft Release/);
  assert.match(workflow, /gh release upload "v\$VERSION"/);
  assert.match(publish, /gh release download/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact|actions\/download-artifact/,
    'Unapproved installer bytes must never transit public-repository Actions artifacts');
  assert.match(workflow, /gh release edit[\s\S]*--draft=false/);
  assert.doesNotMatch(publish, /npm run package|macos-cloudflared\.mjs|acceptance:platform/,
    'The publication job must never rebuild or re-accept bytes after transfer');
  assert.match(publish, /remote\.digest!==local/);
  assert.ok(publish.indexOf('gh release edit "$tag"') < publish.indexOf('gh issue close 2'),
    'Issue #2 closes only after the exact Draft Release becomes the public immutable release');
  assert.match(workflow, /Remove an unpublished Draft Release after any failed candidate run/);
  assert.doesNotMatch(workflow, /pull_request_target/);
});
