# PWA 아이콘 — 팀 작업 현황 3D 오피스

3D 방 시안과 같은 Three.js 장면에서 렌더링한 오리지널 아이콘입니다 (파스텔 미니 방 + 냥냥 캐릭터).
작은 크기(16~48px)는 3D 렌더가 뭉개지므로 단순화한 `icon.svg`에서 만들었습니다.

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| `icon-192.png`, `icon-512.png` | 192 / 512 | manifest `purpose: "any"` |
| `icon-maskable-192.png`, `icon-maskable-512.png` | 192 / 512 | manifest `purpose: "maskable"` (그림이 가운데 64% 안전 영역 안) |
| `icon-1024.png` | 1024 | 스토어·홍보용 원본 |
| `apple-touch-icon.png` | 180 | iOS 홈 화면 (불투명) |
| `favicon.ico` | 16·32·48 | 브라우저 탭 |
| `favicon-16.png`, `favicon-32.png` | 16 / 32 | 브라우저 탭 (PNG) |
| `icon.svg` | 벡터 | 브라우저 탭(SVG 지원 브라우저), 단순화 버전 |

## Next.js (App Router) 적용

1. 파일을 `public/icons/`에 복사하고, `favicon.ico`는 `app/favicon.ico`로 교체합니다.
2. `public/manifest.webmanifest` 생성:

```json
{
  "name": "팀 작업 현황 3D 오피스",
  "short_name": "팀 오피스",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FBF1EE",
  "theme_color": "#FBF1EE",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

3. `app/layout.tsx`:

```ts
export const metadata: Metadata = {
  title: '팀 작업 현황 3D 오피스',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};
export const viewport: Viewport = { themeColor: '#FBF1EE' };
```

`theme_color`·`background_color`는 design-guide.md의 `--bg`(#FBF1EE)와 같습니다.
