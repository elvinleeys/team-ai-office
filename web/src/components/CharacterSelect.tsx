'use client';

// 캐릭터·파트 선택 (시안 v3 CharacterSelect.dc.html). 방별, 캐릭터·파트 모두 필수, 기본값 없음.
import { useState } from 'react';
import { chooseCharacter } from '@/app/actions';
import { CHARACTER_IDS, CHARACTERS, type CharacterId, type Part, PARTS } from '@/constants/office';
import { I24 } from './ui';

const PART_ICON = { code: 'code', brush: 'brush', clipboard: 'clipboard' } as const;

/* eslint-disable @next/next/no-img-element -- 정적 스프라이트 (public/v2) */
export function CharacterSelect({ roomId, current, inUse }: {
  roomId: string;
  current: { character: CharacterId | null; part: Part | null };
  inUse: Record<string, number>; // 캐릭터별 이 방 사용 인원
}) {
  const [character, setCharacter] = useState<CharacterId | null>(current.character);
  const [part, setPart] = useState<Part | null>(current.part);
  const missing = !character && !part ? '캐릭터와 파트를 골라주세요' : !character ? '캐릭터를 골라주세요' : !part ? '파트를 골라주세요' : null;
  return (
    <form action={chooseCharacter.bind(null, roomId)} className="stack" style={{ gap: 26 }}>
      <input type="hidden" name="avatar" value={character ?? ''} />
      <input type="hidden" name="part" value={part ?? ''} />
      <section aria-labelledby="char-h" className="stack" style={{ gap: 12 }}>
        <h2 id="char-h" className="t-h2" style={{ fontSize: 16 }}>1. 캐릭터</h2>
        <div className="cards" role="group" aria-label="캐릭터 선택">
          {CHARACTER_IDS.map((id) => {
            const c = CHARACTERS[id];
            const on = character === id;
            const n = inUse[id] ?? 0;
            return (
              <button key={id} type="button" className="pick char-pick" aria-pressed={on} onClick={() => setCharacter(id)}
                aria-label={`${c.name}, ${c.desc}${n ? `, 사용 중 ${n}명` : ''}`}>
                <span className="char-stage" style={{ background: c.cardBg }}>
                  <span className="floor" />
                  {part && <img className="prop" src={`/v2/props/${part}.png`} alt="" />}
                  <img className="sprite" src={`/v2/characters/${id}${part ? `-${part}` : ''}.png`} alt="" style={{ left: part ? '64%' : '50%' }} />
                  {on && <span className="check-badge"><I24 name="check" stroke={3} /></span>}
                  {n > 0 && <span className="in-use">사용 중 {n}명</span>}
                </span>
                <span className="stack" style={{ gap: 2, padding: '12px 14px 14px' }}>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{c.name}</span>
                  <span className="t-cap">{c.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="part-h" className="stack" style={{ gap: 12 }}>
        <h2 id="part-h" className="t-h2" style={{ fontSize: 16 }}>2. 파트</h2>
        <div className="parts" role="group" aria-label="파트 선택">
          {(Object.keys(PARTS) as Part[]).map((id) => {
            const p = PARTS[id];
            const on = part === id;
            return (
              <button key={id} type="button" className="pick part-pick" aria-pressed={on} onClick={() => setPart(id)}>
                <span className="part-icon" style={{ background: p.bg, color: p.text }}><I24 name={PART_ICON[p.icon]} size={22} stroke={2.3} /></span>
                <span className="stack" style={{ flex: 1, gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{p.label}</span>
                  <span className="t-cap">{p.short}</span>
                </span>
                {on && <span className="check-badge" style={{ width: 26, height: 26 }}><I24 name="check" size={14} stroke={3} /></span>}
              </button>
            );
          })}
        </div>
      </section>

      <footer className="select-footer">
        <div className="stack" style={{ gap: 2 }}>
          <span className="t-cap">선택한 조합</span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{character ? CHARACTERS[character].name : '캐릭터 미선택'} · {part ? PARTS[part].label : '파트 미선택'}</span>
          <span className="t-cap">같은 캐릭터를 여러 명이 골라도 괜찮아요. 이름표와 파트 배지로 구분돼요.</span>
        </div>
        {missing
          ? <button type="button" className="btn btn-lg" disabled aria-disabled>{missing}</button>
          : <button type="submit" className="btn btn-primary btn-lg">방에 입장하기<I24 name="arrow" size={18} stroke={2.6} /></button>}
      </footer>
    </form>
  );
}
