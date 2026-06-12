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

// 제목 두 줄 분리 — 후보 지점(문장부호 !?,… 또는 이모지 클러스터 + 공백) 중 중앙에 가장 가까운 곳에서 나눔.
// 예: "찰칵! …찍어요 📸 | 날씨 좋은 날 인생네컷 만들기 🎞️" ('찰칵!'은 너무 짧아 제외, 📸 뒤가 중앙 최근접)
function splitTitle(t) {
  const re = /([!?,…]["'’”]?|\p{Extended_Pictographic}(?:[‍️]?\p{Extended_Pictographic}|[‍️])*)\s+/gu;
  const cands = [];
  let m;
  while ((m = re.exec(t)) !== null) cands.push(m.index + m[1].length);
  const mid = t.length / 2;
  let best = -1, bestDist = Infinity;
  for (const c of cands) {
    const l1 = t.slice(0, c).trim(), l2 = t.slice(c).trim();
    if (l1.length < 4 || l2.length < 4) continue;
    const d = Math.abs(c - mid);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  if (best < 0) return { t1: t, t2: '' };
  return { t1: t.slice(0, best).trim(), t2: t.slice(best).trim() };
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

// 이전 결과 로드 — 네이버 목록 API가 살아있는 글을 간헐적으로 빠뜨림(2026-06-12 실측: 67→57건, 누락 글 직접 조회는 200).
// 거울 원칙 유지: API에서 안 보여도 30일까지는 유지, 그 뒤에도 안 보이면 삭제된 것으로 간주하고 제거.
const KEEP_UNSEEN_DAYS = 30;
let prevPosts = [];
try { prevPosts = JSON.parse(await readFile(new URL('posts.json', OUT_DIR), 'utf8')).posts || []; } catch {}
const prevByLogNo = new Map(prevPosts.map((p) => [String(p.logNo), p]));

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
  const lines = splitTitle(title);
  posts.push({
    logNo,
    title,
    t1: lines.t1,
    t2: lines.t2,
    tag,
    category: it.categoryName || '',
    date: fmtDate(it.addDate),
    ts: it.addDate,
    excerpt: String(it.briefContents || '').replace(/\s+/g, ' ').slice(0, 110),
    thumb,
    url: `https://blog.naver.com/${BLOG_ID}/${logNo}`,
    lastSeen: Date.now(),
  });
}

// API에 안 나온 기존 글 병합 (30일 유예)
const seenNow = new Set(posts.map((p) => p.logNo));
let retained = 0, expired = 0;
for (const old of prevPosts) {
  const logNo = String(old.logNo);
  if (seenNow.has(logNo) || excludeSet.has(logNo)) continue;
  const lastSeen = old.lastSeen || Date.now(); // 구버전 데이터엔 lastSeen 없음 → 지금부터 카운트
  if (Date.now() - lastSeen < KEEP_UNSEEN_DAYS * 86400000) {
    const lines = old.t1 ? { t1: old.t1, t2: old.t2 } : splitTitle(old.title); // 구버전 데이터 제목분리 백필
    posts.push({ ...old, ...lines, lastSeen });
    retained++;
  } else {
    expired++;
  }
}
if (retained) console.log(`목록 API 누락이지만 유지: ${retained}건 (${KEEP_UNSEEN_DAYS}일 유예)`);
if (expired) console.log(`장기 미목격 제거(삭제 간주): ${expired}건`);

posts.sort((a, b) => b.ts - a.ts);

await writeFile(new URL('posts.json', OUT_DIR), JSON.stringify({ generated: new Date().toISOString(), count: posts.length, posts }, null, 1), 'utf8');
console.log(`posts.json: ${posts.length}건 (제외 ${excludeSet.size}건, 새 썸네일 ${newThumbs}장)`);
