import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY 환경 변수가 필요합니다 (.env.example 참고)');

// secret 키는 RLS를 우회한다. 접근 제어는 tools.ts의 조원 검사가 맡는다.
export const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type DataOf<R> = R extends { data: infer D } ? D : never;

/** 쓰기(insert/update/upsert/delete): error면 throw */
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
