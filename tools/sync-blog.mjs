// 네이버 블로그(think5007) → activities/posts.json + 썸네일 동기화
// 원칙(2026-06-11 확정): 블로그=원본, 홈피=거울. 텍스트 재작성 금지(형식만).
// 사용: node tools/sync-blog.mjs   (레포 루트에서)
// 제외: activities/exclude.json 에 logNo 문자열 배열 — 홈피에서만 숨김 (블로그는 그대로)
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const BLOG_ID = 'think5007';
const API = `https://m.blog.naver.com/api/blogs/${BLOG_ID}/post-list`;
const OUT_DIR = new URL('../activities/', import.meta.url);
const IMG_DIR = new URL('../activities/img/', import.meta.url);
const HEADERS = { Referer: `https://m.blog.naver.com/${BLOG_ID}`, 'User-Agent': 'Mozilla/5.0 (think-factory.kr sync)' };

function cleanTitle(raw) {
  let t = String(raw || '').trim();
  let tag = '';
  const m = t.match(/^\[([^\]]{1,20})\]\s*/);            // 선두 [카테고리] → 뱃지로 분리
  if (m) { tag = m[1].trim(); t = t.slice(m[0].length); }
  t = t.replace(/\s*[ㅣ|∣｜I]\s*생각공작소\s*$/, '');      // 꼬리표 제거 (유성 OK 2026-06-11)
  t = t.replace(/활동\s*사진/g, '');                        // '활동사진' 제거 (텍스트 다이어트, 2026-06-12)
  t = t.replace(/\s{2,}/g, ' ');
  return { title: t.trim(), tag };
}

function fmtDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

async function fetchPage(page) {
  const res = await fetch(`${API}?categoryNo=0&itemCount=30&page=${page}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`post-list HTTP ${res.status} (page ${page})`);
  const j = await res.json();
  return (j.result && j.result.items) || [];
}

async function exists(url) { try { await access(url); return true; } catch { return false; } }

async function downloadThumb(url, dest) {
  const res = await fetch(url + (url.includes('?') ? '' : '?type=w480'), { headers: HEADERS });
  if (!res.ok) throw new Error(`thumb HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

const all = [];
for (let page = 1; page <= 50; page++) {
  const items = await fetchPage(page);
  if (!items.length) break;
  all.push(...items);
  await new Promise((r) => setTimeout(r, 300)); // 예의상 간격
}
console.log(`수집: ${all.length}건`);

let exclude = [];
try { exclude = JSON.parse(await readFile(new URL('exclude.json', OUT_DIR), 'utf8')); } catch {}
const excludeSet = new Set(exclude.map(String));

await mkdir(IMG_DIR, { recursive: true });
const posts = [];
let newThumbs = 0;
for (const it of all) {
  const logNo = String(it.logNo);
  if (excludeSet.has(logNo)) continue;
  if (it.notOpen || it.postBlocked) continue;        // 비공개·차단 글 제외
  const { title, tag } = cleanTitle(it.titleWithInspectMessage);
  let thumb = null;
  if (it.thumbnailUrl) {
    const dest = new URL(`${logNo}.jpg`, IMG_DIR);
    if (!(await exists(dest))) {
      try { await downloadThumb(it.thumbnailUrl, dest); newThumbs++; }
      catch (e) { console.warn(`썸네일 실패 ${logNo}: ${e.message}`); }
    }
    if (await exists(dest)) thumb = `img/${logNo}.jpg`;
  }
  posts.push({
    logNo,
    title,
    tag,
    category: it.categoryName || '',
    date: fmtDate(it.addDate),
    ts: it.addDate,
    excerpt: String(it.briefContents || '').replace(/\s+/g, ' ').slice(0, 110),
    thumb,
    url: `https://blog.naver.com/${BLOG_ID}/${logNo}`,
  });
}
posts.sort((a, b) => b.ts - a.ts);

await writeFile(new URL('posts.json', OUT_DIR), JSON.stringify({ generated: new Date().toISOString(), count: posts.length, posts }, null, 1), 'utf8');
console.log(`posts.json: ${posts.length}건 (제외 ${excludeSet.size}건, 새 썸네일 ${newThumbs}장)`);
