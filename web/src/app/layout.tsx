import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Noto_Sans_KR } from 'next/font/google';
import './office-ui.css';
import './globals.css';

// 시안 v3 design-guide.md 2.6 글꼴. office-ui.css의 --font·--mono가 이 변수를 쓰도록 globals.css에서 연결한다
const noto = Noto_Sans_KR({ weight: ['400', '500', '700', '800'], subsets: ['latin'], variable: '--font-noto', display: 'swap' });
const mono = JetBrains_Mono({ weight: ['400', '600'], subsets: ['latin'], variable: '--font-jb', display: 'swap' });

export const metadata: Metadata = {
  title: '팀 작업 현황 3D 오피스',
  description: '대화로 기록한 팀 작업 상태를 3D 방에서 보는 서비스',
  // 탭 아이콘·iOS 홈 화면 아이콘 (manifest는 app/manifest.ts가 자동으로 연결한다)
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  // iOS Safari '홈 화면에 추가' 후 전체 화면 앱처럼 열기
  appleWebApp: { capable: true, title: '팀 오피스', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#FBF1EE' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`${noto.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
