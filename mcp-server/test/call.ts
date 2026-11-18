// 수동 확인용: 웹에 로그인한 적 있는 조원으로 MCP tool을 한 번 호출한다 (서버가 켜져 있어야 함)
//   node --env-file=.env test/call.ts <github_login> <tool> '<json args>'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { db, must } from '../src/db.ts';
import { sessionFor } from './session.ts';

const [login, tool, args = '{}'] = process.argv.slice(2);
const m = must(await db.from('members').select('auth_user_id').eq('github_login', login).single());
if (!m.auth_user_id) throw new Error(`${login}은 웹에 로그인한 적이 없습니다`);
const email = must(await db.auth.admin.getUserById(m.auth_user_id)).user?.email;
if (!email) throw new Error(`${login}의 로그인 메일 주소가 없습니다`);
const { token } = await sessionFor(email);
const client = new Client({ name: 'manual-call', version: '0' });
await client.connect(new StreamableHTTPClientTransport(new URL(process.env.MCP_PUBLIC_URL ? `${process.env.MCP_PUBLIC_URL}/mcp` : 'http://127.0.0.1:8787/mcp'),
  { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
const r = await client.callTool({ name: tool, arguments: JSON.parse(args) });
console.log((r.content as { text: string }[]).map((c) => c.text).join('\n'));
await client.close();
