import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '../database.types';
import { env } from '../env';

/** 로그인 사용자 권한 클라이언트. 읽기 전용으로 쓰고 RLS가 접근을 제어한다. */
export async function supabaseUser() {
  const store = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts가 한다.
        }
      },
    },
  });
}

let adminClient: ReturnType<typeof createClient<Database>> | undefined;

/** secret 키 클라이언트 (RLS 우회). 서버 액션·Route Handler의 쓰기에만 쓴다. */
export function supabaseAdmin() {
  adminClient ??= createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

type DataOf<R> = R extends { data: infer D } ? D : never;

/** 쓰기: error면 throw */
export function check(r: { error: unknown }): void {
  if (r.error) throw r.error;
}
/** 결과가 반드시 있어야 하는 조회 */
export function must<R extends { data: unknown; error: unknown }>(r: R): NonNullable<DataOf<R>> {
  check(r);
  if (r.data === null) throw new Error('no data');
  return r.data as NonNullable<DataOf<R>>;
}
/** maybeSingle 조회: 없으면 null */
export function maybe<R extends { data: unknown; error: unknown }>(r: R): DataOf<R> {
  check(r);
  return r.data as DataOf<R>;
}
