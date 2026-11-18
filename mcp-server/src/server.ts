import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { db } from './db.ts';
import { registerTools } from './tools.ts';

const MAX_BODY = 1_000_000;
const RESOURCE_METADATA = '/.well-known/oauth-protected-resource';

/**
 * Authorization: Bearer <Supabase 액세스 토큰> → member_id. 토큰은 Supabase OAuth 서버가 MCP 로그인(Claude Code·수집기)에 발급한다.
 * getUser는 Auth 서버에 물어 세션이 살아 있는지까지 본다 (웹에서 연결을 해제하면 바로 거부된다). 로그인한 적 없는 사람은 null
 */
async function authenticate(req: IncomingMessage): Promise<string | null> {
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const { data: m, error } = await db.from('members').select('id').eq('auth_user_id', data.user.id).maybeSingle();
  if (error) throw error;
  return m?.id ?? null;
}

/** MCP 인증 사양(RFC 9728): 이 서버를 쓰려면 어느 인증 서버에서 토큰을 받는지 알려 준다 */
function resourceMetadata(publicUrl: string) {
  return {
    resource: `${publicUrl}/mcp`,
    authorization_servers: [`${process.env.SUPABASE_URL}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'team-office',
  };
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
}

/** publicUrl: 클라이언트가 접속하는 이 서버의 주소 (끝 / 없이). 기본은 MCP_PUBLIC_URL 또는 요청의 Host */
export function createHttpServer(publicUrl = process.env.MCP_PUBLIC_URL) {
  return createServer(async (req, res) => {
    try {
      const path = req.url?.split('?')[0];
      const base = publicUrl ?? `http://${req.headers.host}`;
      if (path === '/health') return sendJson(res, 200, { ok: true });
      if (path === RESOURCE_METADATA || path === `${RESOURCE_METADATA}/mcp`) return sendJson(res, 200, resourceMetadata(base));
      if (path !== '/mcp') return sendJson(res, 404, { error: 'not found' });
      // stateless 모드라 SSE 스트림(GET)·세션 종료(DELETE)는 지원하지 않는다
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' }, { allow: 'POST' });

      const memberId = await authenticate(req);
      if (!memberId) {
        return sendJson(res, 401, { error: '로그인이 필요합니다. Claude Code에서 /mcp → team-office → Authenticate로 로그인하세요.' },
          { 'www-authenticate': `Bearer resource_metadata="${base}${RESOURCE_METADATA}"` });
      }

      const body = await readJson(req);
      const server = new McpServer({ name: 'team-office', version: '0.1.0' });
      registerTools(server, memberId);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'internal error' : (e as Error).message });
    }
  });
}
