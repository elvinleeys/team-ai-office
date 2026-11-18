// M2·M9 e2e: 실제 Supabase에 테스트 데이터를 만들고, MCP 클라이언트로 8개 tool과 인증·권한 실패,
// 직접 선택·칸반 우선순위(effective_statuses), 칸반 동기화(가짜 GitHub 응답)를 검사한 뒤 지운다.
//   npm test
//   E2E_CLAUDE=1 npm test   # 추가로 Claude Code(claude -p)가 실제로 tool을 호출하는지 검사
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { db, must, check } from '../src/db.ts';
import { createHttpServer } from '../src/server.ts';
import { sessionFor } from './session.ts';
import { decryptSecret, encryptSecret } from '../src/secret.ts';
import { syncRoomProject, type ProjectItem } from '../src/sync.ts';

// 실제 GitHub id와 겹치지 않을 큰 값
const GH = { a: 9_000_000_001, b: 9_000_000_002, c: 9_000_000_003 };
const REPO1 = 'e2e_owner/sandbox_repo'; // _ 포함: LIKE 이스케이프 검사
const REPO2 = 'e2e-other/x';

async function cleanup() {
  check(await db.from('rooms').delete().in('github_repo_id', [9_000_000_101, 9_000_000_102]));
  const users = must(await db.from('members').select('auth_user_id').in('github_id', Object.values(GH)));
  check(await db.from('members').delete().in('github_id', Object.values(GH)));
  for (const u of users) if (u.auth_user_id) await db.auth.admin.deleteUser(u.auth_user_id);
}

/** 로그인 사용자 (auth.users). 메일 주소는 실행마다 달라 이전 실행 잔여물과 겹치지 않는다 */
async function authUser(name: string) {
  const email = `e2e-${name}-${Date.now()}@example.invalid`;
  const r = await db.auth.admin.createUser({ email, email_confirm: true });
  if (r.error) throw r.error;
  return { id: r.data.user.id, email };
}

async function fixtures() {
  const ua = await authUser('a'), ub = await authUser('b'), uc = await authUser('c');
  const [a, b, c] = must(
    await db.from('members').insert([
      { github_id: GH.a, github_login: 'e2e-a', auth_user_id: ua.id },
      { github_id: GH.b, github_login: 'e2e-b', auth_user_id: ub.id },
      { github_id: GH.c, github_login: 'e2e-c', auth_user_id: uc.id },
    ]).select('id, github_id').order('github_id'),
  );
  const [r1, r2] = must(
    await db.from('rooms').insert([
      { github_repo_id: 9_000_000_101, full_name: REPO1, installation_id: 0 },
      { github_repo_id: 9_000_000_102, full_name: REPO2, installation_id: 0 },
    ]).select('id, github_repo_id').order('github_repo_id'),
  );
  check(await db.from('room_members').insert([
    { room_id: r1.id, member_id: a.id },
    { room_id: r1.id, member_id: b.id },
    { room_id: r2.id, member_id: c.id },
  ]));
  const sa = await sessionFor(ua.email), sb = await sessionFor(ub.email), sc = await sessionFor(uc.email);
  const tok = { a: sa.token, b: sb.token, c: sc.token };
  check(await db.auth.admin.signOut(tok.b)); // b는 로그아웃한 세션 (토큰 서명은 유효하지만 세션이 없다)
  return { ids: { a: a.id, b: b.id, c: c.id, r1: r1.id, r2: r2.id }, tok, sessionA: sa.client };
}

type CallResult = { isError?: boolean; content: { type: string; text?: string }[] };
const textOf = (r: CallResult) => r.content.map((c) => c.text ?? '').join('\n');

async function connect(url: string, token: string) {
  const client = new Client({ name: 'e2e', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as CallResult;
  /** 입력 검증 실패는 SDK에 따라 throw 또는 isError로 온다. 둘 다 실패로 인정한다 */
  const fails = async (name: string, args: Record<string, unknown>, includes?: string) => {
    let r: CallResult;
    try {
      r = await call(name, args);
    } catch {
      return;
    }
    assert.ok(r.isError, `${name} should fail: ${textOf(r)}`);
    if (includes) assert.match(textOf(r), new RegExp(includes));
  };
  return { client, call, fails };
}

let passed = 0;
const step = (name: string) => console.log(`  ✓ ${name} (${++passed})`);

await cleanup();
const { ids, tok, sessionA } = await fixtures();
const http = createHttpServer();
await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;

try {
  // 인증
  const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
  const post = (headers: Record<string, string>) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(ping) });
  const none = await post({});
  assert.equal(none.status, 401);
  assert.equal(none.headers.get('www-authenticate'), `Bearer resource_metadata="${new URL(url).origin}/.well-known/oauth-protected-resource"`);
  step('토큰 없음 → 401 + 인증 서버 안내(WWW-Authenticate)');
  assert.equal((await post({ authorization: `Bearer ${tok.b}` })).status, 401); step('로그아웃한 세션 토큰 → 401');
  assert.equal((await post({ authorization: 'Bearer wrong' })).status, 401); step('틀린 토큰 → 401');
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${tok.a}` } })).status, 405); step('GET → 405');

  // ---------------- MCP OAuth 로그인: Claude Code·수집기가 하는 흐름을 브라우저 없이 재현 ----------------
  const meta = await (await fetch(`${new URL(url).origin}/.well-known/oauth-protected-resource/mcp`)).json() as { resource: string; authorization_servers: string[] };
  assert.deepEqual([meta.resource, meta.authorization_servers], [url, [`${process.env.SUPABASE_URL}/auth/v1`]]);
  const issuer = new URL(meta.authorization_servers[0]);
  const as = await (await fetch(`${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`)).json() as Record<string, string>;
  const redirectUri = 'http://127.0.0.1:59999/callback';
  const reg = await (await fetch(as.registration_endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'team-office e2e', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
  })).json() as { client_id: string };
  assert.ok(reg.client_id, '동적 클라이언트 등록 실패');
  try {
    const verifier = randomBytes(32).toString('base64url');
    const authorize = new URL(as.authorization_endpoint);
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirectUri, state: 'e2e-state', resource: url,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) authorize.searchParams.set(k, v);
    const toConsent = await fetch(authorize, { redirect: 'manual' });
    const consent = new URL(toConsent.headers.get('location') ?? '');
    assert.equal(consent.pathname, '/oauth/consent', `동의 화면으로 가지 않음: ${toConsent.status} ${consent}`);
    const authorizationId = consent.searchParams.get('authorization_id')!;
    const details = await sessionA.auth.oauth.getAuthorizationDetails(authorizationId);
    assert.ok(details.data && 'client' in details.data && details.data.client.name === 'team-office e2e', JSON.stringify(details));
    const approved = await sessionA.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
    const back = new URL(approved.data?.redirect_url ?? '');
    assert.equal(back.searchParams.get('state'), 'e2e-state');
    const tokenReq = (body: Record<string, string>) => fetch(as.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    const t1 = await (await tokenReq({ grant_type: 'authorization_code', code: back.searchParams.get('code')!, redirect_uri: redirectUri, client_id: reg.client_id, code_verifier: verifier, resource: url }))
      .json() as { access_token: string; refresh_token: string };
    assert.ok(t1.access_token && t1.refresh_token, JSON.stringify(t1));
    const O = await connect(url, t1.access_token);
    assert.equal((await O.client.listTools()).tools.length, 8);
    await O.client.close();
    step('OAuth: 메타데이터 → 동적 등록 → 동의 → 코드 교환(PKCE) → MCP 호출');

    const t2 = await (await tokenReq({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: reg.client_id })).json() as { access_token: string };
    assert.notEqual((await post({ authorization: `Bearer ${t2.access_token}` })).status, 401);
    step('OAuth: refresh_token으로 갱신한 토큰으로 MCP 호출');

    check(await sessionA.auth.oauth.revokeGrant({ clientId: reg.client_id }));
    assert.equal((await post({ authorization: `Bearer ${t2.access_token}` })).status, 401);
    step('OAuth: 웹에서 연결 해제(revokeGrant) → 기존 토큰 즉시 401');
  } finally {
    await db.auth.admin.oauth.deleteClient(reg.client_id);
  }

  const A = await connect(url, tok.a);
  const C = await connect(url, tok.c);

  const names = (await A.client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['get_member_history', 'get_team_status', 'log_done', 'release_status', 'report_issue', 'report_usage', 'resolve_issue', 'update_status']);
  step('tool 8개 노출');

  // update_status
  let r = await A.call('update_status', { repo: 'E2E_Owner/Sandbox_Repo', status: 'coding', task: 'login API' });
  assert.ok(!r.isError, textOf(r));
  const s1 = must(await db.from('statuses').select('status, task, started_at').eq('room_id', ids.r1).eq('member_id', ids.a).single());
  assert.equal(s1.status, 'coding');
  assert.equal(s1.task, 'login API');
  step('update_status (저장소 이름 대소문자 무시)');

  r = await A.call('update_status', { repo: REPO1, status: 'coding', task: 'login API' });
  assert.match(textOf(r), /변경 없음/);
  const s2 = must(await db.from('statuses').select('started_at').eq('room_id', ids.r1).eq('member_id', ids.a).single());
  assert.equal(s2.started_at, s1.started_at);
  assert.equal(must(await db.from('logs').select('id').eq('member_id', ids.a)).length, 1);
  step('같은 상태·작업 재호출 → started_at 유지, 로그 중복 없음');

  await A.fails('update_status', { repo: REPO1, status: 'sleeping', task: 'x' }); step('잘못된 status 거부');
  await A.fails('update_status', { repo: 'no-owner/no-repo', status: 'coding', task: 'x' }, '방이 없습니다'); step('없는 방 거부');
  await A.fails('update_status', { repo: 'not a repo', status: 'coding', task: 'x' }); step('repo 형식 검증');

  // log_done
  r = await A.call('log_done', { repo: REPO1, task: 'login API' });
  assert.ok(!r.isError, textOf(r));
  assert.equal(must(await db.from('statuses').select('status').eq('room_id', ids.r1).eq('member_id', ids.a).single()).status, 'done');
  assert.equal(must(await db.from('logs').select('id').eq('member_id', ids.a)).length, 2);
  step('log_done');

  // report_usage
  await A.fails('report_usage', { hp_pct: 30, mp_pct: 101 }); step('사용률 101% 거부');
  r = await A.call('report_usage', { hp_pct: 30, mp_pct: 80, mp_resets_at: '2026-11-17T15:00:00+09:00' });
  assert.ok(!r.isError, textOf(r));
  const u = must(await db.from('usage').select('hp_pct, mp_pct, source').eq('member_id', ids.a).single());
  assert.deepEqual([Number(u.hp_pct), Number(u.mp_pct), u.source], [30, 80, 'self']);
  step('report_usage');

  // report_issue
  r = await A.call('report_issue', { repo: REPO1, title: 'Supabase RLS 막힘' });
  assert.ok(!r.isError, textOf(r));
  const issueId = Number(textOf(r).match(/#(\d+)/)?.[1]);
  assert.ok(issueId > 0);
  step('report_issue');

  // get_team_status
  r = await A.call('get_team_status', { repo: REPO1 });
  const team = JSON.parse(textOf(r)) as { github_login: string; status: string | null; usage: { hp_pct: number } | null; open_issues: { id: number }[] }[];
  const ta = team.find((m) => m.github_login === 'e2e-a');
  const tb = team.find((m) => m.github_login === 'e2e-b');
  assert.equal(team.length, 2);
  assert.equal(ta?.status, 'done');
  assert.equal(Number(ta?.usage?.hp_pct), 30);
  assert.deepEqual(ta?.open_issues.map((i) => i.id), [issueId]);
  assert.equal(tb?.status, null);
  assert.ok(!team.some((m) => m.github_login === 'e2e-c'));
  step('get_team_status (다른 방 조원 제외)');

  // get_member_history
  assert.equal(JSON.parse(textOf(await A.call('get_member_history', { repo: REPO1 }))).length, 2);
  assert.equal(JSON.parse(textOf(await A.call('get_member_history', { repo: REPO1, github_login: 'e2e-b' }))).length, 0);
  await A.fails('get_member_history', { repo: REPO1, github_login: 'e2e-c' }, '조원이 아닙니다');
  step('get_member_history (본인·같은 방·다른 방 거부)');

  // 다른 방 조원(C)의 접근 차단
  await C.fails('get_team_status', { repo: REPO1 }, '조원이 아닙니다');
  await C.fails('update_status', { repo: REPO1, status: 'coding', task: 'x' }, '조원이 아닙니다');
  await C.fails('resolve_issue', { issue_id: issueId }, '조원이 아닙니다');
  step('다른 방 조원은 읽기·쓰기·이슈 해결 불가');

  // resolve_issue
  r = await A.call('resolve_issue', { issue_id: issueId });
  assert.ok(!r.isError, textOf(r));
  assert.equal(must(await db.from('issues').select('state').eq('id', issueId).single()).state, 'resolved');
  await A.fails('resolve_issue', { issue_id: issueId }, '이미 해결');
  await A.fails('resolve_issue', { issue_id: 999_999_999 }, '없습니다');
  step('resolve_issue');

  // ---------------- M9: 직접 선택(F18) ----------------
  const st = async (mid: string) => must(await db.from('statuses').select('status, task, mode, expires_at').eq('room_id', ids.r1).eq('member_id', mid).single());
  const view = async (mid: string) => must(await db.from('effective_statuses').select('*').eq('room_id', ids.r1).eq('member_id', mid).single());
  r = await A.call('update_status', { repo: REPO1, status: 'coding', task: 'M9 timed' });
  let sa = await st(ids.a);
  assert.equal(sa.mode, 'timed');
  assert.ok(Math.abs(Date.parse(sa.expires_at!) - Date.now() - 2 * 3600_000) < 120_000, '기본 2시간 만료');
  step('update_status 기본 = 2시간 만료(timed)');

  r = await A.call('update_status', { repo: REPO1, status: 'meeting', task: 'M9 pinned', mode: 'pinned' });
  sa = await st(ids.a);
  assert.deepEqual([sa.status, sa.mode, sa.expires_at], ['meeting', 'pinned', null]);
  r = await A.call('release_status', { repo: REPO1 });
  assert.match(textOf(r), /해제했습니다/);
  sa = await st(ids.a);
  assert.ok(sa.mode === 'timed' && Date.parse(sa.expires_at!) <= Date.now() + 1000);
  assert.match(textOf(await A.call('release_status', { repo: REPO1 })), /해제할 직접 선택이 없습니다/);
  await C.fails('release_status', { repo: REPO1 }, '조원이 아닙니다');
  step('pinned 유지 → release_status로 해제, 다른 방 조원 거부');

  // ---------------- M9: 우선순위 (effective_statuses) ----------------
  const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
  const card = (item_id: string, member_id: string, state: 'idle' | 'progress' | 'review' | 'done', title: string, mins: number, extra: object = {}) => ({
    room_id: ids.r1, item_id, member_id, column_name: state, state, title, item_updated_at: ago(mins), moved_at: ago(mins),
    is_draft: false, number: null, url: null, part: null, ...extra, // 여러 행 insert는 빠진 키를 기본값이 아니라 null로 넣는다
  });
  check(await db.from('room_members').update({ status_source: 'github', part: 'dev' }).eq('room_id', ids.r1).eq('member_id', ids.a));
  check(await db.from('github_cards').insert([
    card('I1', ids.a, 'progress', '오래된 카드', 50, { number: 1, url: 'https://github.com/x/y/issues/1' }),
    card('I2', ids.a, 'review', '최근 카드', 5, { is_draft: true, part: 'design' }),
    card('I3', ids.b, 'progress', 'b의 카드', 5),
  ]));
  let v = await view(ids.a);
  assert.deepEqual([v.status, v.task, v.source, v.review, v.progress_count, v.card_draft, v.part], ['coding', '최근 카드', 'github', true, 2, true, 'design']);
  step('github 조원: 진행·검토 카드 중 최근 1개 + 개수, 검토 중·초안·카드 파트');

  r = await A.call('update_status', { repo: REPO1, status: 'break', task: '칸반에 없는 일' });
  v = await view(ids.a);
  assert.deepEqual([v.status, v.task, v.source, v.shadow_status, v.shadow_task, v.part], ['break', '칸반에 없는 일', 'manual_timed', 'coding', '최근 카드', 'dev']);
  check(await db.from('github_cards').update({ title: '칸반에서 바뀜' }).eq('item_id', 'I2'));
  assert.equal((await view(ids.a)).status, 'break');
  step('직접 선택 중에는 칸반 변경이 화면 상태를 바꾸지 않음 (가려진 카드로만 노출)');

  check(await db.from('statuses').update({ expires_at: ago(0.02) }).eq('room_id', ids.r1).eq('member_id', ids.a));
  v = await view(ids.a);
  assert.deepEqual([v.status, v.task, v.source, v.shadow_status], ['coding', '칸반에서 바뀜', 'github', null]);
  step('만료 후 최신 칸반 상태로 복귀');

  check(await db.from('github_cards').delete().in('item_id', ['I1', 'I2']));
  check(await db.from('github_cards').insert(card('D1', ids.a, 'done', '끝낸 카드', 10)));
  v = await view(ids.a);
  assert.deepEqual([v.status, v.task], ['done', '끝낸 카드']);
  // 회귀: 진행 카드의 null 값(초안 url·number)에 최근 Done 카드 값이 섞이면 안 된다 (2026-11-18 실제 칸반에서 발견)
  check(await db.from('github_cards').update({ number: 9, url: 'https://github.com/x/y/issues/9', part: 'plan' }).eq('item_id', 'D1'));
  check(await db.from('github_cards').insert(card('P1', ids.a, 'progress', '초안 진행', 1, { is_draft: true })));
  v = await view(ids.a);
  assert.deepEqual([v.status, v.task, v.card_draft, v.card_url, v.card_number, v.part], ['coding', '초안 진행', true, null, null, 'dev']);
  check(await db.from('github_cards').delete().eq('item_id', 'P1'));
  check(await db.from('github_cards').update({ moved_at: ago(31) }).eq('item_id', 'D1'));
  v = await view(ids.a);
  assert.deepEqual([v.status, v.source], ['idle', 'github']);
  step('Done 30분 이내 → done, 지나면 대기(idle)');

  // manual 조원(b): 칸반 카드가 있어도 영향 없음, 만료돼도 마지막 값 유지
  assert.equal((await view(ids.b)).status, null);
  must(await db.rpc('set_status', { p_room: ids.r1, p_member: ids.b, p_status: 'meeting', p_task: 'b 회의' }));
  check(await db.from('statuses').update({ expires_at: ago(0.02) }).eq('room_id', ids.r1).eq('member_id', ids.b));
  v = await view(ids.b);
  assert.deepEqual([v.status, v.task, v.shadow_status], ['meeting', 'b 회의', null]);
  step('status_source=manual 조원은 칸반 영향 없음, 만료 후에도 마지막 값 유지');

  // ---------------- M9: 칸반 동기화 (F17·F20), 가짜 GitHub 응답 ----------------
  const PAT = 'ghp_e2eFAKEtoken000000000000000000000000';
  assert.throws(() => decryptSecret(encryptSecret(PAT, ids.r1), ids.r2));
  assert.equal(decryptSecret(encryptSecret(PAT, ids.r1), ids.r1), PAT);
  step('PAT 암호화 왕복, 다른 방 id로는 복호화 실패');

  check(await db.from('github_cards').delete().eq('room_id', ids.r1));
  check(await db.from('rooms').update({ project_owner_type: 'user', project_owner: 'e2e_owner', project_number: 1 }).eq('id', ids.r1));
  check(await db.from('room_secrets').insert({ room_id: ids.r1, github_pat_enc: encryptSecret(PAT, ids.r1), pat_login: 'e2e_owner' }));
  const T = ago(5);
  const item = (id: string, column: string | null, content: ProjectItem['content'], part?: string, archived = false): ProjectItem => ({
    id, updatedAt: T, isArchived: archived, status: column ? { name: column, updatedAt: T } : null, part: part ? { name: part } : null, content,
  });
  const who = (...l: string[]) => ({ nodes: l.map((login) => ({ login })) });
  let items: ProjectItem[] = [
    item('P1', 'In progress', { __typename: 'Issue', title: '로그인 API', number: 7, url: 'https://github.com/x/y/issues/7', assignees: who('E2E-A') }, '개발'),
    item('P2', 'in review', { __typename: 'DraftIssue', title: '메인 시안', assignees: who('e2e-a', 'e2e-b') }, '디자인'),
    item('P3', 'Done', { __typename: 'PullRequest', title: 'PR 머지', number: 8, url: 'https://github.com/x/y/pull/8', assignees: who('e2e-b') }),
    item('P4', 'In progress', { __typename: 'Issue', title: '외부인 카드', number: 9, url: 'u', assignees: who('stranger') }),
    item('P5', 'In progress', { __typename: 'Issue', title: '보관됨', number: 10, url: 'u', assignees: who('e2e-a') }, undefined, true),
    item('P6', 'Backlog', { __typename: 'DraftIssue', title: '기획 메모', assignees: who('e2e-a') }, '기획'),
  ];
  let httpStatus = 200;
  let sawAuth = '';
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sawAuth = (init?.headers as Record<string, string>).authorization;
    const body = { data: { owner: { projectV2: { field: { __typename: 'ProjectV2SingleSelectField' }, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: items } } } } };
    return new Response(JSON.stringify(body), { status: httpStatus });
  }) as typeof fetch;
  let sync = await syncRoomProject(ids.r1, fakeFetch);
  assert.deepEqual(sync, { ok: true, cards: 5 }, JSON.stringify(sync));
  assert.equal(sawAuth, `Bearer ${PAT}`);
  const cards = must(await db.from('github_cards').select('item_id, member_id, state, is_draft, number, url, part').eq('room_id', ids.r1));
  const cardOf = (i: string, m: string) => cards.find((c) => c.item_id === i && c.member_id === m);
  assert.deepEqual([cardOf('P1', ids.a)?.state, cardOf('P1', ids.a)?.number, cardOf('P1', ids.a)?.part], ['progress', 7, 'dev']);
  assert.deepEqual([cardOf('P2', ids.a)?.state, cardOf('P2', ids.a)?.is_draft, cardOf('P2', ids.a)?.url, cardOf('P2', ids.b)?.part], ['review', true, null, 'design']);
  assert.equal(cardOf('P3', ids.b)?.state, 'done');
  assert.equal(cardOf('P6', ids.a)?.state, 'idle');
  assert.ok(!cards.some((c) => c.item_id === 'P4' || c.item_id === 'P5'));
  const synced = must(await db.from('rooms').select('github_synced_at, github_sync_error').eq('id', ids.r1).single());
  assert.ok(synced.github_synced_at && synced.github_sync_error === null);
  step('동기화: 이슈·PR·초안 매핑, 담당자 여러 명, 열 이름 대소문자 무시, 외부인·보관 카드 제외, 파트');

  const ghLogs = async () => must(await db.from('logs').select('status, member_id').eq('room_id', ids.r1).eq('source', 'github').order('id'));
  const logsBefore = (await ghLogs()).length;
  items = items.map((it) => (it.id === 'P1' ? { ...it, status: { name: 'Done', updatedAt: new Date().toISOString() } } : it));
  assert.ok((await syncRoomProject(ids.r1, fakeFetch)).ok);
  const after = await ghLogs();
  assert.equal(after.length - logsBefore, 1);
  assert.deepEqual([after.at(-1)?.status, after.at(-1)?.member_id], ['done', ids.a]);
  v = await view(ids.a);
  assert.deepEqual([v.status, v.task, v.review], ['coding', '메인 시안', true]);
  step('카드 열 이동 → 이력(logs, source=github) 1줄, 진행 카드가 Done보다 우선');

  httpStatus = 401;
  sync = await syncRoomProject(ids.r1, fakeFetch);
  assert.equal(sync.ok, false);
  assert.match(sync.error!, /PAT가 만료/);
  assert.ok(!sync.error!.includes(PAT));
  const failed = must(await db.from('rooms').select('github_sync_error, github_sync_failed_at, github_synced_at').eq('id', ids.r1).single());
  assert.ok(failed.github_sync_error && failed.github_sync_failed_at && failed.github_synced_at);
  assert.equal(must(await db.from('github_cards').select('item_id').eq('room_id', ids.r1)).length, 5);
  assert.equal((await view(ids.a)).status, 'coding');
  httpStatus = 200;
  assert.ok((await syncRoomProject(ids.r1, fakeFetch)).ok);
  assert.equal(must(await db.from('rooms').select('github_sync_error').eq('id', ids.r1).single()).github_sync_error, null);
  step('동기화 실패(PAT 만료) → 카드·상태 유지 + 실패 기록, 토큰 미노출, 복구 시 오류 해제');

  // 저장소에서 빠진 조원(active=false)
  check(await db.from('room_members').update({ active: false }).eq('room_id', ids.r2).eq('member_id', ids.c));
  await C.fails('get_team_status', { repo: REPO2 }, '조원이 아닙니다');
  step('비활성 조원 차단');

  await A.client.close();
  await C.client.close();

  if (process.env.E2E_CLAUDE) {
    const cfg = join(tmpdir(), `team-office-e2e-${process.pid}.json`);
    writeFileSync(cfg, JSON.stringify({ mcpServers: { 'team-office': { type: 'http', url, headers: { authorization: `Bearer ${tok.a}` } } } }));
    try {
      const prompt = `team-office MCP의 update_status tool을 repo "${REPO1}", status "meeting", task "claude e2e"로 호출한 뒤, get_team_status를 같은 repo로 호출하고 결과를 한 줄로 요약해.`;
      // 비동기여야 한다: 동기 실행은 이벤트 루프를 막아 같은 프로세스의 MCP 서버가 응답하지 못한다.
      // shell을 쓰면 Windows에서 공백 있는 프롬프트가 쪼개진다. claude는 실행 파일이라 shell 없이 호출한다.
      const { stdout } = await promisify(execFile)('claude', ['-p', prompt, '--mcp-config', cfg, '--strict-mcp-config', '--allowedTools', 'mcp__team-office__update_status,mcp__team-office__get_team_status'], { encoding: 'utf8', timeout: 180_000 });
      console.log(`    claude: ${stdout.trim()}`);
      const s = must(await db.from('statuses').select('status, task').eq('room_id', ids.r1).eq('member_id', ids.a).single());
      assert.deepEqual([s.status, s.task], ['meeting', 'claude e2e']);
      step('Claude Code(claude -p)가 MCP tool로 상태 변경');
    } finally {
      rmSync(cfg, { force: true });
    }
  }

  console.log(`\nM2·M9 E2E PASSED (${passed})`);
} finally {
  http.close();
  await cleanup();
}
