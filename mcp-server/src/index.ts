import { createHttpServer } from './server.ts';
import { startSyncLoop } from './sync.ts';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';

createHttpServer().listen(port, host, () => console.log(`team-office MCP: http://${host}:${port}/mcp`));

// F17 칸반 동기화. 0이면 끈다. GraphQL 한도(시간당 5,000 points)에 비해 회당 2~3 points라 30초까지 허용
const seconds = Number(process.env.GITHUB_SYNC_SECONDS ?? 45);
if (seconds > 0) {
  const every = Math.max(30, seconds);
  startSyncLoop(every);
  console.log(`GitHub Projects 동기화: ${every}초마다`);
}
