/** Tiny GitHub REST client for the Action. Uses global fetch; no dependencies. */
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';

export function repo() {
  const [owner, name] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  if (!owner || !name) throw new Error('GITHUB_REPOSITORY is not set');
  return { owner, name };
}

export async function gh(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub API ${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
