'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GH_TOKEN_COOKIE, LOGIN_NEXT_COOKIE, requireMe } from '@/lib/auth';
import { env } from '@/lib/env';
import { collaborators, GitHubError, installationToken, orgInstallationId, parseProjectUrl, patInfo, projectColumns, userRepos } from '@/lib/github';
import { decryptSecret, encryptSecret } from '@/lib/secret';
import { syncRoom } from '@/lib/rooms';
import { check, maybe, must, supabaseAdmin, supabaseUser } from '@/lib/supabase/server';

// 모든 액션은 클라이언트를 믿지 않고 여기서 다시 로그인·권한을 확인한다.

const safePath = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : null);

export async function signIn(formData?: FormData) {
  const next = safePath(formData?.get('next'));
  if (next) (await cookies()).set(LOGIN_NEXT_COOKIE, next, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600, secure: env.siteUrl.startsWith('https') });
  const { data, error } = await (await supabaseUser()).auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${env.siteUrl}/auth/callback` },
  });
  if (error || !data.url) throw error ?? new Error('로그인 URL을 만들지 못했습니다.');
  redirect(data.url);
}

/** 로그아웃. next가 있으면 그 경로로 (MCP 허용 화면의 '다른 계정') */
export async function signOut(formData?: FormData) {
  await (await supabaseUser()).auth.signOut();
  (await cookies()).delete(GH_TOKEN_COOKIE);
  redirect(safePath(formData?.get('next')) ?? '/');
}

function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

/** 저장소를 골라 방을 만든다. 이미 있는 방이면 동기화 후 그 방으로 간다. */
export async function createRoom(formData: FormData) {
  const me = await requireMe();
  const repoId = Number(formData.get('repo_id'));
  const ghToken = (await cookies()).get(GH_TOKEN_COOKIE)?.value;
  if (!ghToken) fail('/rooms/new', 'GitHub 인증이 만료되었습니다. 다시 로그인하세요.');

  // 폼 값을 믿지 않고, 이 사람이 실제로 접근할 수 있는 저장소인지 GitHub에 다시 묻는다
  let repos;
  try {
    repos = await userRepos(ghToken);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 401) fail('/rooms/new', 'GitHub 인증이 만료되었습니다. 다시 로그인하세요.');
    throw e;
  }
  const repo = repos.find((r) => r.id === repoId);
  if (!repo) fail('/rooms/new', '접근할 수 없는 저장소입니다.');

  const db = supabaseAdmin();
  const existing = maybe(await db.from('rooms').select('id').eq('github_repo_id', repo.id).maybeSingle());
  const roomId = existing
    ? (check(await db.from('rooms').update({ full_name: repo.full_name, installation_id: repo.installation_id }).eq('id', existing.id)), existing.id)
    : must(
        await db.from('rooms')
          .insert({ github_repo_id: repo.id, full_name: repo.full_name, installation_id: repo.installation_id, created_by: me.id })
          .select('id').single(),
      ).id;

  await syncRoom(roomId);

  const mine = maybe(await db.from('room_members').select('active').eq('room_id', roomId).eq('member_id', me.id).maybeSingle());
  if (!mine?.active) fail('/rooms/new', `${repo.full_name}의 협업자 목록에 내 계정이 없습니다.`);
  redirect(`/rooms/${roomId}`);
}

/** 방 만들기 화면: 고른 저장소의 협업자 수·미리보기 (2026-11-18 사용자 결정: 고른 저장소만 조회). 내가 접근할 수 있는 저장소인지 다시 확인한다 */
export async function previewRepo(repoId: number): Promise<{ count?: number; people?: { login: string; avatar_url: string }[]; error?: string }> {
  await requireMe();
  const ghToken = (await cookies()).get(GH_TOKEN_COOKIE)?.value;
  if (!ghToken) return { error: 'GitHub 인증이 만료되었어요. 다시 로그인하세요.' };
  try {
    const repo = (await userRepos(ghToken)).find((r) => r.id === repoId);
    if (!repo) return { error: '접근할 수 없는 저장소예요.' };
    const list = await collaborators(await installationToken(repo.installation_id), repo.full_name);
    return { count: list.length, people: list.slice(0, 3).map(({ login, avatar_url }) => ({ login, avatar_url })) };
  } catch (e) {
    if (e instanceof GitHubError) return { error: `협업자를 불러오지 못했어요 (GitHub ${e.status}).` };
    throw e;
  }
}

/** 방 협업자 다시 동기화. 그 방의 active 조원만 할 수 있다. */
export async function refreshRoom(roomId: string) {
  const me = await requireMe();
  const mine = maybe(await supabaseAdmin().from('room_members').select('active').eq('room_id', roomId).eq('member_id', me.id).maybeSingle());
  if (!mine?.active) redirect('/');
  await syncRoom(roomId);
  redirect(`/rooms/${roomId}`);
}

// ---------------------------------------------------------------------------
// MCP 로그인 (Supabase OAuth 2.1 서버). Claude Code·로컬 수집기가 연 동의 화면에서 승인·거부하고, 첫 화면에서 연결을 해제한다.
// 토큰은 Supabase가 발급·보관한다. 이 앱은 토큰을 만들거나 보지 않는다.
// ---------------------------------------------------------------------------
/** 승인·거부 후 요청한 클라이언트(Claude Code 등)의 로컬 콜백 주소를 돌려준다. 화면이 숨은 프레임으로 전달하고 결과 화면을 보여준다 */
async function decideOAuth(authorizationId: string, approve: boolean): Promise<{ url?: string; error?: string }> {
  await requireMe(); // 조원(members)으로 연결된 로그인 사용자만 승인할 수 있다
  const oauth = (await supabaseUser()).auth.oauth;
  const { data, error } = approve
    ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data) return { error: `연결 요청을 처리하지 못했어요: ${error?.message ?? '응답 없음'}` };
  return { url: data.redirect_url };
}
export async function approveMcp(authorizationId: string) { return decideOAuth(authorizationId, true); }
export async function denyMcp(authorizationId: string) { return decideOAuth(authorizationId, false); }

/** 연결 해제: 그 클라이언트의 세션·갱신 토큰이 폐기되어 MCP 서버가 바로 거부한다 */
export async function revokeMcp(clientId: string) {
  await requireMe();
  const { error } = await (await supabaseUser()).auth.oauth.revokeGrant({ clientId });
  if (error) fail('/', `연결 해제 실패: ${error.message}`);
  redirect('/');
}

// ---------------------------------------------------------------------------
// M9: 직접 선택(F18)·상태 출처(F16)·캐릭터 카드·파트(F19)·칸반 연결(F17)
// 웹의 쓰기는 여기(서버)에서 secret 키로만 한다. 브라우저는 여전히 읽기 전용이다 (PRD 7장 규칙 변경 근거)
// ---------------------------------------------------------------------------
const STATUSES = ['coding', 'meeting', 'break', 'done'] as const;
const PART_IDS = ['dev', 'design', 'plan'] as const;
const AVATAR_IDS = ['nyang', 'sprout', 'ppi', 'mong'] as const;
const CARD_STATES = ['idle', 'progress', 'review', 'done'] as const;
const pick = <T extends string>(list: readonly T[], v: FormDataEntryValue | null): T | null =>
  (list as readonly string[]).includes(String(v)) ? (v as T) : null;

/** 로그인 + 이 방의 active 조원인지 다시 확인한다 */
async function roomMe(roomId: string) {
  const me = await requireMe();
  const mine = maybe(await supabaseAdmin().from('room_members').select('active').eq('room_id', roomId).eq('member_id', me.id).maybeSingle());
  if (!mine?.active) redirect('/');
  return me;
}

/** 방장(방을 만든 사람)만 */
async function roomOwner(roomId: string) {
  const me = await roomMe(roomId);
  const room = must(await supabaseAdmin().from('rooms').select('created_by, github_config').eq('id', roomId).single());
  if (room.created_by !== me.id) fail(`/rooms/${roomId}`, '방장만 방 설정을 바꿀 수 있습니다.');
  return { me, room };
}

/** 방 설정 화면으로 돌아가며 안내 문구를 띄운다 */
function back(roomId: string, notice?: string): never {
  redirect(`/rooms/${roomId}/settings${notice ? `?notice=${encodeURIComponent(notice)}` : ''}`);
}

// 상태 변경은 방 화면(HistoryPanel)에서 바로 부르고 결과만 돌려준다. 화면은 다시 폴링해 반영한다
export async function setMyStatus(roomId: string, formData: FormData): Promise<{ error?: string }> {
  const me = await roomMe(roomId);
  const status = pick(STATUSES, formData.get('status'));
  const mode = pick(['timed', 'pinned'] as const, formData.get('mode'));
  const task = String(formData.get('task') ?? '').trim().slice(0, 200);
  if (!status || !mode) return { error: '상태와 해제 방식을 고르세요.' };
  must(await supabaseAdmin().rpc('set_status', { p_room: roomId, p_member: me.id, p_status: status, p_task: task, p_mode: mode }));
  return {};
}

export async function releaseMyStatus(roomId: string): Promise<{ error?: string }> {
  const me = await roomMe(roomId);
  const released = must(await supabaseAdmin().rpc('release_status', { p_room: roomId, p_member: me.id }));
  return released ? {} : { error: '해제할 직접 선택이 없습니다.' };
}

export async function setStatusSource(roomId: string, formData: FormData): Promise<{ error?: string }> {
  const me = await roomMe(roomId);
  const source = pick(['github', 'manual'] as const, formData.get('source'));
  if (!source) return { error: '상태 출처를 고르세요.' };
  check(await supabaseAdmin().from('room_members').update({ status_source: source }).eq('room_id', roomId).eq('member_id', me.id));
  return {};
}

/** 처음 들어올 때 캐릭터 카드 + 파트 선택 (둘 다 필수, 나중에 변경 가능) */
export async function chooseCharacter(roomId: string, formData: FormData) {
  const me = await roomMe(roomId);
  const avatar = pick(AVATAR_IDS, formData.get('avatar'));
  const part = pick(PART_IDS, formData.get('part'));
  if (!avatar || !part) fail(`/rooms/${roomId}/character`, '캐릭터와 파트를 모두 골라주세요.');
  check(await supabaseAdmin().from('room_members').update({ avatar, part }).eq('room_id', roomId).eq('member_id', me.id));
  redirect(`/rooms/${roomId}`);
}

type GithubConfig = { statusField: string; partField: string; columns: Record<string, string>; parts: Record<string, string>; partOptions?: string[] | null; projectTitle?: string };
const DEFAULT_STATE: Record<string, (typeof CARD_STATES)[number]> = { 'in progress': 'progress', 'in review': 'review', done: 'done' };

/** 프로젝트 연결 (방장). org는 App 설치 토큰, user는 classic PAT(read:project만)로 Status 열을 읽어 열 매핑을 만든다 */
export async function linkProject(roomId: string, formData: FormData) {
  const { me, room } = await roomOwner(roomId);
  const path = `/rooms/${roomId}/settings`;
  const ref = parseProjectUrl(String(formData.get('url') ?? ''));
  if (!ref) fail(path, '프로젝트 URL 형식: https://github.com/orgs/<조직>/projects/<번호> 또는 https://github.com/users/<계정>/projects/<번호>');
  const config = room.github_config as unknown as GithubConfig;
  const db = supabaseAdmin();
  const pat = String(formData.get('pat') ?? '').trim();

  let token: string;
  let installationId: number | null = null;
  let secret: { enc: string; login: string; expiresAt: string | null; last4: string } | null = null;
  if (ref.ownerType === 'org') {
    installationId = await orgInstallationId(ref.owner);
    if (!installationId) fail(path, `${ref.owner} 조직에 GitHub App이 설치되지 않았습니다. 조직 관리자가 App을 설치하고 Projects 읽기 권한을 승인해야 합니다.`);
    token = await installationToken(installationId);
  } else if (!pat) {
    // 이미 등록된 PAT가 있으면 그대로 쓴다 (프로젝트만 바꾸는 경우)
    const saved = maybe(await db.from('room_secrets').select('github_pat_enc').eq('room_id', roomId).maybeSingle());
    if (!saved) fail(path, '개인 계정 프로젝트는 classic PAT(read:project)가 필요합니다.');
    token = decryptSecret(saved.github_pat_enc, roomId);
  } else {
    const info = await patInfo(pat);
    if (!info) fail(path, 'PAT가 유효하지 않습니다 (만료·폐기 또는 오타).');
    // 유출 피해를 줄이기 위해 read:project 하나만 허용한다
    if (info.scopes.length !== 1 || info.scopes[0] !== 'read:project') {
      fail(path, `PAT 권한은 read:project 하나만 체크하세요. 현재: ${info.scopes.join(', ') || '(없음 — fine-grained PAT는 개인 프로젝트를 읽지 못합니다)'}`);
    }
    token = pat;
    secret = { enc: encryptSecret(pat, roomId), login: info.login, expiresAt: info.expiresAt, last4: pat.slice(-4) };
  }

  let project: { title: string; columns: string[]; parts: string[] | null };
  try {
    project = await projectColumns(token, ref, config.statusField, config.partField);
  } catch (e) {
    fail(path, e instanceof Error ? e.message : '프로젝트를 읽지 못했습니다.');
  }
  // 기존 매핑은 유지하고, 새 열은 이름으로 기본값(In progress/In review/Done)을 정한다. 나머지는 대기
  const old = new Map(Object.entries(config.columns).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const key = (c: string) => c.trim().toLowerCase();
  const columns = Object.fromEntries(project.columns.map((c) => [c, old.get(key(c)) ?? DEFAULT_STATE[key(c)] ?? 'idle']));

  if (secret) {
    check(await db.from('room_secrets').upsert({
      room_id: roomId, github_pat_enc: secret.enc, pat_login: secret.login, pat_expires_at: secret.expiresAt, pat_last4: secret.last4, set_by: me.id, set_at: new Date().toISOString(),
    }));
  }
  check(await db.from('rooms').update({
    project_owner_type: ref.ownerType, project_owner: ref.owner, project_number: ref.number, project_installation_id: installationId,
    github_config: { ...config, columns, partOptions: project.parts, projectTitle: project.title }, github_sync_error: null, github_sync_failed_at: null,
  }).eq('id', roomId));
  const noDone = !Object.values(columns).includes('done');
  back(roomId, `"${project.title}" 연결됨 (열 ${project.columns.length}개). 1분 안에 동기화됩니다.${noDone ? ' 주의: 완료(Done)로 매핑된 열이 없습니다.' : ''}`);
}

export async function saveColumnMap(roomId: string, formData: FormData) {
  const { room } = await roomOwner(roomId);
  const config = room.github_config as unknown as GithubConfig;
  const columns = Object.fromEntries(Object.keys(config.columns).map((c) => [c, pick(CARD_STATES, formData.get(`col:${c}`)) ?? config.columns[c]]));
  check(await supabaseAdmin().from('rooms').update({ github_config: { ...config, columns } }).eq('id', roomId));
  back(roomId, '열 매핑을 저장했습니다. 다음 동기화부터 적용됩니다.');
}

/** 칸반 연결 해제: PAT·카드를 지운다 (상태 출처가 github인 조원은 직접 선택 값만 남는다) */
export async function unlinkProject(roomId: string) {
  await roomOwner(roomId);
  const db = supabaseAdmin();
  check(await db.from('room_secrets').delete().eq('room_id', roomId));
  check(await db.from('github_cards').delete().eq('room_id', roomId));
  check(await db.from('rooms').update({
    project_owner_type: null, project_owner: null, project_number: null, project_installation_id: null,
    github_synced_at: null, github_sync_error: null, github_sync_failed_at: null,
  }).eq('id', roomId));
  back(roomId, '칸반 연결을 해제했습니다.');
}

/** 개인 프로젝트 PAT 삭제 (방장). 다음 동기화부터 "PAT 필요"로 실패 표시된다 */
export async function removeProjectPat(roomId: string) {
  await roomOwner(roomId);
  check(await supabaseAdmin().from('room_secrets').delete().eq('room_id', roomId));
  back(roomId, 'PAT를 삭제했습니다.');
}
