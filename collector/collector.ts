// F14 로컬 수집기: 이 PC의 Claude 사용률을 읽어 MCP report_usage로 보낸다.
// Claude 자격 증명(~/.claude/.credentials.json)은 api.anthropic.com 조회에만 쓰고, 서버로는 사용률·리셋 시각만 보낸다.
// MCP 서버 로그인은 Claude Code와 같은 OAuth(Supabase OAuth 서버)로 한다. 처음 한 번 --login, 이후 토큰은 자동 갱신.
// 실행: node --env-file=.env collector.ts [--login | --once]   (Node 22.18+, 의존성 없음)
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const MCP_URL = process.env.TEAM_OFFICE_MCP_URL ?? 'http://127.0.0.1:8787/mcp';
// MCP 로그인 토큰 (이 PC에만 둔다). 다른 PC에서는 그 PC에서 --login
const AUTH_FILE = process.env.COLLECTOR_AUTH_FILE ?? join(homedir(), '.team-office', 'collector.json');
const LOGIN_HINT = '로그인하세요: node --env-file=.env collector.ts --login';
// 사용량 엔드포인트는 비공개 API라 10분보다 자주 부르지 않는다 (CLAUDE.md 보안 규칙)
const MIN_MINUTES = 10;
const MINUTES = Math.max(MIN_MINUTES, Number(process.env.COLLECT_MINUTES ?? 15) || 15);
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

type Window = { utilization: number | null; resets_at: string | null } | null;
export type Usage = { hp_pct: number; mp_pct: number; hp_resets_at?: string; mp_resets_at?: string; source: 'auto' };

const pct = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100) / 100));

/** /api/oauth/usage 응답에서 HP(seven_day)·MP(five_hour)만 뽑는다. 값이 없으면(엔터프라이즈 등) null */
export function toUsage(body: { five_hour?: Window; seven_day?: Window }): Usage | null {
  const mp = body.five_hour, hp = body.seven_day;
  if (mp?.utilization == null || hp?.utilization == null) return null;
  return {
    hp_pct: pct(hp.utilization), mp_pct: pct(mp.utilization),
    ...(hp.resets_at && { hp_resets_at: hp.resets_at }), ...(mp.resets_at && { mp_resets_at: mp.resets_at }),
    source: 'auto',
  };
}

async function readUsage(): Promise<Usage | null> {
  const creds = JSON.parse(await readFile(join(homedir(), '.claude', '.credentials.json'), 'utf8'));
  const oauth = creds.claudeAiOauth;
  if (!oauth?.accessToken) throw new Error('Claude 로그인 정보가 없습니다. Claude Code에 로그인하세요.');
  // 만료된 토큰은 갱신하지 않는다 (자격 증명 파일은 Claude Code만 고친다). Claude Code를 쓰면 다시 갱신된다
  if (oauth.expiresAt && oauth.expiresAt < Date.now()) throw new Error('Claude 토큰이 만료됐습니다. Claude Code를 한 번 실행하면 갱신됩니다.');
  const res = await fetch(USAGE_URL, { headers: { Authorization: `Bearer ${oauth.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' } });
  if (!res.ok) throw new Error(`사용량 조회 실패 HTTP ${res.status}`);
  return toUsage(await res.json());
}

// ---------------- MCP OAuth 로그인 ----------------
type Auth = { token_endpoint: string; client_id: string; access_token: string; refresh_token: string; expires_at: number };

const postForm = (endpoint: string, body: Record<string, string>) =>
  fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });

/** 토큰 응답을 저장한다. 갱신 토큰은 쓸 때마다 바뀌므로 매번 새 값으로 덮어쓴다 */
async function saveTokens(base: Pick<Auth, 'token_endpoint' | 'client_id'>, res: Response): Promise<Auth> {
  const t = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !t.access_token || !t.refresh_token) throw new Error(`토큰 발급 실패: ${t.error_description ?? t.error ?? `HTTP ${res.status}`}`);
  const auth: Auth = { token_endpoint: base.token_endpoint, client_id: base.client_id, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(auth), { mode: 0o600 });
  return auth;
}

/** 저장된 액세스 토큰. 만료 1분 전부터는 refresh_token으로 갱신한다 */
export async function accessToken(): Promise<string> {
  let auth: Auth;
  try {
    auth = JSON.parse(await readFile(AUTH_FILE, 'utf8'));
  } catch {
    throw new Error(`MCP 로그인 정보가 없습니다. ${LOGIN_HINT}`);
  }
  if (auth.expires_at - 60_000 > Date.now()) return auth.access_token;
  const res = await postForm(auth.token_endpoint, { grant_type: 'refresh_token', refresh_token: auth.refresh_token, client_id: auth.client_id });
  if (!res.ok) throw new Error(`MCP 로그인이 만료됐거나 웹에서 연결이 해제됐습니다 (HTTP ${res.status}). ${LOGIN_HINT}`);
  return (await saveTokens(auth, res)).access_token;
}

/** 기본 브라우저로 연다. 셸을 거치지 않는다 (URL의 &가 명령으로 해석되지 않게). 실패하면 출력한 주소를 직접 연다 */
function openBrowser(url: string) {
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  execFile(cmd, args, () => {});
}

/**
 * Claude Code와 같은 흐름: MCP 서버 메타데이터(RFC 9728) → 인증 서버 메타데이터(RFC 8414) → 동적 등록 →
 * 브라우저 동의 → 로컬 콜백으로 코드 받기 → PKCE로 토큰 교환
 */
export async function login(open: (url: string) => void = openBrowser) {
  const mcp = new URL(MCP_URL);
  const meta = (await (await fetch(`${mcp.origin}/.well-known/oauth-protected-resource${mcp.pathname}`)).json()) as { authorization_servers?: string[] };
  const issuer = new URL(meta.authorization_servers?.[0] ?? '');
  const as = (await (await fetch(`${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`)).json()) as Record<string, string>;

  const server = createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
  try {
    const reg = (await (await fetch(as.registration_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'team-office 수집기', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
    })).json()) as { client_id?: string; error_description?: string };
    if (!reg.client_id) throw new Error(`클라이언트 등록 실패: ${reg.error_description ?? JSON.stringify(reg)}`);

    const verifier = randomBytes(32).toString('base64url'), state = randomBytes(16).toString('base64url');
    const url = new URL(as.authorization_endpoint);
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirectUri, state, resource: MCP_URL,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) url.searchParams.set(k, v);

    const code = new Promise<string>((resolve, reject) => {
      server.on('request', (req, res) => {
        const q = new URL(req.url ?? '/', redirectUri).searchParams;
        if (!req.url?.startsWith('/callback')) return void res.writeHead(404).end();
        const got = q.get('state') === state ? q.get('code') : null;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(got ? '<p>로그인했습니다. 이 창을 닫아도 됩니다.</p>' : '<p>로그인하지 못했습니다. 터미널을 확인하세요.</p>');
        if (got) resolve(got);
        else reject(new Error(`로그인 실패: ${q.get('error_description') ?? q.get('error') ?? 'state 불일치'}`));
      });
      setTimeout(() => reject(new Error('5분 안에 허용하지 않아 취소했습니다.')), 300_000).unref();
    });
    console.log(`브라우저에서 팀 오피스 연결을 허용하세요. 창이 열리지 않으면 이 주소를 여세요:\n${url}`);
    open(url.toString());
    await saveTokens({ token_endpoint: as.token_endpoint, client_id: reg.client_id },
      await postForm(as.token_endpoint, { grant_type: 'authorization_code', code: await code, redirect_uri: redirectUri, client_id: reg.client_id, code_verifier: verifier, resource: MCP_URL }));
    console.log(`로그인했습니다 (${AUTH_FILE}). 이제 node --env-file=.env collector.ts 로 수집을 시작하세요.`);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

/** MCP Streamable HTTP로 report_usage 한 번 호출 (initialize → initialized → tools/call) */
async function reportUsage(usage: Usage) {
  const token = await accessToken();
  let session: string | null = null;
  const rpc = async (body: object) => {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        ...(session && { 'mcp-session-id': session }),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`MCP 서버 HTTP ${res.status}${res.status === 401 ? ` (MCP 로그인이 해제됐습니다. ${LOGIN_HINT})` : ''}`);
    session ??= res.headers.get('mcp-session-id');
    const text = await res.text();
    const data = text.split('\n').find((l) => l.startsWith('data: '))?.slice(6) ?? text;
    return data ? JSON.parse(data) : null;
  };
  await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'team-office-collector', version: '0.1.0' } } });
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const out = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'report_usage', arguments: usage } });
  const msg = out?.result?.content?.[0]?.text ?? JSON.stringify(out?.error ?? out);
  if (out?.error || out?.result?.isError) throw new Error(`report_usage 실패: ${msg}`);
  return msg as string;
}

async function tick() {
  const at = new Date().toLocaleTimeString('ko-KR');
  try {
    const usage = await readUsage();
    if (!usage) return console.log(`[${at}] 이 계정은 사용량 값이 오지 않습니다. report_usage 자기 보고를 쓰세요.`);
    console.log(`[${at}] ${await reportUsage(usage)} (HP 리셋 ${usage.hp_resets_at ?? '-'}, MP 리셋 ${usage.mp_resets_at ?? '-'})`);
  } catch (e) {
    // 실패해도 멈추지 않고 다음 주기에 다시 시도한다. 그동안은 자기 보고로 대신할 수 있다
    console.error(`[${at}] ${(e as Error).message}`);
  }
}

if (import.meta.main && process.argv.includes('--login')) {
  try {
    await login();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
} else if (import.meta.main) {
  await tick();
  if (!process.argv.includes('--once')) {
    console.log(`${MINUTES}분마다 수집합니다. 끝내려면 Ctrl+C`);
    setInterval(tick, MINUTES * 60_000);
  }
}
