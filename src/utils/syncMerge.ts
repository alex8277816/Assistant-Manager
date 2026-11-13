export const SEED_BASE_TIMESTAMP = Date.UTC(2026, 0, 1, 8, 0, 0);

export interface SyncableRecord {
  id: string;
  updatedAt: number;
  syncStatus?: 'local' | 'pending' | 'synced';
}

export function isSeedRecordId(id: string): boolean {
  return id.startsWith('seed-') || id.startsWith('plugin-');
}

/**
 * Deterministic Last-Write-Wins merge for local + remote collections.
 * - Remote items with updatedAt >= local.updatedAt overwrite local and become 'synced'.
 * - Local items missing remotely or strictly newer than remote stay intact.
 */
export function mergeSyncedCollection<T extends SyncableRecord>(
  localItems: T[],
  remoteItems: T[]
): T[] {
  const map = new Map<string, T>();
  for (const local of localItems) {
    map.set(local.id, local);
  }
  for (const remote of remoteItems) {
    const local = map.get(remote.id);
    if (!local || remote.updatedAt >= local.updatedAt) {
      map.set(remote.id, { ...remote, syncStatus: 'synced' });
    }
  }
  return Array.from(map.values());
}

/**
 * Computes which local items must be pushed to Firestore so all platforms converge:
 * - Items not yet present remotely (unless remote already has items and this is an untouched seed item? No, if missing remotely and not synced, push it so first device populates cloud; if synced remotely previously and gone, still only push if local is pending/newer).
 * - Items whose local updatedAt > remote.updatedAt or marked 'pending'.
 */
export function findItemsNeedingPush<T extends SyncableRecord>(
  localItems: T[],
  remoteItems: T[]
): T[] {
  const remoteMap = new Map<string, T>();
  for (const r of remoteItems) {
    remoteMap.set(r.id, r);
  }

  const toPush: T[] = [];
  for (const local of localItems) {
    const remote = remoteMap.get(local.id);
    if (!remote) {
      // Only push seed items if the remote collection has never been populated yet,
      // or if the user explicitly modified the seed item locally (updatedAt > SEED_BASE_TIMESTAMP).
      const isUntouchedSeed =
        isSeedRecordId(local.id) && local.updatedAt <= SEED_BASE_TIMESTAMP;
      if (!isUntouchedSeed || remoteItems.length === 0) {
        toPush.push(local);
      }
      continue;
    }

    if (local.updatedAt > remote.updatedAt || (local.syncStatus === 'pending' && local.updatedAt >= remote.updatedAt)) {
      toPush.push(local);
    }
  }
  return toPush;
}
