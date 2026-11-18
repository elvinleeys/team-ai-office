'use client';

import { useState } from 'react';

/** 코드 블록 + 복사 버튼. 누르면 1.6초 동안 "복사됨" (design-guide 3.8) */
export function CopyCode({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="code">
      <code>{text}</code>
      <button type="button" className="btn" aria-live="polite" onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}>{done ? '복사됨' : '복사'}</button>
    </div>
  );
}
