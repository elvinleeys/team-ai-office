// Cloudflare Workers 진입점 (wrangler.jsonc). 요청은 app.ts가 처리하고, 칸반 동기화는 Cron Trigger(1분마다)가 부른다.
// 환경 변수·비밀 값은 nodejs_compat의 process.env로 들어온다 (wrangler vars / secret)
import { handle } from './app.ts';
import { syncAllRooms } from './sync.ts';

type Ctx = { waitUntil(promise: Promise<unknown>): void };

export default {
  fetch: (req: Request) => handle(req),
  scheduled: (_event: unknown, _env: unknown, ctx: Ctx) => ctx.waitUntil(syncAllRooms()),
};
