import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('Windows legacy task migration uses one hidden elevated PowerShell helper, never cmd.exe', async () => {
  const script = await readFile('platform/windows/bootstrap.ps1', 'utf8');
  assert.match(script, /Join-Path \$env:SystemRoot 'Sysnative'/,
    '32-bit bootstrap should still use Sysnative for direct access to native system tools');
  assert.match(script, /\$elevatedSystemDirectory = Join-Path \$env:SystemRoot 'System32'/);
  assert.match(script, /\$elevatedPowerShell = Join-Path \$elevatedSystemDirectory 'WindowsPowerShell\\v1\.0\\powershell\.exe'/);
  assert.match(script, /\$schtasks = Join-Path \$elevatedSystemDirectory 'schtasks\.exe'/);
  assert.match(script, /-WindowStyle', 'Hidden', '-EncodedCommand'/);
  assert.match(script, /Start-Process -FilePath \$elevatedPowerShell -Verb RunAs .* -WindowStyle Hidden/);
  assert.doesNotMatch(script, /\$cmd\s*=|Start-Process -FilePath \$cmd|cmd\.exe/,
    'The installer must not flash a console window just to migrate legacy startup tasks');
});

test('Windows activation pointer failure restores previous startup ownership', async () => {
  const script = await readFile('platform/windows/bootstrap.ps1', 'utf8');
  assert.match(script, /try \{\r?\n      Write-AtomicJson \$activeFile \$next/);
  assert.ok(script.includes('if ($active) { Restore-Previous $active $candidate }'));
  assert.ok(script.includes("$recovery = 'candidate startup was removed'"));
  assert.ok(script.includes("$recovery = 'previous version was restored'"));
  assert.ok(script.includes('Local activation pointer update failed; ${recovery}'));
});

test('Windows staging is reset before stopping the active version without a create-delete-create shortcut', async () => {
  const script = await readFile('platform/windows/bootstrap.ps1', 'utf8');
  assert.ok(script.includes('Initialize-StagingDirectory $stage'));
  assert.doesNotMatch(script, /-Path \$versionsRoot, \$stagingRoot/);
  assert.ok(script.indexOf('Initialize-StagingDirectory $stage') < script.indexOf("Write-Step 'Stopping the active local version"));
  assert.match(script, /Remove-PayloadTree \$Path\r?\n\s+New-Item -ItemType Directory -Path \$Path -ErrorAction Stop/);
});

test('Windows staging handles a real sharing lock and rejects a persistent handle without touching active state',
  { skip: process.platform !== 'win32' }, () => {
  const powershell = join(process.env.SystemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // Extract only the two filesystem helpers. Never execute bootstrap's install,
  // startup, process cleanup or Enrollment entrypoints on the development host.
  const command = String.raw`
$ErrorActionPreference = 'Stop'
$fixtureClock = [Diagnostics.Stopwatch]::StartNew()
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'platform/windows/bootstrap.ps1'), [ref]$null, [ref]$null)
foreach ($name in @('Remove-PayloadTree', 'Initialize-StagingDirectory')) {
  $fn = $ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name}, $true)
  if (-not $fn) { throw 'Missing staging helper' }
  Invoke-Expression $fn.Extent.Text
}
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Threading;
public static class LockedDirectoryFixture {
  public static FileStream Hold(string path) {
    Directory.CreateDirectory(path);
    return new FileStream(Path.Combine(path, "held.txt"), FileMode.Create,
      FileAccess.ReadWrite, FileShare.Read);
  }
  public static void ReleaseSoon(FileStream handle) {
    Thread thread = new Thread(delegate() { Thread.Sleep(500); handle.Dispose(); });
    thread.IsBackground = true;
    thread.Start();
  }
}
'@
$fixtureSetupMs = $fixtureClock.ElapsedMilliseconds
Write-Output ('staging-fixture-setup-ms=' + $fixtureSetupMs)
$root = Join-Path $env:TEMP ('tds-stage-test-' + [Guid]::NewGuid().ToString('N'))
$stage = Join-Path $root 's'
$active = Join-Path $root 'active.json'
$held = $null
try {
  [void][IO.Directory]::CreateDirectory($stage)
  [IO.File]::WriteAllText($active, 'previous-version-must-survive')
  [IO.File]::WriteAllText((Join-Path $stage 'stale.txt'), 'old staging data')
  Initialize-StagingDirectory $stage
  if (@(Get-ChildItem -LiteralPath $stage -Force).Count) { throw 'Stale payload survived reset' }

  $held = [LockedDirectoryFixture]::Hold($stage)
  $originalRejected = $false
  try { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction Stop }
  catch {
    $cause = $_.Exception.GetBaseException()
    if ($cause -isnot [UnauthorizedAccessException] -and $cause -isnot [IO.IOException]) { throw }
    $originalRejected = $true
  }
  if (-not $originalRejected) { throw 'The fixture did not reproduce staging cleanup denial' }
  [LockedDirectoryFixture]::ReleaseSoon($held)
  $held = $null
  Initialize-StagingDirectory $stage
  if (-not [IO.Directory]::Exists($stage)) { throw 'Released directory was not recreated' }

  $held = [LockedDirectoryFixture]::Hold($stage)
  $elapsed = [Diagnostics.Stopwatch]::StartNew()
  $rejected = $false
  try { Initialize-StagingDirectory $stage } catch { $rejected = $true }
  if (-not $rejected -or $elapsed.Elapsed.TotalSeconds -gt 12) { throw 'Persistent lock was ignored or retried without a bound' }
  Write-Output ('staging-persistent-lock-ms=' + $elapsed.ElapsedMilliseconds)
  if ([IO.File]::ReadAllText($active) -ne 'previous-version-must-survive') { throw 'Active version was changed' }
  Write-Output 'locked-directory-regression-passed'
} finally {
  if ($held) { $held.Dispose() }
  if ([IO.Directory]::Exists($root)) { [IO.Directory]::Delete($root, $true) }
}
`;
  // Cold PowerShell/.NET compilation belongs to the test harness, not the
  // installer retry deadline. The persistent-lock assertion above stays 12s.
  let output;
  try {
    output = execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
      { cwd: process.cwd(), windowsHide: true, encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
  } catch (error) {
    console.error(String(error.stdout ?? '').slice(-2000));
    throw error;
  }
  console.log(output.trim());
  assert.match(output, /locked-directory-regression-passed/);
});

test('Windows bootstrap parses in the 32-bit PowerShell 5 host used by NSIS', { skip: process.platform !== 'win32' }, () => {
  const powershell = join(process.env.SystemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = "$errors=@();[void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'platform/windows/bootstrap.ps1'),[ref]$null,[ref]$errors);if($errors.Count){$errors|Out-String|Write-Error;exit 1}";
  execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { cwd: process.cwd(), windowsHide: true, stdio: 'pipe' });
});

test('Windows Git prerequisite reuses matching Git Bash and otherwise acquires only the pinned official release', async () => {
  const script = await readFile('platform/windows/bootstrap.ps1', 'utf8');
  assert.ok(script.includes('function Test-NeedGitPrerequisite'));
  assert.ok(script.includes("Join-Path $directory 'git.exe'"));
  assert.ok(script.includes("'bin\\bash.exe'"));
  assert.ok(script.includes('function Install-GitPrerequisite'));
  assert.ok(script.includes('git-for-windows-official-release'));
  assert.ok(script.includes('Git prerequisite SHA-256 verification failed'));
  assert.ok(script.includes('268435456'));
  assert.match(script, /curl\.exe/);
  assert.match(script, /--proto-redir '=https'/);
  assert.doesNotMatch(script, /--retry-all-errors/,
    'The Windows prerequisite downloader must remain compatible with older inbox curl builds');
  assert.ok(script.includes('$activeRoot = if ($active)'));
  assert.doesNotMatch(script, /git-fallback/);
  assert.ok(!script.includes('return -not (Get-Command git.exe -ErrorAction SilentlyContinue)'));
});

test('Windows candidate rollback attempts all owned cleanup and retains a candidate if any cleanup remains uncertain',
  { skip: process.platform !== 'win32' }, () => {
  const powershell = join(process.env.SystemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = [
    "$ErrorActionPreference='Stop'",
    "$ast=[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'platform/windows/bootstrap.ps1'),[ref]$null,[ref]$null)",
    "$fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Stop-CandidateForRollback'},$true)",
    "if(-not $fn){throw 'Missing rollback helper'}",
    "Invoke-Expression $fn.Extent.Text",
    "function Invoke-Client { return 1 }",
    "function Remove-KnownStartupEntries { throw 'task cleanup blocked' }",
    "function Stop-InstallProcesses { $script:processCleanup=$true }",
    "$script:processCleanup=$false; $rejected=$false",
    "try { Stop-CandidateForRollback 'test-only-no-processes' } catch { if($_.Exception.Message -notmatch 'payload was retained'){throw}; $rejected=$true }",
    "if(-not $rejected -or -not $script:processCleanup){throw 'Partial cleanup was skipped or hidden'}",
    "function Remove-KnownStartupEntries { $script:tasksRemoved=$true }",
    "$script:processCleanup=$false; $script:tasksRemoved=$false",
    "Stop-CandidateForRollback 'test-only-no-processes'",
    "if(-not $script:tasksRemoved -or -not $script:processCleanup){throw 'Cleanup fallback did not complete'}",
  ].join('; ');
  execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { cwd: process.cwd(), windowsHide: true, stdio: 'pipe' });
});

test('Windows rollback process discovery matches the real installation prefix, never a sibling or unknown executable',
  { skip: process.platform !== 'win32' }, () => {
  const powershell = join(process.env.SystemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = [
    "$ErrorActionPreference='Stop'",
    "$ast=[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'platform/windows/bootstrap.ps1'),[ref]$null,[ref]$null)",
    "$fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-InstallProcessIds'},$true)",
    "Invoke-Expression $fn.Extent.Text",
    // This mocks process metadata only: a synthetic absolute root keeps DOS
    // aliases in the test host's TEMP directory out of the path predicate.
    "$script:InstallPath=Join-Path ([IO.Path]::GetPathRoot($PSHOME)) 'tds-owner-predicate-test'",
    "function Get-CimInstance { @([pscustomobject]@{Name='node.exe';ExecutablePath=(Join-Path $script:InstallPath 'v/1/runtime/node.exe');ProcessId=21},[pscustomobject]@{Name='node.exe';ExecutablePath=(Join-Path ($script:InstallPath+'-foreign') 'v/1/runtime/node.exe');ProcessId=22},[pscustomobject]@{Name='other.exe';ExecutablePath=(Join-Path $script:InstallPath 'v/1/other.exe');ProcessId=23},[pscustomobject]@{Name='node.exe';ExecutablePath=$null;ProcessId=24}) }",
    "$actual=@(Get-InstallProcessIds)",
    "if($actual.Count -ne 1 -or $actual[0] -ne 21){throw 'Incorrect executable ownership prefix'}",
  ].join('; ');
  execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { cwd: process.cwd(), windowsHide: true, stdio: 'pipe' });
});

test('Windows cleanup fails closed on unavailable ownership queries and pins a handle before checking a process path',
  { skip: process.platform !== 'win32' }, () => {
  const powershell = join(process.env.SystemRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = [
    "$ErrorActionPreference='Stop'",
    "$ast=[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'platform/windows/bootstrap.ps1'),[ref]$null,[ref]$null)",
    "foreach($name in @('Get-InstallProcessIds','Stop-OwnedInstallProcess')) { $fn=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true); if(-not $fn){throw 'Missing owned cleanup helper'}; Invoke-Expression $fn.Extent.Text }",
    "$script:InstallPath=Join-Path ([IO.Path]::GetPathRoot($PSHOME)) 'tds-owned-handle-test'",
    "function Get-CimInstance { [CmdletBinding()] param([string]$ClassName); Write-Error 'CIM unavailable' }",
    "$rejected=$false;try { $null=Get-InstallProcessIds } catch { $rejected=$true };if(-not $rejected){throw 'Uncertain ownership was treated as no processes'}",
    "$script:fake=[pscustomobject]@{Path=(Join-Path $script:InstallPath 'v/1/runtime/node.exe')}",
    "$script:fake | Add-Member ScriptProperty Handle { $script:pinned=$true; 123 }",
    "$script:fake | Add-Member ScriptMethod Kill { if(-not $script:pinned){throw 'Unpinned PID'}; $script:killed=$true }",
    "$script:fake | Add-Member ScriptMethod Dispose { $script:disposed=$true }",
    "function Get-Process { return $script:fake }",
    "$script:pinned=$false;$script:killed=$false;$script:disposed=$false",
    "Stop-OwnedInstallProcess 77",
    "if(-not $script:pinned -or -not $script:killed -or -not $script:disposed){throw 'Owned process did not use a bounded native handle'}",
    "$script:fake.Path=Join-Path ($script:InstallPath+'-foreign') 'v/1/runtime/node.exe'",
    "$script:pinned=$false;$script:killed=$false;$script:disposed=$false",
    "Stop-OwnedInstallProcess 77",
    "if($script:killed -or -not $script:disposed){throw 'A replaced foreign process was signalled or its handle leaked'}",
  ].join('; ');
  execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { cwd: process.cwd(), windowsHide: true, stdio: 'pipe' });
});
