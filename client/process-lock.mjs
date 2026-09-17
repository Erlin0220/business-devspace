import Database from 'better-sqlite3';
import { setTimeout as sleep } from 'node:timers/promises';

const BUSY_CODES = new Set(['SQLITE_BUSY', 'SQLITE_BUSY_TIMEOUT', 'SQLITE_LOCKED']);

function isSqliteBusy(error) {
  return Boolean(error && typeof error === 'object' && BUSY_CODES.has(error.code));
}

function busy(path, cause) {
  return Object.assign(new Error('Process lock is already held'), { code: 'process_lock_busy', path, cause });
}

function openLock(path) {
  const database = new Database(path);
  database.pragma('busy_timeout = 0');
  try { database.exec('BEGIN IMMEDIATE'); }
  catch (error) {
    database.close();
    if (isSqliteBusy(error)) throw busy(path, error);
    throw error;
  }
  return database;
}

// SQLite owns cross-process exclusion with native OS file locks. The write
// transaction is released by the kernel when a process exits or crashes, so
// ownership does not depend on heartbeat timers, mtimes or stale leases.
export async function acquireProcessLock(path, {
  retries = 0,
  minTimeout = 100,
  maxTimeout = 250,
  factor = 1.2,
  signal,
} = {}) {
  let attempt = 0;
  for (;;) {
    signal?.throwIfAborted();
    try {
      const database = openLock(path);
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try { database.exec('ROLLBACK'); }
        finally { database.close(); }
      };
    } catch (error) {
      if (error.code !== 'process_lock_busy' || attempt >= retries) throw error;
      const delay = Math.min(maxTimeout, minTimeout * Math.pow(factor, attempt));
      attempt += 1;
      await sleep(delay, undefined, signal ? { signal } : undefined);
    }
  }
}

export async function processLockHeld(path) {
  let database;
  try {
    database = openLock(path);
    database.exec('ROLLBACK');
    database.close();
    return false;
  } catch (error) {
    database?.close();
    if (error.code === 'process_lock_busy') return true;
    throw error;
  }
}
