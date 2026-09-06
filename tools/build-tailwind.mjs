// static/tailwind.css 재생성기
// ㄴ 기존엔 cdn.tailwindcss.com(400KB 스크립트가 브라우저에서 CSS 컴파일)을 썼음. 초기 렌더 막던 주범
// ㄴ index.html 에 Tailwind 클래스 추가하거나 지우면 이거 돌릴 것: node tools/build-tailwind.mjs
import { execFileSync, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'static', 'tailwind.css');
const VERSION = '3.4.17';   // Play CDN이 서빙하던 버전. 올리면 산출물 달라질 수 있음

const WIN = process.platform === 'win32';

const args = [
  '--yes', `tailwindcss@${VERSION}`,
  '-c', path.join(HERE, 'tailwind.config.js'),
  '-i', path.join(HERE, 'tailwind-input.css'),
  '-o', OUT,
  '--minify',
];

// Windows는 npx가 .cmd라 셸을 거쳐야 함
// ㄴ 근데 execFileSync에 shell:true면 인자 배열을 그냥 이어붙여서 경로에 공백 있으면 거기서 잘림
// ㄴ 이 저장소 경로가 딱 그럼("바탕 화면"). 그래서 따옴표까지 직접 붙인 문자열로 넘김
if (WIN) execSync(['npx', ...args].map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' '),
  { stdio: 'inherit', cwd: HERE });
else execFileSync('npx', args, { stdio: 'inherit', cwd: HERE });

console.log('\n생성:', OUT);
