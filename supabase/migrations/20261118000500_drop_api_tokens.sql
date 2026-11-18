-- MCP 인증을 개인 토큰에서 Supabase OAuth 2.1 서버(Claude Code·로컬 수집기 공통)로 바꿨다 (2026-11-18 사용자 요청).
-- 토큰은 Supabase Auth가 발급·보관·폐기하고, MCP 서버는 그 토큰의 세션을 확인해 members.auth_user_id로 조원을 찾는다.
drop table public.api_tokens;
