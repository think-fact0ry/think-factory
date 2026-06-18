// 네이버 블로그(think5007) → activities/posts.json + 썸네일 동기화
// 원칙(2026-06-11 확정): 블로그=원본, 홈피=거울. 텍스트 재작성 금지(형식만).
// 사용: node tools/sync-blog.mjs   (레포 루트에서)
// 제외: activities/exclude.json 에 logNo 문자열 배열 — 홈피에서만 숨김 (블로그는 그대로)
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { createWriteStream, statSync, renameSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import { extractPostBody, firstText } from './extract-post.mjs';
import { renderPost } from './render-post.mjs';

const execFileP = promisify(execFile);
// ffmpeg 탐지(부모 레포 veo 또는 PATH). 있으면 본문 이미지 재압축(211MB→~28MB), 없으면 원본 유지 = 순수 node 동작.
let FFMPEG = null;
async function detectFfmpeg() {
  const local = fileURLToPath(new URL('../../../tools/veo/node_modules/ffmpeg-static/ffmpeg.exe', import.meta.url));
  for (const bin of [local, 'ffmpeg']) {
    try { await execFileP(bin, ['-version']); return bin; } catch {}
  }
  return null;
}
async function recompress(fsPath) {
  if (!FFMPEG) return;
  const tmp = `${fsPath}.opt.jpg`;
  try {
    await execFileP(FFMPEG, ['-y', '-i', fsPath, '-vf', "scale='min(900,iw)':-2", '-q:v', '4', tmp]);
    if (statSync(tmp).size > 0 && statSync(tmp).size < statSync(fsPath).size) renameSync(tmp, fsPath);
    else unlinkSync(tmp);
  } catch { try { unlinkSync(tmp); } catch {} }
}

const BLOG_ID = 'think5007';
const API = `https://m.blog.naver.com/api/blogs/${BLOG_ID}/post-list`;
const OUT_DIR = new URL('../activities/', import.meta.url);
const IMG_DIR = new URL('../activities/img/', import.meta.url);
const POSTS_DIR = new URL('../activities/posts/', import.meta.url);     // 개별 글 HTML
const BODYIMG_DIR = new URL('../activities/posts/img/', import.meta.url); // 본문 이미지
const SITE = 'https://think-factory.kr';
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

// 본문 이미지: src 해시로 파일명(안 바뀐 건 스킵, 편집으로 새 이미지면 새 파일). w800으로 받음(모바일 적정).
async function downloadBodyImg(src, destFile) {
  const res = await fetch(`${src}?type=w800`, { headers: HEADERS });
  if (!res.ok) throw new Error(`body img HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destFile));
}
const srcHash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

// 한 글: 본문 추출 → 이미지 로컬화(그룹=여러 장 전부) → 페이지 렌더·저장. 반환 = 성공 여부.
async function buildPostPage(post) {
  let body;
  try { body = await extractPostBody(post.logNo); }
  catch (e) { console.warn(`본문 실패 ${post.logNo}: ${e.message}`); return false; }
  const dir = new URL(`${post.logNo}/`, BODYIMG_DIR);
  await mkdir(dir, { recursive: true });
  let firstImg = null, imgIdx = 0;
  for (const b of body.blocks) {
    if (b.kind !== 'images') continue;
    const locals = [];
    for (const src of b.srcs) {
      imgIdx++;
      const name = `${srcHash(src)}.jpg`;
      const destFile = new URL(name, dir);
      if (!(await exists(destFile))) {
        try { await downloadBodyImg(src, destFile); await recompress(fileURLToPath(destFile)); }
        catch (e) { console.warn(`  이미지 실패 ${post.logNo} #${imgIdx}: ${e.message}`); continue; }
      }
      const local = `img/${post.logNo}/${name}`;            // 페이지(posts/<logNo>.html) 기준 상대
      locals.push(local);
      if (!firstImg) firstImg = `${SITE}/activities/posts/${local}`;
    }
    b.locals = locals;
    b.alt = `${post.title} 활동 사진`;
  }
  const blocks = body.blocks.filter((b) => b.kind !== 'images' || (b.locals && b.locals.length));
  const desc = firstText(blocks) || post.excerpt;
  // 해시태그 문단 → keywords 메타(네이버 검색 보조; 구글은 keywords 무시하나 무해)
  const tagLine = blocks.flatMap((b) => (b.paras || []).map((p) => p.text)).find((t) => /^#\S/.test(t || '')) || '';
  const keywords = tagLine ? [...tagLine.matchAll(/#(\S+)/g)].map((m) => m[1]).slice(0, 20).join(', ') : '';
  await writeFile(new URL(`${post.logNo}.html`, POSTS_DIR), renderPost(post, blocks, desc, firstImg, keywords), 'utf8');
  return true;
}

FFMPEG = await detectFfmpeg();
if (!FFMPEG) console.warn('⚠️ ffmpeg 없음 — 본문 이미지 원본(w800) 유지, 용량 큼. 부모 레포 tools/veo 설치 또는 PATH에 ffmpeg 필요.');

// 단일 글 테스트: node tools/sync-blog.mjs <logNo> — 그 글 페이지만 생성(목록·posts.json·sitemap 미변경)
const testLogNo = (process.argv[2] || '').match(/^\d+$/) ? process.argv[2] : null;
if (testLogNo) {
  let meta = null;
  try { meta = (JSON.parse(await readFile(new URL('posts.json', OUT_DIR), 'utf8')).posts || []).find((p) => String(p.logNo) === testLogNo); } catch {}
  const post = meta || { logNo: testLogNo, title: `글 ${testLogNo}`, date: '', tag: '', url: `https://blog.naver.com/${BLOG_ID}/${testLogNo}`, excerpt: '' };
  await mkdir(POSTS_DIR, { recursive: true });
  await mkdir(BODYIMG_DIR, { recursive: true });
  const ok = await buildPostPage(post);
  console.log(ok ? `테스트 페이지 생성: activities/posts/${testLogNo}.html` : '실패');
  process.exitCode = ok ? 0 : 1;
}

if (!testLogNo) {                                  // ── 전체 동기화 (자연 종료, process.exit 회피) ──
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
    posts.push({ ...old, ...lines, lastSeen, _retained: true }); // 목록 API 누락분 — 본문 추출도 실패하면 확정 삭제로 간주(아래)
    retained++;
  } else {
    expired++;
  }
}
if (retained) console.log(`목록 API 누락이지만 유지: ${retained}건 (${KEEP_UNSEEN_DAYS}일 유예)`);
if (expired) console.log(`장기 미목격 제거(삭제 간주): ${expired}건`);

posts.sort((a, b) => b.ts - a.ts);

// ── 개별 글 본문 페이지 + 본문 이미지 (SEO: 구글이 우리 도메인을 유일 소스로 색인). posts.json 쓰기 전에 빌드 ──
await mkdir(POSTS_DIR, { recursive: true });
await mkdir(BODYIMG_DIR, { recursive: true });
const builtSet = new Set();
for (const p of posts) {
  if (await buildPostPage(p)) builtSet.add(p.logNo);
  await new Promise((r) => setTimeout(r, 200)); // 예의상 간격
}
// 목록 API 누락 + 본문 추출도 실패 = 확정 삭제 → 즉시 드롭(유예 무시). 그 외는 유지하고 page 플래그 부여.
// 빌드 성공 = 글이 살아있다는 신호 → lastSeen 갱신(목록 API가 살아있는 글을 오래 빠뜨려도 30일 유예에 안 걸려 사라지지 않게).
let ghostDropped = 0;
const finalPosts = posts
  .filter((p) => { if (p._retained && !builtSet.has(p.logNo)) { ghostDropped++; return false; } return true; })
  .map(({ _retained, ...p }) => ({ ...p, lastSeen: builtSet.has(p.logNo) ? Date.now() : p.lastSeen, page: builtSet.has(p.logNo) }));
console.log(`개별 글 페이지: ${builtSet.size}/${posts.length}건` + (ghostDropped ? ` · 삭제확정 드롭 ${ghostDropped}건` : ''));

await writeFile(new URL('posts.json', OUT_DIR), JSON.stringify({ generated: new Date().toISOString(), count: finalPosts.length, posts: finalPosts }, null, 1), 'utf8');
console.log(`posts.json: ${finalPosts.length}건 (제외 ${excludeSet.size}건, 새 썸네일 ${newThumbs}장)`);

// ── sitemap.xml — 고정 5페이지 + 실제 빌드된 활동 글만 ──
const staticUrls = ['/', '/story.html', '/services.html', '/activities.html', '/contact.html'];
const smUrls = [
  ...staticUrls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`),
  ...finalPosts.filter((p) => p.page).map((p) => `  <url><loc>${SITE}/activities/posts/${p.logNo}.html</loc><lastmod>${p.date.replace(/\./g, '-')}</lastmod></url>`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- 활동 글 URL은 tools/sync-blog.mjs가 자동 생성 -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${smUrls.join('\n')}\n</urlset>\n`;
await writeFile(new URL('../sitemap.xml', OUT_DIR), sitemap, 'utf8');
console.log(`sitemap.xml: ${smUrls.length}개 URL`);

} // end 전체 동기화
