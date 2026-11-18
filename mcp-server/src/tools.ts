import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, must, maybe, check } from './db.ts';

const STATUS = z.enum(['coding', 'meeting', 'break', 'done']);
const MODE = z.enum(['timed', 'pinned']);
const REPO = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'owner/name 형식이어야 합니다')
  .describe('GitHub 저장소 owner/name. 현재 폴더의 git remote origin에서 가져온다');
const TASK = z.string().trim().max(200);
const PCT = z.number().min(0).max(100);

/** 사용자에게 그대로 보여줘도 되는 오류 */
class UserError extends Error {}

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const text = (s: string, isError = false): Result => ({ content: [{ type: 'text', text: s }], isError });
const json = (data: unknown): Result => text(JSON.stringify(data, null, 2));

/** 핸들러 오류 처리: UserError는 메시지 그대로, 나머지는 서버 로그에만 남긴다 */
function safe<A>(fn: (args: A) => Promise<Result>) {
  return async (args: A): Promise<Result> => {
    try {
      return await fn(args);
    } catch (e) {
      if (e instanceof UserError) return text(e.message, true);
      console.error(e);
      return text('서버 오류가 발생했습니다.', true);
    }
  };
}

const now = () => new Date().toISOString();

export function registerTools(server: McpServer, me: string) {
  async function assertActiveMember(roomId: string, label: string) {
    const rm = maybe(await db.from('room_members').select('active').eq('room_id', roomId).eq('member_id', me).maybeSingle());
    if (!rm?.active) throw new UserError(`${label} 방의 조원이 아닙니다.`);
  }

  async function roomOf(repo: string): Promise<string> {
    // GitHub 저장소 이름은 대소문자 무시. REPO 정규식상 LIKE 특수문자는 _ 뿐이다.
    const room = maybe(await db.from('rooms').select('id').ilike('full_name', repo.replace(/_/g, '\\_')).maybeSingle());
    if (!room) throw new UserError(`${repo} 방이 없습니다. 웹에서 먼저 방을 만드세요.`);
    await assertActiveMember(room.id, repo);
    return room.id;
  }

  server.registerTool(
    'update_status',
    {
      description:
        '내 현재 작업 상태를 직접 선택한다. coding=작업 중, meeting=회의 중, break=휴식 중, done=완료 정리. 사용자가 작업 시작·회의·휴식을 말하면 호출한다. ' +
        '직접 선택은 칸반(GitHub Projects) 상태보다 우선한다. mode=timed는 2시간 뒤 자동 해제, pinned는 release_status로 해제할 때까지 유지.',
      inputSchema: {
        repo: REPO, status: STATUS, task: TASK.describe('지금 하는 작업 한 줄 요약'),
        mode: MODE.default('timed').describe('timed=2시간 후 칸반으로 자동 복귀(기본), pinned=직접 해제할 때까지 유지'),
      },
    },
    safe(async ({ repo, status, task, mode }) => {
      const roomId = await roomOf(repo);
      // 같은 상태·작업이면 started_at을 유지한다 (장기 작업 경고 F9). statuses·logs는 DB 함수가 한 트랜잭션으로 쓴다
      const r = must(await db.rpc('set_status', { p_room: roomId, p_member: me, p_status: status, p_task: task, p_mode: mode }));
      const until = mode === 'pinned' ? '직접 해제할 때까지' : '2시간 동안';
      return text(`${r === 'same' ? '상태 변경 없음' : '상태 변경'}: ${status} · ${task} (${until})`);
    }),
  );

  server.registerTool(
    'log_done',
    {
      description: '작업 완료를 기록하고 내 상태를 done(완료 정리)으로 바꾼다. 사용자가 작업을 끝냈다고 말하면 호출한다.',
      inputSchema: { repo: REPO, task: TASK.min(1).describe('완료한 작업') },
    },
    safe(async ({ repo, task }) => {
      const roomId = await roomOf(repo);
      must(await db.rpc('set_status', { p_room: roomId, p_member: me, p_status: 'done', p_task: task, p_mode: 'timed' }));
      return text(`완료 기록: ${task}`);
    }),
  );

  server.registerTool(
    'release_status',
    {
      description: '직접 선택한 상태를 해제하고 칸반(GitHub Projects) 상태로 돌아간다. 사용자가 "칸반으로 돌아가기", "직접 선택 해제"를 말하면 호출한다.',
      inputSchema: { repo: REPO },
    },
    safe(async ({ repo }) => {
      const roomId = await roomOf(repo);
      const released = must(await db.rpc('release_status', { p_room: roomId, p_member: me }));
      return text(released ? '직접 선택을 해제했습니다. 칸반 상태를 따릅니다 (상태 출처가 manual이면 마지막 값을 유지).' : '해제할 직접 선택이 없습니다.');
    }),
  );

  server.registerTool(
    'get_team_status',
    {
      description: '방(저장소) 전체 조원의 현재 상태(직접 선택·칸반 반영 후 최종값), 작업, HP·MP 사용률, 열린 이슈를 조회한다.',
      inputSchema: { repo: REPO },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ repo }) => {
      const roomId = await roomOf(repo);
      const rms = must(
        await db.from('room_members').select('member_id, members(github_login, name)').eq('room_id', roomId).eq('active', true),
      ) as unknown as { member_id: string; members: { github_login: string; name: string | null } }[];
      const ids = rms.map((r) => r.member_id);
      const [statuses, usage, issues] = await Promise.all([
        db.from('effective_statuses').select('member_id, status, task, started_at, source, expires_at, review, part, card_url, card_number, card_draft, progress_count').eq('room_id', roomId).then(must),
        db.from('usage').select('member_id, hp_pct, mp_pct, hp_resets_at, mp_resets_at, updated_at').in('member_id', ids).then(must),
        db.from('issues').select('id, member_id, title, created_at').eq('room_id', roomId).eq('state', 'open').then(must),
      ]);
      return json(
        rms.map(({ member_id, members }) => {
          const s = statuses.find((x) => x.member_id === member_id);
          const u = usage.find((x) => x.member_id === member_id);
          return {
            github_login: members.github_login,
            name: members.name,
            status: s?.status ?? null,
            task: s?.task ?? null,
            started_at: s?.started_at ?? null,
            // 출처: github(칸반) | manual_timed | manual_pinned. status idle = 칸반에 진행 중 카드 없음(대기)
            source: s?.source ?? null,
            expires_at: s?.expires_at ?? null,
            review: s?.review ?? false,
            part: s?.part ?? null,
            card: s?.card_url || s?.card_draft ? { url: s.card_url, number: s.card_number, draft: s.card_draft, in_progress: s.progress_count } : null,
            usage: u ? { hp_pct: u.hp_pct, mp_pct: u.mp_pct, hp_resets_at: u.hp_resets_at, mp_resets_at: u.mp_resets_at, updated_at: u.updated_at } : null,
            open_issues: issues.filter((i) => i.member_id === member_id).map(({ id, title, created_at }) => ({ id, title, created_at })),
          };
        }),
      );
    }),
  );

  server.registerTool(
    'get_member_history',
    {
      description: '조원의 작업 이력(상태 변경·완료 기록)을 최신순으로 조회한다. github_login을 생략하면 내 이력.',
      inputSchema: {
        repo: REPO,
        github_login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/).optional(),
        days: z.number().int().min(1).max(90).default(7).describe('최근 며칠'),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ repo, github_login, days }) => {
      const roomId = await roomOf(repo);
      let target = me;
      if (github_login) {
        const m = maybe(await db.from('members').select('id').ilike('github_login', github_login).maybeSingle());
        const rm = m && maybe(await db.from('room_members').select('member_id').eq('room_id', roomId).eq('member_id', m.id).maybeSingle());
        if (!rm) throw new UserError(`${github_login}은(는) ${repo} 방의 조원이 아닙니다.`);
        target = m.id;
      }
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const logs = must(
        await db.from('logs').select('status, task, created_at').eq('room_id', roomId).eq('member_id', target)
          .gte('created_at', since).order('created_at', { ascending: false }).limit(200),
      );
      return json(logs);
    }),
  );

  server.registerTool(
    'report_usage',
    {
      description:
        '내 Claude 사용률을 저장한다. hp_pct=주간(7일) 한도 사용률, mp_pct=5시간 한도 사용률. 0=안 씀, 100=한도 소진 (남은 양이 아니라 쓴 양).',
      inputSchema: {
        hp_pct: PCT,
        mp_pct: PCT,
        hp_resets_at: z.iso.datetime({ offset: true }).optional(),
        mp_resets_at: z.iso.datetime({ offset: true }).optional(),
        source: z.enum(['auto', 'self']).default('self').describe('auto=로컬 수집기, self=자기 보고'),
      },
    },
    safe(async ({ hp_pct, mp_pct, hp_resets_at, mp_resets_at, source }) => {
      check(
        await db.from('usage').upsert({
          member_id: me, hp_pct, mp_pct, hp_resets_at: hp_resets_at ?? null, mp_resets_at: mp_resets_at ?? null, source, updated_at: now(),
        }),
      );
      return text(`사용률 저장: HP ${hp_pct}% · MP ${mp_pct}% 사용`);
    }),
  );

  server.registerTool(
    'report_issue',
    {
      description: '막힌 문제를 이슈로 등록한다. 내 캐릭터 머리 위에 ! 배지가 뜬다.',
      inputSchema: { repo: REPO, title: TASK.min(1).describe('막힌 내용 한 줄') },
    },
    safe(async ({ repo, title }) => {
      const roomId = await roomOf(repo);
      const issue = must(await db.from('issues').insert({ room_id: roomId, member_id: me, title }).select('id').single());
      return text(`이슈 #${issue.id} 등록: ${title}`);
    }),
  );

  server.registerTool(
    'resolve_issue',
    {
      description: '이슈를 해결 처리한다. 같은 방 조원 누구나 할 수 있다.',
      inputSchema: { issue_id: z.number().int().positive() },
    },
    safe(async ({ issue_id }) => {
      const issue = maybe(await db.from('issues').select('room_id, state, title').eq('id', issue_id).maybeSingle());
      if (!issue) throw new UserError(`이슈 #${issue_id}가 없습니다.`);
      await assertActiveMember(issue.room_id, `이슈 #${issue_id}의`);
      if (issue.state === 'resolved') throw new UserError(`이슈 #${issue_id}는 이미 해결됐습니다.`);
      check(await db.from('issues').update({ state: 'resolved', resolved_at: now() }).eq('id', issue_id).eq('state', 'open'));
      return text(`이슈 #${issue_id} 해결: ${issue.title}`);
    }),
  );
}
