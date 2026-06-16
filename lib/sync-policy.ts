export function secondsUntilNextSync(
  lastSuccessfulSyncAt: string | null | undefined,
  now = new Date(),
  cooldownSeconds = 300
): number {
  if (!lastSuccessfulSyncAt) {
    return 0;
  }

  const lastSyncTime = new Date(lastSuccessfulSyncAt).getTime();
  if (Number.isNaN(lastSyncTime)) {
    return 0;
  }

  const nextAllowedAt = lastSyncTime + cooldownSeconds * 1000;
  return Math.max(0, Math.ceil((nextAllowedAt - now.getTime()) / 1000));
}
