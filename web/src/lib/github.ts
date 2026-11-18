import 'server-only';
import { createSign } from 'node:crypto';
import { env } from './env';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(public status: number, path: string) {
    super(`GitHub ${path}: ${status}`);
  }
}

async function gh<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new GitHubError(r.status, path);
  return r.json() as Promise<T>;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** GitHub App 자체 인증용 JWT (RS256, 최대 10분) */
function appJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.githubAppClientId }))}`;
  return `${body}.${createSign('RSA-SHA256').update(body).sign(env.githubAppPrivateKey, 'base64url')}`;
}

/** 설치(installation) 단위 토큰. 협업자 조회에 쓴다. 1시간 유효 */
export async function installationToken(installationId: number): Promise<string> {
  const r = await gh<{ token: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(), { method: 'POST' });
  return r.token;
}

export type Repo = { id: number; full_name: string; private: boolean; installation_id: number };

/** 로그인한 사람이 접근할 수 있고 App이 설치된 저장소 (사용자 토큰 필요) */
export async function userRepos(userToken: string): Promise<Repo[]> {
  // shortcut: 설치·저장소를 각각 첫 100개까지만 본다. 팀 프로젝트 규모를 넘으면 페이지네이션을 넣는다.
  const { installations } = await gh<{ installations: { id: number }[] }>('/user/installations?per_page=100', userToken);
  const lists = await Promise.all(
    installations.map(async ({ id }) => {
      const { repositories } = await gh<{ repositories: Omit<Repo, 'installation_id'>[] }>(`/user/installations/${id}/repositories?per_page=100`, userToken);
      return repositories.map((r) => ({ id: r.id, full_name: r.full_name, private: r.private, installation_id: id }));
    }),
  );
  return lists.flat().sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export type Collaborator = { id: number; login: string; avatar_url: string };

/** 저장소 협업자 전체 (installation 토큰 필요) */
export async function collaborators(installToken: string, fullName: string): Promise<Collaborator[]> {
  const all: Collaborator[] = [];
  for (let page = 1; ; page++) {
    const list = await gh<Collaborator[]>(`/repos/${fullName}/collaborators?affiliation=all&per_page=100&page=${page}`, installToken);
    all.push(...list.map(({ id, login, avatar_url }) => ({ id, login, avatar_url })));
    if (list.length < 100) return all;
  }
}

export const installUrl = () => `https://github.com/apps/${env.githubAppSlug}/installations/new`;

// ---------------------------------------------------------------------------
// M9 GitHub Projects 연결 (읽기 전용). 동기화 자체는 mcp-server/src/sync.ts가 한다
// ---------------------------------------------------------------------------
export type ProjectRef = { ownerType: 'org' | 'user'; owner: string; number: number };

/** https://github.com/orgs/<org>/projects/<n> 또는 /users/<login>/projects/<n> */
export function parseProjectUrl(url: string): ProjectRef | null {
  const m = url.trim().match(/^https:\/\/github\.com\/(orgs|users)\/([A-Za-z0-9-]{1,39})\/projects\/(\d{1,9})(?:\/.*)?$/);
  return m ? { ownerType: m[1] === 'orgs' ? 'org' : 'user', owner: m[2], number: Number(m[3]) } : null;
}

/** 조직에 설치된 이 App의 installation id. 설치 안 됐으면 null */
export async function orgInstallationId(org: string): Promise<number | null> {
  try {
    return (await gh<{ id: number }>(`/orgs/${org}/installation`, appJwt())).id;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
}

export type PatInfo = { login: string; scopes: string[]; expiresAt: string | null };

/** classic PAT 검사: 주인, scope(x-oauth-scopes), 만료일. 무효면 null. 토큰 원문은 어디에도 남기지 않는다 */
export async function patInfo(pat: string): Promise<PatInfo | null> {
  const r = await fetch(`${API}/user`, { cache: 'no-store', headers: { authorization: `Bearer ${pat}`, accept: 'application/vnd.github+json' } });
  if (r.status === 401) return null;
  if (!r.ok) throw new GitHubError(r.status, '/user');
  const scopes = (r.headers.get('x-oauth-scopes') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // 예: "2026-12-31 00:00:00 UTC". 만료 없음이면 헤더가 없다
  const exp = r.headers.get('github-authentication-token-expiration');
  const expiresAt = exp ? new Date(exp.replace(' UTC', 'Z').replace(' ', 'T')).toISOString() : null;
  return { login: ((await r.json()) as { login: string }).login, scopes, expiresAt };
}

/** 프로젝트의 Status(열) 필드 옵션 이름. 읽을 수 없으면 사유와 함께 throw */
export async function projectColumns(token: string, ref: ProjectRef, statusField: string, partField: string): Promise<{ title: string; columns: string[]; parts: string[] | null }> {
  const query = `query($owner: String!, $number: Int!, $f: String!, $p: String!) {
    owner: ${ref.ownerType === 'org' ? 'organization' : 'user'}(login: $owner) {
      projectV2(number: $number) {
        title
        field(name: $f) { ... on ProjectV2SingleSelectField { options { name } } }
        part: field(name: $p) { ... on ProjectV2SingleSelectField { options { name } } }
      }
    }
  }`;
  const r = await fetch(`${API}/graphql`, {
    method: 'POST', cache: 'no-store',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { owner: ref.owner, number: ref.number, f: statusField, p: partField } }),
  });
  if (!r.ok) throw new GitHubError(r.status, '/graphql');
  type Field = { options?: { name: string }[] } | null;
  const body = (await r.json()) as { data?: { owner: { projectV2: { title: string; field: Field; part: Field } | null } | null } };
  const p = body.data?.owner?.projectV2;
  if (!p) throw new Error('프로젝트를 읽을 수 없습니다. URL과 접근 권한을 확인하세요.');
  if (!p.field?.options) throw new Error(`프로젝트에 단일 선택 "${statusField}" 필드가 없습니다.`);
  return { title: p.title, columns: p.field.options.map((o) => o.name), parts: p.part?.options?.map((o) => o.name) ?? null };
}
