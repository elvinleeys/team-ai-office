// 테스트·수동 확인 전용: secret 키로 사용자 로그인 세션을 만든다 (매직 링크를 메일 없이 바로 검증). 운영 코드에서 쓰지 않는다.
import { createClient } from '@supabase/supabase-js';
import { db } from '../src/db.ts';

export async function sessionFor(email: string) {
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const v = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
  if (v.error || !v.data.session) throw v.error ?? new Error('세션을 만들지 못했습니다');
  return { client, token: v.data.session.access_token };
}
