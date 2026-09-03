// static/tailwind.css 재생성기
// ㄴ 기존엔 cdn.tailwindcss.com(400KB 스크립트가 브라우저에서 CSS 컴파일)을 썼음. 초기 렌더 막던 주범
// ㄴ index.html 에 Tailwind 클래스 추가하거나 지우면 이거 돌릴 것: node tools/build-tailwind.mjs
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'static', 'tailwind.css');
const VERSION = '3.4.17';   // Play CDN이 서빙하던 버전. 올리면 산출물 달라질 수 있음

execFileSync('npx', [
  '--yes', `tailwindcss@${VERSION}`,
  '-c', path.join(HERE, 'tailwind.config.js'),
  '-i', path.join(HERE, 'tailwind-input.css'),
  '-o', OUT,
  '--minify',
], { stdio: 'inherit', cwd: HERE, shell: process.platform === 'win32' });

console.log('\n생성:', OUT);
