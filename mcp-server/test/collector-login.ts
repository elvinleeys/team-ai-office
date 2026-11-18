// 수집기 OAuth 로그인 확인 (브라우저 대신 테스트 사용자 세션으로 동의를 승인). MCP 서버가 8787에서 켜져 있어야 한다.
//   node --env-file=.env test/collector-login.ts
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, must } from '../src/db.ts';
import { sessionFor } from './session.ts';

const authFile = join(tmpdir(), `collector-auth-${process.pid}.json`);
process.env.COLLECTOR_AUTH_FILE = authFile;
process.env.TEAM_OFFICE_MCP_URL = 'http://127.0.0.1:8787/mcp';
const { login, accessToken } = await import('../../collector/collector.ts');

const email = `e2e-collector-${Date.now()}@example.invalid`;
const user = (await db.auth.admin.createUser({ email, email_confirm: true })).data.user!;
const member = must(await db.from('members').insert({ github_id: 9_000_000_009, github_login: 'e2e-collector', auth_user_id: user.id }).select('id').single());
let clientId: string | undefined;
try {
  const { client } = await sessionFor(email);
  // 브라우저 역할: authorize → 동의 화면 주소 → 승인 → 수집기 로컬 콜백으로 이동
  await login(async (url) => {
    const consent = new URL((await fetch(url, { redirect: 'manual' })).headers.get('location')!);
    const id = consent.searchParams.get('authorization_id')!;
    await client.auth.oauth.getAuthorizationDetails(id); // 동의 화면이 하는 조회
    const ok = await client.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true });
    if (!ok.data) { console.error('승인 실패', ok.error); process.exit(1); }
    await fetch(ok.data.redirect_url);
  });
  const saved = JSON.parse(readFileSync(authFile, 'utf8'));
  clientId = saved.client_id;
  const call = (t: string) => fetch('http://127.0.0.1:8787/mcp', { method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }) });
  assert.equal((await call(await accessToken())).status, 200);
  console.log('  ✓ --login: 동적 등록 → 동의 → 로컬 콜백 → 토큰 저장 → MCP 200');

  writeFileSync(authFile, JSON.stringify({ ...saved, expires_at: 0 }));
  const refreshed = await accessToken();
  assert.notEqual(refreshed, saved.access_token);
  assert.notEqual(JSON.parse(readFileSync(authFile, 'utf8')).refresh_token, saved.refresh_token);
  assert.equal((await call(refreshed)).status, 200);
  console.log('  ✓ 만료 시 refresh_token으로 자동 갱신, 새 갱신 토큰 저장');

  await client.auth.oauth.revokeGrant({ clientId: saved.client_id });
  assert.equal((await call(refreshed)).status, 401);
  await assert.rejects(() => { writeFileSync(authFile, JSON.stringify({ ...JSON.parse(readFileSync(authFile, 'utf8')), expires_at: 0 })); return accessToken(); }, /--login/);
  console.log('  ✓ 웹에서 연결 해제 → MCP 401, 갱신도 거부되어 --login 안내');
  console.log('COLLECTOR LOGIN PASSED');
} finally {
  rmSync(authFile, { force: true });
  if (clientId) await db.auth.admin.oauth.deleteClient(clientId);
  await db.from('members').delete().eq('id', member.id);
  await db.auth.admin.deleteUser(user.id);
}
