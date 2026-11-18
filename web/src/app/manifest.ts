import type { MetadataRoute } from 'next';

// PWA: 휴대폰 홈 화면에 설치 (/manifest.webmanifest). 아이콘 원본은 저장소 루트 pwa-icons/, 색은 design-guide --bg(#FBF1EE).
// 서비스 워커는 두지 않는다: 설치에는 manifest + HTTPS면 되고, 캐시가 끼면 실시간 방 화면이 오래된 값을 보여줄 수 있다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '팀 작업 현황 3D 오피스',
    short_name: '팀 오피스',
    description: '대화로 기록한 팀 작업 상태를 3D 방에서 보는 서비스',
    lang: 'ko',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FBF1EE',
    theme_color: '#FBF1EE',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
