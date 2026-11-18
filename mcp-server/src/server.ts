// Node 실행용: node:http 요청을 Web 표준 Request로 바꿔 app.ts의 handle에 넘긴다 (Cloudflare Workers는 worker.ts가 바로 부른다)
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { handle } from './app.ts';

export function createHttpServer(publicUrl = process.env.MCP_PUBLIC_URL) {
  return createServer(async (req, res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers,
      ...(hasBody && { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' }),
    } as RequestInit);
    const response = await handle(request, publicUrl);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  });
}
