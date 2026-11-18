import 'server-only';
// 방별 GitHub PAT 암호화 (AES-256-GCM). mcp-server/src/secret.ts와 같은 형식이다 — 바꾸면 둘 다 고친다.
// 형식: v1:<iv b64>:<tag b64>:<암호문 b64>. room_id를 AAD로 묶어 다른 방 행으로 옮겨 붙이면 복호화가 실패한다.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const k = Buffer.from(process.env.GITHUB_TOKEN_ENC_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('GITHUB_TOKEN_ENC_KEY(32바이트 base64) 환경 변수가 필요합니다');
  return k;
}

export function encryptSecret(plain: string, roomId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv).setAAD(Buffer.from(roomId));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(enc: string, roomId: string): string {
  const [v, iv, tag, ct] = enc.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('알 수 없는 암호문 형식');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')).setAAD(Buffer.from(roomId));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
