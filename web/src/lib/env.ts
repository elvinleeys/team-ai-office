import 'server-only';

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경 변수가 필요합니다 (.env.example 참고)`);
  return v;
}

export const env = {
  supabaseUrl: need('NEXT_PUBLIC_SUPABASE_URL'),
  supabasePublishableKey: need('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  get supabaseSecretKey() { return need('SUPABASE_SECRET_KEY'); },
  get githubAppClientId() { return need('GITHUB_APP_CLIENT_ID'); },
  // .env에는 줄바꿈을 \n으로 적는다
  get githubAppPrivateKey() { return need('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'); },
  get githubAppSlug() { return need('GITHUB_APP_SLUG'); },
  // 끝의 /는 뗀다 (`${siteUrl}/auth/callback`이 //auth/callback이 되어 Supabase 허용 주소와 어긋나지 않게)
  siteUrl: (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  mcpServerUrl: process.env.MCP_SERVER_URL ?? 'http://127.0.0.1:8787/mcp',
};
