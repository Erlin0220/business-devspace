import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryPath, inventoryTarCommand } from '../scripts/audit-inventory.mjs';

test('public inventory paths cannot reveal builder paths or escape the payload', () => {
  assert.equal(inventoryPath('\\node_modules\\example\\package.json'), '/node_modules/example/package.json');
  assert.equal(inventoryPath('/runtime/bin/node'), '/runtime/bin/node');
  for (const path of ['C:\\Users\\person\\project', '//host/share/file', '/../secret', 'relative/path', '/C:/Users/person']) {
    assert.throws(() => inventoryPath(path));
  }
});

test('inventory extraction never resolves Git Bash GNU tar for Windows drive-letter archives', () => {
  assert.equal(inventoryTarCommand('win32', { SystemRoot: 'D:\\Windows' }), 'D:\\Windows\\System32\\tar.exe');
  assert.equal(inventoryTarCommand('linux', {}), '/usr/bin/tar');
  assert.equal(inventoryTarCommand('darwin', {}), '/usr/bin/tar');
});
