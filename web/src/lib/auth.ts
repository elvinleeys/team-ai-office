import 'server-only';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { maybe, supabaseAdmin, supabaseUser } from './supabase/server';

export type Me = { id: string; github_login: string; name: string | null; avatar_url: string | null };

/** 현재 로그인한 조원. 로그인 안 했으면 null. getUser()는 Auth 서버로 토큰을 검증한다. */
export async function getMe(): Promise<Me | null> {
  // supabase auth는 내부에서 Date.now()를 쓴다. cacheComponents 사전 렌더링에서 멈추지 않도록 요청 시점까지 미룬다.
  await connection();
  const { data } = await (await supabaseUser()).auth.getUser();
  if (!data.user) return null;
  return maybe(
    await supabaseAdmin().from('members').select('id, github_login, name, avatar_url').eq('auth_user_id', data.user.id).maybeSingle(),
  );
}

/** 서버 액션용: 로그인 안 했으면 첫 화면으로 */
export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/');
  return me;
}

/** GitHub 사용자 토큰 쿠키. 로그인 콜백에서 저장한다 (GitHub App 사용자 토큰, 8시간 유효) */
export const GH_TOKEN_COOKIE = 'gh_token';

/** 요청 시각 (서버 컴포넌트에서 만료 비교용). 렌더 중 Date.now()를 직접 부르지 않고 요청당 한 번 정한다 */
export async function requestNow(): Promise<number> {
  await connection();
  return Date.now();
}

/** 로그인 후 돌아갈 경로 (MCP 연결 동의 화면에서 로그인할 때). signIn이 저장하고 로그인 콜백이 읽는다 */
export const LOGIN_NEXT_COOKIE = 'login_next';
