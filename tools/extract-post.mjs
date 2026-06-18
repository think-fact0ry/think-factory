// 네이버 블로그 본문 추출 — 순서 보존(텍스트/이미지/구분선) 블록 배열로.
// 원칙(2026-06-11): 블로그=원본, 홈피=거울. 텍스트 재작성 금지(형식만).
// import 해서 extractPostBody(logNo) 사용. 직접 실행 시 한 글 덤프(검증용): node tools/extract-post.mjs <logNo>

const BLOG_ID = 'think5007';
const H = { Referer: `https://m.blog.naver.com/${BLOG_ID}`, 'User-Agent': 'Mozilla/5.0 (think-factory.kr sync)' };

// HTML 엔티티 디코드 (본문에 자주 나오는 것 + 숫자 참조)
function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

// 태그 제거 + 엔티티 디코드 + 제로폭/공백 정리
function cleanText(html) {
  let t = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  t = decodeEntities(t);
  t = t.replace(/​/g, '').replace(/ /g, ' ');     // zero-width, nbsp
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

// 첫 se-main-container를 div 깊이 카운팅으로 정확히 잘라냄(정규식 split보다 견고 — 중첩 div 안전)
function sliceMainContainer(html) {
  const anchor = html.indexOf('class="se-main-container"');
  if (anchor < 0) return '';
  const open = html.lastIndexOf('<div', anchor);
  if (open < 0) return '';
  const re = /<(\/?)div\b/g;
  re.lastIndex = open;
  let depth = 0, m;
  while ((m = re.exec(html)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index);
  }
  return html.slice(open); // 닫힘 못 찾으면 끝까지(방어)
}

// 컨테이너 내부를 se-component 단위로 순서대로 순회 → 블록 배열
function parseComponents(container) {
  const re = /class="se-component (se-[a-z]+)/g;
  const marks = [];
  let m;
  while ((m = re.exec(container)) !== null) marks.push({ type: m[1], at: m.index });
  const blocks = [];
  for (let k = 0; k < marks.length; k++) {
    const type = marks[k].type;
    const seg = container.slice(marks[k].at, k + 1 < marks.length ? marks[k + 1].at : container.length);
    if (type === 'se-text') {
      const paras = [...seg.matchAll(/<p class="se-text-paragraph[^>]*>([\s\S]*?)<\/p>/g)]
        .map((x) => cleanText(x[1]))
        .filter((s) => s !== '');
      if (paras.length) blocks.push({ kind: 'text', paras });
    } else if (type === 'se-image') {
      let src = '';
      const ld = seg.match(/data-linkdata='([^']+)'/);     // 원본(type 파라미터 없음) 우선
      if (ld) { try { src = JSON.parse(ld[1]).src || ''; } catch {} }
      if (!src) { const lz = seg.match(/data-lazy-src="([^"]+)"/); if (lz) src = lz[1]; }
      if (src) {
        src = src.replace(/\?type=[^"&']*$/, '');           // type 꼬리 제거 → 다운로드 시 우리가 w800 지정
        blocks.push({ kind: 'image', src });
      }
    } else if (type === 'se-horizontal') {
      blocks.push({ kind: 'hr' });
    }
    // se-oglink(외부 링크카드)·se-places(지도)·se-document(래퍼)는 미러 대상 아님 → 무시
  }
  return blocks;
}

// 본문 블록에서 SEO description용 텍스트 ~limit자 추출 (여러 문단 이어붙임, 해시태그 줄 제외)
export function firstText(blocks, limit = 160) {
  const parts = [];
  let len = 0;
  for (const b of blocks) {
    if (b.kind !== 'text') continue;
    for (const p of b.paras) {
      if (/^#\S/.test(p)) continue;                 // 해시태그 줄 제외
      const clean = p.replace(/\s+/g, ' ').trim();
      if (clean.length < 2) continue;
      parts.push(clean);
      len += clean.length + 1;
      if (len >= limit) break;
    }
    if (len >= limit) break;
  }
  return parts.join(' ').slice(0, limit).trim();
}

export async function extractPostBody(logNo) {
  const url = `https://m.blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) throw new Error(`PostView HTTP ${res.status} (${logNo})`);
  const html = await res.text();
  const container = sliceMainContainer(html);
  if (!container) throw new Error(`se-main-container 없음 (${logNo})`);
  const blocks = parseComponents(container);
  const images = blocks.filter((b) => b.kind === 'image').length;
  const textParas = blocks.filter((b) => b.kind === 'text').reduce((n, b) => n + b.paras.length, 0);
  return { blocks, images, textParas };
}

// --- 직접 실행 시에만 검증 덤프 (import 시엔 미실행). 표준 main-module 판별 ---
import { pathToFileURL } from 'url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const logNo = process.argv[2] || '224311932764';
  extractPostBody(logNo).then(({ blocks, images, textParas }) => {
    console.log(`logNo ${logNo}: 블록 ${blocks.length}개 (텍스트문단 ${textParas}, 이미지 ${images})\n`);
    blocks.forEach((b, i) => {
      if (b.kind === 'text') console.log(`[${i}] TEXT(${b.paras.length}): ${b.paras[0].slice(0, 60)}${b.paras[0].length > 60 ? '…' : ''}`);
      else if (b.kind === 'image') console.log(`[${i}] IMG: ${b.src.slice(0, 80)}`);
      else console.log(`[${i}] ${b.kind.toUpperCase()}`);
    });
  }).catch((e) => { console.error('ERR', e.message); process.exit(1); });
}
