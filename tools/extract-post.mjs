// 네이버 블로그 본문 추출 — 순서 보존 + 인라인 서식(볼드·기울임·밑줄·색·크기)·정렬·이미지 그룹 보존.
// 원칙(2026-06-11): 블로그=원본, 홈피=거울. 형식은 최대한 충실히, 단 네이버 raw HTML은 통과시키지 않고
//   화이트리스트로 안전한 태그(strong/em/u/span[style])만 재발행(XSS 차단).
// import 해서 extractPostBody(logNo) 사용. 직접 실행 시 한 글 덤프(검증용): node tools/extract-post.mjs <logNo>
import { pathToFileURL } from 'url';

const BLOG_ID = 'think5007';
const H = { Referer: `https://m.blog.naver.com/${BLOG_ID}`, 'User-Agent': 'Mozilla/5.0 (think-factory.kr sync)' };
const ZW = /[​‌‍﻿]/g;                  // 제로폭 공백류
const INLINE_TAGS = { b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u' }; // 네이버는 볼드=<b>, 기울임=<i>, 밑줄=<u>

// HTML 엔티티 디코드
function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// 색상 화이트리스트(#hex 또는 rgb/rgba 숫자만) — 그 외 거부
function sanitizeColor(c) {
  c = String(c).trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
  const m = c.match(/^rgba?\(\s*[\d.,\s%]+\)$/);
  return m ? c : null;
}
// 인라인 조각 → 안전 HTML: 텍스트는 이스케이프, <br>·서식태그(b/i/u/strong/em→strong/em/u)만 보존, 나머지 태그 버림.
function inlineText(html) {
  const s = String(html);
  const escSeg = (t) => esc(decodeEntities(t).replace(ZW, ''));
  let out = '', last = 0, m;
  const re = /<br\s*\/?>|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out += escSeg(s.slice(last, m.index));
    last = re.lastIndex;
    if (/^<br/i.test(m[0])) { out += '<br>'; continue; }
    const mapped = INLINE_TAGS[m[2].toLowerCase()];
    if (mapped) out += m[1] ? `</${mapped}>` : `<${mapped}>`;
    // 그 외 태그(span 등)는 출력 안 함 — 텍스트만 남김
  }
  if (last < s.length) out += escSeg(s.slice(last));
  return out;
}
// 태그·엔티티 제거한 순수 텍스트(설명·해시태그 판정용). 제로폭 제거.
function plainText(html) {
  return decodeEntities(String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(ZW, '').replace(/\s+/g, ' ').trim();
}

// 한 문단(<p ...>...</p>) → {align, html(안전 인라인), text(순수)}
function parseParagraph(openAttrs, inner) {
  const am = openAttrs.match(/se-text-paragraph-align-(left|center|right|justify)/);
  const align = am && am[1] !== 'left' ? am[1] : '';
  let out = '';
  const re = /<span\b([^>]*)>([\s\S]*?)<\/span>|<br\s*\/?>/gi;
  let last = 0, m;
  while ((m = re.exec(inner)) !== null) {
    if (m.index > last) out += inlineText(inner.slice(last, m.index)); // span 밖 텍스트(서식태그 보존)
    last = re.lastIndex;
    if (/^<br/i.test(m[0])) { out += '<br>'; continue; }
    const attrs = m[1] || '';
    let piece = inlineText(m[2] || '');                                // span 안: 볼드<b> 등 보존
    if (piece === '') continue;
    const bold = /se-weight-bold/.test(attrs);                         // 클래스형 볼드(드묾)도 방어적 지원
    const italic = /se-style-italic/.test(attrs);
    const underline = /se-style-underline/.test(attrs) || /text-decoration\s*:\s*[^;"']*underline/.test(attrs);
    const fsm = attrs.match(/se-fs-fs(\d+)/);
    const size = fsm ? parseInt(fsm[1], 10) : null;
    const cm = attrs.match(/(?:^|[^-])color\s*:\s*([^;"']+)/);
    const color = cm ? sanitizeColor(cm[1]) : null;
    let style = '';
    if (color) style += `color:${color};`;
    if (size && size >= 8 && size <= 60) style += `font-size:${size}px;`;
    if (style) piece = `<span style="${style}">${piece}</span>`;
    if (underline) piece = `<u>${piece}</u>`;
    if (italic) piece = `<em>${piece}</em>`;
    if (bold) piece = `<strong>${piece}</strong>`;
    out += piece;
  }
  if (last < inner.length) out += inlineText(inner.slice(last));
  return { align, html: out, text: plainText(inner) };
}

// se-text / se-quotation 컴포넌트 → 문단 배열. 빈 문단(유성이 의도적으로 띄운 줄)은 보존하되
// 블록 앞뒤 군더더기는 트림, 연속 빈 줄은 1개로 합침(간격은 CSS spacer로).
function parseParas(seg) {
  const re = /<p class="se-text-paragraph([^>]*)>([\s\S]*?)<\/p>/g;
  let m;
  const raw = [];
  while ((m = re.exec(seg)) !== null) raw.push(parseParagraph(m[1], m[2]));
  const paras = [];
  for (const p of raw) {
    if (p.text === '') {
      if (!paras.length || paras[paras.length - 1].text === '') continue; // 선두·연속 빈 줄 합침
      paras.push({ align: '', html: '', text: '', empty: true });
    } else paras.push(p);
  }
  while (paras.length && paras[paras.length - 1].text === '') paras.pop();   // 말미 빈 줄 제거
  return paras;
}

// se-image / se-imageStrip 컴포넌트 → 이미지 항목 배열 {src, ar(종횡비 w/h)} (type 꼬리 제거, src 중복 제거)
function imageItems(seg) {
  const items = [];
  let m;
  const re = /data-linkdata='([^']+)'/g;
  while ((m = re.exec(seg)) !== null) {
    try {
      const d = JSON.parse(m[1]);
      if (!d.src) continue;
      const w = parseInt(d.originalWidth, 10), h = parseInt(d.originalHeight, 10);
      let ar = w > 0 && h > 0 ? w / h : 1;
      ar = Math.max(0.3, Math.min(4, ar));                 // 극단 비율 클램프(레이아웃 방어)
      items.push({ src: d.src.replace(/\?type=[^"&']*$/, ''), ar: +ar.toFixed(3) });
    } catch {}
  }
  if (!items.length) {
    const re2 = /data-lazy-src="([^"]+)"/g;
    while ((m = re2.exec(seg)) !== null) items.push({ src: m[1].replace(/\?type=[^"&']*$/, ''), ar: 1 });
  }
  const seen = new Set();
  return items.filter((it) => !seen.has(it.src) && seen.add(it.src));
}

// 첫 se-main-container를 div 깊이 카운팅으로 정확히 잘라냄(중첩 div 안전)
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
  return html.slice(open);
}

// 컨테이너 → se-component 단위 순회(대소문자 포함) → 블록 배열
function parseComponents(container) {
  const re = /class="se-component (se-[A-Za-z]+)/g;
  const marks = [];
  let m;
  while ((m = re.exec(container)) !== null) marks.push({ type: m[1], at: m.index });
  const blocks = [];
  for (let k = 0; k < marks.length; k++) {
    const type = marks[k].type;
    const seg = container.slice(marks[k].at, k + 1 < marks.length ? marks[k + 1].at : container.length);
    if (type === 'se-text') {
      const paras = parseParas(seg);
      if (paras.length) blocks.push({ kind: 'text', paras });
    } else if (type === 'se-quotation') {
      const paras = parseParas(seg);
      if (paras.length) blocks.push({ kind: 'quote', paras });
    } else if (type === 'se-image') {
      const imgs = imageItems(seg);
      if (imgs.length) blocks.push({ kind: 'images', layout: 'single', imgs });
    } else if (type === 'se-imageStrip' || type === 'se-imageGroup') {
      const imgs = imageItems(seg);
      if (imgs.length) blocks.push({ kind: 'images', layout: imgs.length > 1 ? 'strip' : 'single', imgs });
    } else if (type === 'se-horizontalLine') {
      blocks.push({ kind: 'hr' });
    }
    // se-documentTitle(제목)·se-sticker(이모티콘)·se-oglink(링크카드)·se-placesMap(지도)는 미러 대상 아님
  }
  return blocks;
}

// SEO description용 텍스트 ~limit자 (문단 순수 텍스트 이어붙임, 해시태그 줄 제외)
export function firstText(blocks, limit = 160) {
  const parts = [];
  let len = 0;
  for (const b of blocks) {
    if (b.kind !== 'text' && b.kind !== 'quote') continue;
    for (const p of b.paras) {
      const t = p.text;
      if (!t || /^#\S/.test(t)) continue;
      parts.push(t);
      len += t.length + 1;
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
  const images = blocks.filter((b) => b.kind === 'images').reduce((n, b) => n + b.imgs.length, 0);
  const textParas = blocks.filter((b) => b.kind === 'text' || b.kind === 'quote').reduce((n, b) => n + b.paras.length, 0);
  return { blocks, images, textParas };
}

// --- 직접 실행 시에만 검증 덤프 (import 시엔 미실행) ---
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const logNo = process.argv[2] || '224311932764';
  extractPostBody(logNo).then(({ blocks, images, textParas }) => {
    console.log(`logNo ${logNo}: 블록 ${blocks.length}개 (텍스트문단 ${textParas}, 이미지 ${images})\n`);
    blocks.forEach((b, i) => {
      if (b.kind === 'text' || b.kind === 'quote') console.log(`[${i}] ${b.kind.toUpperCase()}(${b.paras.length}) ${b.paras[0].align || '좌'}: ${b.paras[0].text.slice(0, 50)}`);
      else if (b.kind === 'images') console.log(`[${i}] IMG(${b.layout} x${b.imgs.length}) ar=${b.imgs.map((x) => x.ar).join(',')}`);
      else console.log(`[${i}] ${b.kind.toUpperCase()}`);
    });
  }).catch((e) => { console.error('ERR', e.message); process.exit(1); });
}
