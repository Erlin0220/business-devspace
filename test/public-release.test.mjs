import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { testBash } from './test-bash.mjs';

test('release gate distinguishes an absent tag from a failed remote lookup', async () => {
  const workflow = await readFile('.github/workflows/public-release.yml', 'utf8');
  const start = workflow.indexOf('          tag="v${{ steps.metadata.outputs.version }}"');
  const end = workflow.indexOf('          gh release create', start);
  assert.ok(start >= 0 && end > start);
  const gate = workflow.slice(start, end).replaceAll('${{ steps.metadata.outputs.version }}', '9.9.9');
  for (const [state, allowed] of [['missing', true], ['exists', false], ['unavailable', false]]) {
    const result = spawnSync(testBash(), ['-c', `
      set -e
      gh() { return 1; }
      git() {
        if [ "$STATE" = unavailable ]; then return 128; fi
        if [ "$STATE" = exists ]; then printf 'existing-sha refs/tags/v9.9.9\\n'; fi
        return 0
      }
      ${gate}
      printf 'AUTHORIZED\\n'
    `], { encoding: 'utf8', windowsHide: true, timeout: 10000,
      env: { ...process.env, STATE: state, CONFIRM_RELEASE: 'v9.9.9', GITHUB_REPOSITORY: 'fixture/repo' } });
    assert.equal(result.status, allowed ? 0 : 1, result.stderr);
    assert.equal(result.stdout.includes('AUTHORIZED'), allowed);
  }
});

test('release cleanup only deletes a confirmed draft after an ambiguous publication failure', async () => {
  const workflow = await readFile('.github/workflows/public-release.yml', 'utf8');
  const cleanup = workflow.match(/^          cleanup\(\) \{[\s\S]*?^          \}/m)?.[0];
  assert.ok(cleanup, 'The actual publication cleanup function must be tested');
  for (const [state, expected] of [['true', 'DELETE'], ['false', ''], ['unavailable', '']]) {
    const result = spawnSync(testBash(), ['-c', `
      gh() {
        if [ "$1 $2" = 'release view' ]; then
          if [ "$STATE" = unavailable ]; then return 1; fi
          printf '%s\\n' "$STATE"
        elif [ "$1 $2" = 'release delete' ]; then printf 'DELETE\\n'
        else return 2
        fi
      }
      tag=v9.9.9
      published=0
      ${cleanup}
      cleanup
    `], { encoding: 'utf8', windowsHide: true, timeout: 10000,
      env: { ...process.env, STATE: state, GITHUB_REPOSITORY: 'fixture/repo' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected, `Release state ${state} must not authorize unsafe cleanup`);
  }
});

test('public release builds production-profile bytes once, accepts them, then publishes only the transferred exact files', async () => {
  const workflow = await readFile('.github/workflows/public-release.yml', 'utf8');
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /confirm_release:/);
  assert.match(workflow, /test "\$CONFIRM_RELEASE" = "\$tag"/);
  const publish = workflow.slice(workflow.indexOf('\n  publish:'));
  assert.match(publish, /gh issue comment 2/);
  assert.match(publish, /gh issue close 2/);
  assert.match(workflow, /environment: public-release/);
  const build = workflow.slice(workflow.indexOf('\n  build:'), workflow.indexOf('\n  publish:'));
  assert.match(build, /environment: public-release/,
    'Native build/acceptance jobs must resolve the same protected release profile as publish');
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
  assert.doesNotMatch(workflow, /gh release delete[^\n]*--cleanup-tag/,
    'Draft releases do not have a published Git tag yet; cleanup must not fail while deleting a nonexistent tag ref');
  assert.doesNotMatch(workflow, /pull_request_target/);
});
