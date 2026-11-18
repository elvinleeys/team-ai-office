import { NextResponse, type NextRequest } from 'next/server';
import { GH_TOKEN_COOKIE, LOGIN_NEXT_COOKIE } from '@/lib/auth';
import { env } from '@/lib/env';
import { check, supabaseAdmin, supabaseUser } from '@/lib/supabase/server';

/** GitHub 로그인 콜백: 세션 생성 → members 연결 → GitHub 사용자 토큰 쿠키 저장 */
export async function GET(request: NextRequest) {
  const fail = (reason: string) => NextResponse.redirect(new URL(`/?error=${encodeURIComponent(reason)}`, env.siteUrl));
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return fail(request.nextUrl.searchParams.get('error_description') ?? '로그인이 취소되었습니다.');

  const { data, error } = await (await supabaseUser()).auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    console.error(error);
    return fail('로그인에 실패했습니다.');
  }

  const user = data.user;
  const githubId = Number(user.identities?.find((i) => i.provider === 'github')?.id);
  const login = user.user_metadata.user_name as string | undefined;
  if (!Number.isSafeInteger(githubId) || !login) return fail('GitHub 계정 정보를 읽지 못했습니다.');

  check(
    await supabaseAdmin().from('members').upsert(
      {
        github_id: githubId,
        github_login: login,
        name: (user.user_metadata.full_name as string | undefined) ?? null,
        avatar_url: (user.user_metadata.avatar_url as string | undefined) ?? null,
        auth_user_id: user.id,
      },
      { onConflict: 'github_id' },
    ),
  );

  // MCP 연결 동의 화면에서 로그인했으면 그 화면으로 돌아간다 (signIn이 같은 사이트 경로만 저장한다)
  const next = request.cookies.get(LOGIN_NEXT_COOKIE)?.value;
  const response = NextResponse.redirect(new URL(next?.startsWith('/') && !next.startsWith('//') ? next : '/', env.siteUrl));
  response.cookies.delete(LOGIN_NEXT_COOKIE);
  // 저장소 목록 조회용. Supabase는 provider_token을 보관하지 않으므로 여기서 받아 둔다.
  if (data.session.provider_token) {
    response.cookies.set(GH_TOKEN_COOKIE, data.session.provider_token, {
      httpOnly: true,
      secure: env.siteUrl.startsWith('https'),
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
  }
  return response;
}
