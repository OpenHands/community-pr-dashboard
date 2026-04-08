export function isBotLogin(login?: string | null): boolean {
  if (!login) return false;

  const normalizedLogin = login.toLowerCase();

  return normalizedLogin.includes('[bot]')
    || normalizedLogin.endsWith('-bot')
    || normalizedLogin.endsWith('_bot')
    || normalizedLogin === 'dependabot';
}
