import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('native candidate workflow audits actual bundle bytes and retains review evidence only', async () => {
  const workflow = await readFile('.github/workflows/build-installers.yml', 'utf8');
  assert.match(workflow, /scripts\/audit-inventory\.mjs/);
  assert.match(workflow, /scripts\/verify-redistribution\.mjs/);
  assert.match(workflow, /syft\.json\.summary\.json/);
  assert.match(workflow, /THIRD-PARTY-NOTICES\.txt/);
  assert.match(workflow, /sbom\.cdx\.json/);
  assert.doesNotMatch(workflow, /path:[^\n]*Team-DevSpace-.*\.(?:exe|pkg|tar\.gz)/,
    'Compliance evidence workflow must not publish installer bytes before the public binary gate closes');
});
