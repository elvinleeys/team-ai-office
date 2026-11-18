// GitHub App을 Manifest 방식으로 만들고, 받은 자격 증명을 .env.local에 바로 저장한다.
//   node scripts/create-github-app.mjs [organization]
// organization을 주면 그 org 소유 App으로 만든다. 비밀 값은 화면에 출력하지 않는다.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { exec } from 'node:child_process';

const ENV_FILE = new URL('../.env.local', import.meta.url);
const PORT = 3999;
const org = process.argv[2];

const env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
const supabaseUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const siteUrl = env.match(/^SITE_URL=(.+)$/m)?.[1]?.trim() ?? 'http://localhost:3000';
if (!supabaseUrl) throw new Error('.env.local에 NEXT_PUBLIC_SUPABASE_URL이 필요합니다');

const state = randomBytes(16).toString('hex');
const manifest = {
  name: `team-office-${randomBytes(3).toString('hex')}`, // GitHub 전체에서 유일해야 한다. 만든 뒤 설정에서 바꿀 수 있다.
  url: siteUrl,
  redirect_url: `http://localhost:${PORT}/callback`,
  callback_urls: [`${supabaseUrl}/auth/v1/callback`], // 로그인은 Supabase Auth가 처리한다
  setup_url: `${siteUrl}/rooms/new`, // App 설치 후 돌아올 곳
  setup_on_update: true,
  public: true, // 다른 사람·organization 저장소에 설치하려면 public이어야 한다
  // hook_attributes 없음: localhost URL은 비활성이어도 거부된다. 웹훅은 PRD 15.2 향후 확장.
  default_permissions: { metadata: 'read', emails: 'read' }, // emails: Supabase Auth가 로그인 시 요구한다 (manifest 키 이름은 emails)
  default_events: [],
};

function setEnv(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, () => line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
}

const page = (body) => `<!doctype html><meta charset="utf-8"><title>GitHub App 만들기</title><body style="font-family:sans-serif;padding:24px">${body}</body>`;
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/') {
    const action = org ? `https://github.com/organizations/${org}/settings/apps/new` : 'https://github.com/settings/apps/new';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
      page(`<p>GitHub로 이동합니다. 열리는 화면에서 <b>Create GitHub App</b>을 누르세요.</p>
<form id="f" method="post" action="${action}?state=${state}"><input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}"><button>GitHub로 이동</button></form>
<script>document.getElementById('f').submit()</script>`),
    );
    return;
  }
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  if (url.searchParams.get('state') !== state) return res.writeHead(400).end('state mismatch');

  const r = await fetch(`https://api.github.com/app-manifests/${url.searchParams.get('code')}/conversions`, {
    method: 'POST',
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!r.ok) {
    res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' }).end(page(`<p>실패: ${r.status}</p>`));
    console.error(`conversion 실패: ${r.status} ${await r.text()}`);
    process.exitCode = 1;
    return server.close();
  }
  const app = await r.json();
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  text = setEnv(text, 'GITHUB_APP_ID', app.id);
  text = setEnv(text, 'GITHUB_APP_SLUG', app.slug);
  text = setEnv(text, 'GITHUB_APP_CLIENT_ID', app.client_id);
  text = setEnv(text, 'GITHUB_APP_CLIENT_SECRET', app.client_secret);
  text = setEnv(text, 'GITHUB_APP_PRIVATE_KEY', `"${app.pem.trim().replace(/\r?\n/g, '\\n')}"`);
  writeFileSync(ENV_FILE, text);

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(
    page(`<p>GitHub App <b>${escapeHtml(app.slug)}</b>을 만들었습니다. 이 창은 닫아도 됩니다.</p>`),
  );
  console.log(JSON.stringify({ id: app.id, slug: app.slug, html_url: app.html_url, owner: app.owner?.login, permissions: app.permissions }, null, 2));
  console.log('.env.local에 GITHUB_APP_* 값을 저장했습니다.');
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  const start = `http://localhost:${PORT}/`;
  console.log(`브라우저에서 ${start} 를 엽니다. 열리지 않으면 직접 여세요.`);
  exec(process.platform === 'win32' ? `start "" "${start}"` : `open "${start}" || xdg-open "${start}"`);
});
