'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

/** 로그인 사용자 권한 브라우저 클라이언트. 읽기만 하고 접근 제어는 RLS에 맡긴다 (@supabase/ssr이 싱글턴으로 돌려준다) */
export const supabaseBrowser = () =>
  createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
