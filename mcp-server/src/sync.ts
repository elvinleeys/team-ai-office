// F17 GitHub Projects(칸반) 동기화: 방에 연결된 프로젝트 카드를 github_cards로 맞춘다. 최종 상태는 effective_statuses 뷰가 계산한다.
// 단방향(GitHub → 대시보드). 실패하면 기존 카드를 지우지 않고 rooms.github_sync_error에 기록만 한다.
import { createSign } from 'node:crypto';
import { db, check, must } from './db.ts';
import { decryptSecret } from './secret.ts';

export type CardState = 'idle' | 'progress' | 'review' | 'done';
export type Part = 'dev' | 'design' | 'plan';
export type GithubConfig = { statusField: string; partField: string; columns: Record<string, CardState>; parts: Record<string, Part> };

type Login = { login: string };
export type ProjectItem = {
  id: string; updatedAt: string; isArchived: boolean;
  status: { name: string; updatedAt: string } | null;
  part: { name: string } | null;
  content: { __typename: string; title?: string; number?: number; url?: string; assignees?: { nodes: Login[] } } | null;
};
export type CardRow = {
  room_id: string; item_id: string; member_id: string; column_name: string; state: CardState;
  title: string; url: string | null; number: number | null; is_draft: boolean; part: Part | null;
  item_updated_at: string; moved_at: string;
};

/** 사용자에게 보여줘도 되는 동기화 실패 (토큰 원문을 담지 않는다) */
export class SyncError extends Error {}

const norm = (s: string) => s.trim().toLowerCase();
/** 대소문자·앞뒤 공백 무시로 매핑 표를 찾는다 (GitHub 열 이름은 그대로 저장하고 비교만 느슨하게) */
const lookup = <V>(table: Record<string, V>, name: string | undefined): V | undefined =>
  name === undefined ? undefined : Object.entries(table).find(([k]) => norm(k) === norm(name))?.[1];

/** 프로젝트 항목 → 카드 행 (담당자마다 1행). 담당자가 방 조원이 아니거나 없으면 버린다 */
export function mapItems(roomId: string, items: ProjectItem[], config: GithubConfig, memberByLogin: Map<string, string>): CardRow[] {
  const rows: CardRow[] = [];
  for (const it of items) {
    if (it.isArchived || !it.content) continue;
    const draft = it.content.__typename === 'DraftIssue';
    const column = it.status?.name ?? '';
    const base = {
      room_id: roomId, item_id: it.id, column_name: column,
      state: lookup(config.columns, column) ?? 'idle',  // 매핑에 없는 열(또는 Status 없음) = 대기
      title: it.content.title ?? '', url: draft ? null : (it.content.url ?? null), number: draft ? null : (it.content.number ?? null),
      is_draft: draft, part: lookup(config.parts, it.part?.name) ?? null,
      item_updated_at: it.updatedAt, moved_at: it.status?.updatedAt ?? it.updatedAt,
    };
    for (const { login } of it.content.assignees?.nodes ?? []) {
      const member_id = memberByLogin.get(login.toLowerCase());
      if (member_id) rows.push({ ...base, member_id });
    }
  }
  return rows;
}

const ITEMS_QUERY = (ownerField: 'organization' | 'user') => `
query($owner: String!, $number: Int!, $after: String, $statusField: String!, $partField: String!) {
  owner: ${ownerField}(login: $owner) {
    projectV2(number: $number) {
      field(name: $statusField) { __typename }
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id updatedAt isArchived
          status: fieldValueByName(name: $statusField) { ... on ProjectV2ItemFieldSingleSelectValue { name updatedAt } }
          part: fieldValueByName(name: $partField) { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          content {
            __typename
            ... on DraftIssue { title assignees(first: 10) { nodes { login } } }
            ... on Issue { title number url assignees(first: 10) { nodes { login } } }
            ... on PullRequest { title number url assignees(first: 10) { nodes { login } } }
          }
        }
      }
    }
  }
}`;

export type Fetcher = typeof fetch;
export type ProjectRef = { ownerType: 'org' | 'user'; owner: string; number: number };

/** 프로젝트 항목 전체 (100개씩 페이지). 열 이동 시각은 Status 필드 값의 updatedAt */
export async function fetchProjectItems(token: string, ref: ProjectRef, config: GithubConfig, fetcher: Fetcher = fetch): Promise<ProjectItem[]> {
  const items: ProjectItem[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page++) {
    const res = await fetcher('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: ITEMS_QUERY(ref.ownerType === 'org' ? 'organization' : 'user'),
        variables: { owner: ref.owner, number: ref.number, after, statusField: config.statusField, partField: config.partField },
      }),
    });
    if (res.status === 401) {
      throw new SyncError(ref.ownerType === 'user'
        ? 'PAT가 만료되었거나 폐기되었습니다. 방장이 웹에서 PAT를 다시 등록하세요.'
        : 'GitHub App 인증에 실패했습니다.');
    }
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') throw new SyncError('GitHub API 사용 한도에 걸렸습니다. 잠시 후 다시 시도합니다.');
    if (!res.ok) throw new SyncError(`GitHub API 오류 HTTP ${res.status}`);
    const body = (await res.json()) as {
      data?: { owner: { projectV2: { field: unknown; items: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProjectItem[] } } | null } | null };
      errors?: { type?: string; message: string }[];
    };
    const project = body.data?.owner?.projectV2;
    if (!project) {
      const why = body.errors?.find((e) => e.type === 'INSUFFICIENT_SCOPES') ? 'PAT에 read:project 권한이 없습니다'
        : ref.ownerType === 'org' ? 'App에 Organization "Projects: read" 권한이 없거나 설치 승인이 필요합니다'
        : 'PAT 주인이 이 프로젝트를 볼 수 없습니다';
      throw new SyncError(`프로젝트 ${ref.owner}/${ref.number}를 읽을 수 없습니다 (${why}).`);
    }
    if (!project.field) throw new SyncError(`프로젝트에 "${config.statusField}" 필드가 없습니다. 방 설정의 열 매핑을 확인하세요.`);
    items.push(...project.items.nodes);
    if (!project.items.pageInfo.hasNextPage) return items;
    after = project.items.pageInfo.endCursor;
  }
  throw new SyncError('프로젝트 항목이 5,000개를 넘습니다.');
}

/** GitHub App JWT → 설치 토큰 (org 프로젝트용, 1시간 유효) */
async function installationToken(installationId: number, fetcher: Fetcher): Promise<string> {
  const id = process.env.GITHUB_APP_CLIENT_ID, pem = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!id || !pem) throw new SyncError('서버에 GITHUB_APP_CLIENT_ID·GITHUB_APP_PRIVATE_KEY가 설정되지 않았습니다.');
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iat: now - 60, exp: now + 540, iss: id }))}`;
  const jwt = `${body}.${createSign('RSA-SHA256').update(body).sign(pem, 'base64url')}`;
  const r = await fetcher(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST', headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new SyncError(`App 설치 토큰 발급 실패 HTTP ${r.status} (App이 그 조직에 설치돼 있는지 확인)`);
  return ((await r.json()) as { token: string }).token;
}

const LOG_STATUS: Record<CardState, 'coding' | 'done' | 'idle'> = { progress: 'coding', review: 'coding', done: 'done', idle: 'idle' };

/** 방 하나 동기화. 실패해도 기존 카드는 그대로 두고 실패만 기록한다 */
export async function syncRoomProject(roomId: string, fetcher: Fetcher = fetch): Promise<{ ok: boolean; cards?: number; error?: string }> {
  const room = must(await db.from('rooms')
    .select('project_owner_type, project_owner, project_number, project_installation_id, github_config').eq('id', roomId).single());
  try {
    if (!room.project_owner_type || !room.project_owner || !room.project_number) throw new SyncError('연결된 프로젝트가 없습니다.');
    const config = room.github_config as unknown as GithubConfig;
    let token: string;
    if (room.project_owner_type === 'user') {
      const secret = (await db.from('room_secrets').select('github_pat_enc').eq('room_id', roomId).maybeSingle()).data;
      if (!secret) throw new SyncError('개인 프로젝트는 방장이 PAT를 등록해야 합니다.');
      try { token = decryptSecret(secret.github_pat_enc, roomId); } catch { throw new SyncError('저장된 PAT를 복호화하지 못했습니다. 방장이 다시 등록하세요.'); }
    } else {
      if (!room.project_installation_id) throw new SyncError('조직에 GitHub App이 설치되지 않았습니다.');
      token = await installationToken(room.project_installation_id, fetcher);
    }
    const items = await fetchProjectItems(token, { ownerType: room.project_owner_type as 'org' | 'user', owner: room.project_owner, number: room.project_number }, config, fetcher);

    const members = must(await db.from('room_members').select('member_id, members(github_login)').eq('room_id', roomId).eq('active', true)) as unknown as
      { member_id: string; members: { github_login: string } }[];
    const rows = mapItems(roomId, items, config, new Map(members.map((m) => [m.members.github_login.toLowerCase(), m.member_id])));

    const before = must(await db.from('github_cards').select('item_id, member_id, state').eq('room_id', roomId));
    const key = (r: { item_id: string; member_id: string }) => `${r.item_id}|${r.member_id}`;
    const prev = new Map(before.map((r) => [key(r), r.state]));
    const next = new Set(rows.map(key));

    if (rows.length) check(await db.from('github_cards').upsert(rows));
    for (const r of before) if (!next.has(key(r))) check(await db.from('github_cards').delete().eq('room_id', roomId).eq('item_id', r.item_id).eq('member_id', r.member_id));
    // 이력: 열이 바뀐 카드만 남긴다. 처음 연결한 방은 기존 카드 전부가 "새 카드"라 남기지 않는다
    const moved = before.length === 0 ? [] : rows.filter((r) => prev.get(key(r)) !== r.state && (prev.has(key(r)) || r.state !== 'idle'));
    if (moved.length) {
      check(await db.from('logs').insert(moved.map((r) => ({
        room_id: roomId, member_id: r.member_id, status: LOG_STATUS[r.state], source: 'github' as const,
        task: `${r.state === 'review' ? '[검토 중] ' : ''}${r.title} (${r.column_name || '열 없음'})`,
      }))));
    }
    check(await db.from('rooms').update({ github_synced_at: new Date().toISOString(), github_sync_error: null, github_sync_failed_at: null }).eq('id', roomId));
    return { ok: true, cards: rows.length };
  } catch (e) {
    const msg = e instanceof SyncError ? e.message : '동기화 중 서버 오류가 발생했습니다.';
    if (!(e instanceof SyncError)) console.error('[sync]', roomId, e);
    check(await db.from('rooms').update({ github_sync_error: msg, github_sync_failed_at: new Date().toISOString() }).eq('id', roomId));
    return { ok: false, error: msg };
  }
}

/** 프로젝트가 연결된 모든 방을 주기적으로 동기화한다. 이전 회차가 안 끝났으면 건너뛴다 */
export function startSyncLoop(seconds: number) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const rooms = must(await db.from('rooms').select('id').not('project_owner', 'is', null));
      for (const r of rooms) await syncRoomProject(r.id);
    } catch (e) {
      console.error('[sync]', e);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, seconds * 1000);
}
