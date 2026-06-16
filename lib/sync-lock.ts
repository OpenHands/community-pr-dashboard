import { randomUUID } from 'crypto';
import { config } from './config';
import { getSql } from './db';
import { secondsUntilNextSync as getSecondsUntilNextSync } from './sync-policy';

export const DASHBOARD_SYNC_KEY = 'github-dashboard';

type SyncStateRow = {
  last_successful_sync_at: string | null;
};

type LockRow = {
  lock_token: string;
  locked_until: string;
};

export type SyncLockResult =
  | { acquired: true; token: string }
  | { acquired: false; waitSeconds: number; reason: 'cooldown' | 'locked' };

export function secondsUntilNextSync(
  lastSuccessfulSyncAt: string | null | undefined,
  now = new Date(),
  cooldownSeconds = config.sync.cooldownSeconds
): number {
  return getSecondsUntilNextSync(lastSuccessfulSyncAt, now, cooldownSeconds);
}

export async function tryAcquireSyncLock(
  lockedBy: string,
  now = new Date()
): Promise<SyncLockResult> {
  const sql = getSql();
  const nowIso = now.toISOString();

  const stateRows = (await sql`
    SELECT last_successful_sync_at
    FROM dashboard_sync_state
    WHERE sync_key = ${DASHBOARD_SYNC_KEY}
  `) as unknown as SyncStateRow[];
  const waitSeconds = secondsUntilNextSync(stateRows[0]?.last_successful_sync_at, now);

  if (waitSeconds > 0) {
    return { acquired: false, waitSeconds, reason: 'cooldown' };
  }

  const token = randomUUID();
  const lockedUntil = new Date(
    now.getTime() + config.sync.lockTimeoutSeconds * 1000
  ).toISOString();

  const lockRows = (await sql`
    INSERT INTO dashboard_sync_locks (lock_key, lock_token, locked_until, locked_by, updated_at)
    VALUES (${DASHBOARD_SYNC_KEY}, ${token}, ${lockedUntil}, ${lockedBy}, ${nowIso})
    ON CONFLICT (lock_key) DO UPDATE
    SET lock_token = EXCLUDED.lock_token,
        locked_until = EXCLUDED.locked_until,
        locked_by = EXCLUDED.locked_by,
        updated_at = EXCLUDED.updated_at
    WHERE dashboard_sync_locks.locked_until <= ${nowIso}
    RETURNING lock_token, locked_until
  `) as unknown as LockRow[];

  if (lockRows.length > 0) {
    return { acquired: true, token: lockRows[0].lock_token };
  }

  const existingLockRows = (await sql`
    SELECT lock_token, locked_until
    FROM dashboard_sync_locks
    WHERE lock_key = ${DASHBOARD_SYNC_KEY}
  `) as unknown as LockRow[];
  const lockedUntilTime = new Date(existingLockRows[0]?.locked_until ?? nowIso).getTime();
  const lockWaitSeconds = Number.isNaN(lockedUntilTime)
    ? config.sync.lockTimeoutSeconds
    : Math.max(1, Math.ceil((lockedUntilTime - now.getTime()) / 1000));

  return { acquired: false, waitSeconds: lockWaitSeconds, reason: 'locked' };
}

export async function releaseSyncLock(token: string): Promise<void> {
  const sql = getSql();

  await sql`
    DELETE FROM dashboard_sync_locks
    WHERE lock_key = ${DASHBOARD_SYNC_KEY}
      AND lock_token = ${token}
  `;
}
