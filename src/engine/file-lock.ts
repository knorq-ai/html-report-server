/**
 * Per-file promise chain lock for serializing write operations.
 *
 * Read-only functions skip locking. Only write functions wrap with withFileLock.
 */

import * as path from "path";

const locks = new Map<string, Promise<void>>();

/**
 * Serialize write operations to the same file path.
 * Operations on different files run in parallel.
 * The lock is released correctly even if an exception is thrown.
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(filePath);
  const prev = locks.get(key) ?? Promise.resolve();

  let resolve!: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(key, next);

  await prev;
  try {
    return await fn();
  } finally {
    resolve();
    // GC: clean up if this is the last pending operation
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  }
}
