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

// KST(UTC+9) 고정 — 머신 로컬 타임존에 의존하면 CI(UTC)와 로컬(KST)이 자정 근처 글에서 하루 어긋남(churn+오표기).
function fmtDate(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}`;
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
  const imgUrls = [];                                        // 이 글의 모든 본문 이미지 절대 URL(이미지 사이트맵용)
  for (const b of body.blocks) {
    if (b.kind !== 'images') continue;
    const items = [];
    for (const im of b.imgs) {
      imgIdx++;
      const name = `${srcHash(im.src)}.jpg`;
      const destFile = new URL(name, dir);
      if (!(await exists(destFile))) {
        try { await downloadBodyImg(im.src, destFile); await recompress(fileURLToPath(destFile)); }
        catch (e) { console.warn(`  이미지 실패 ${post.logNo} #${imgIdx}: ${e.message}`); continue; }
      }
      const local = `img/${post.logNo}/${name}`;            // 페이지(posts/<logNo>.html) 기준 상대
      items.push({ local, ar: im.ar });
      const absUrl = `${SITE}/activities/posts/${local}`;
      imgUrls.push(absUrl);
      if (!firstImg) firstImg = absUrl;
    }
    b.items = items;
    // 구글 이미지 검색용 키워드 맥락(브랜드+지역+서비스, 전부 정확한 사실 — 스터핑 아님) + 제목
    const ctx = ['생각공작소', '인천', post.tag].filter(Boolean).join(' ');
    b.alt = `${ctx} ${post.title} 활동사진`;
  }
  const blocks = body.blocks.filter((b) => b.kind !== 'images' || (b.items && b.items.length));
  const desc = firstText(blocks) || post.excerpt;
  await writeFile(new URL(`${post.logNo}.html`, POSTS_DIR), renderPost(post, blocks, desc, firstImg), 'utf8');
  return imgUrls;                                            // 성공=이미지 URL 배열(빈 배열도 truthy), 실패=false
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
// 누락분은 본문 빌드 성공 여부로 생존 판정(아래 병합).
let prevPosts = [];
try { prevPosts = JSON.parse(await readFile(new URL('posts.json', OUT_DIR), 'utf8')).posts || []; } catch {}
const prevMap = new Map(prevPosts.map((p) => [String(p.logNo), p]));   // feedTitle(피드 오버레이 제목) 캐시 보존. 삭제/비공개 글은 finalPosts에 없으면 그대로 빠짐 → 지연 0

await mkdir(IMG_DIR, { recursive: true });
const posts = [];
let newThumbs = 0;
for (const it of all) {
  const logNo = String(it.logNo);
  if (excludeSet.has(logNo)) continue;
  // 완전공개 글만 — 비공개·차단·이웃공개·서로이웃공개·전체공개아님 전부 제외(방어심층: 네이버 API가
  // 지금은 익명에 완전공개만 주지만, 정책 변경 대비해 명시적으로 거른다). 프라이버시 누출 방지.
  if (it.notOpen || it.postBlocked || it.buddyOpen || it.bothBuddyOpen || it.allOpenPost === false || it.outSideAllow === false) continue;
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
    feedTitle: prevMap.get(logNo)?.feedTitle,   // 캐시 보존(새 글은 undefined→JSON서 생략, gen-feed-titles.mjs가 클로드로 채움)
  });
}

// 목록 API에 안 나온 기존 글 병합 — 시간 유예 대신 '본문 빌드 성공=생존' 신호로 판정(아래).
// 목록 API가 살아있는 글을 간헐적으로 빠뜨려도 직접 PostView가 되면 유지, 삭제된 글은 빌드 실패로 드롭.
const seenNow = new Set(posts.map((p) => p.logNo));
let retained = 0;
for (const old of prevPosts) {
  const logNo = String(old.logNo);
  if (seenNow.has(logNo) || excludeSet.has(logNo)) continue;
  const lines = old.t1 ? { t1: old.t1, t2: old.t2 } : splitTitle(old.title); // 구버전 데이터 제목분리 백필
  posts.push({ ...old, ...lines, _retained: true }); // 빌드 성공하면 유지, 실패하면 확정 삭제로 드롭
  retained++;
}
if (retained) console.log(`목록 API 누락분 ${retained}건 — 본문 빌드로 생존 판정`);

posts.sort((a, b) => b.ts - a.ts);

// ── 개별 글 본문 페이지 + 본문 이미지 (SEO: 구글이 우리 도메인을 유일 소스로 색인). posts.json 쓰기 전에 빌드 ──
await mkdir(POSTS_DIR, { recursive: true });
await mkdir(BODYIMG_DIR, { recursive: true });
const builtSet = new Set();
const postImages = new Map();                        // logNo → [이미지 절대 URL] (이미지 사이트맵용)
for (const p of posts) {
  const imgs = await buildPostPage(p);
  if (imgs) { builtSet.add(p.logNo); postImages.set(p.logNo, imgs); }
  await new Promise((r) => setTimeout(r, 200)); // 예의상 간격
}
// 목록 API 누락 + 본문 추출도 실패 = 확정 삭제 → 즉시 드롭(유예 무시). 그 외는 유지하고 page 플래그 부여.
// 목록 API 누락 + 본문 빌드 실패 = 확정 삭제 → 드롭. 그 외는 유지하고 page 플래그 부여.
// (posts.json은 타임스탬프 없이 결정론적 — 실제 블로그 변화 있을 때만 바뀜 → 자동 동기화 시 무의미 커밋 방지)
let ghostDropped = 0;
const finalPosts = posts
  .filter((p) => { if (p._retained && !builtSet.has(p.logNo)) { ghostDropped++; return false; } return true; })
  .map(({ _retained, ...p }) => ({ ...p, page: builtSet.has(p.logNo) }));
console.log(`개별 글 페이지: ${builtSet.size}/${posts.length}건` + (ghostDropped ? ` · 삭제확정 드롭 ${ghostDropped}건` : ''));

await writeFile(new URL('posts.json', OUT_DIR), JSON.stringify({ count: finalPosts.length, posts: finalPosts }, null, 1), 'utf8');
console.log(`posts.json: ${finalPosts.length}건 (제외 ${excludeSet.size}건, 새 썸네일 ${newThumbs}장)`);

// ── sitemap.xml — 고정 5페이지 + 활동 글(+이미지 사이트맵: 구글 이미지 검색 색인용) ──
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// /receipt/ = 현금영수증 정기발급 신청(09 임베드). 홈페이지 내부 링크 없음(비이용자 입력 방지, 유성 2026-07-12) → 사이트맵이 유일한 색인 경로라 반드시 유지
// 정적 페이지 URL 정본 = 확장자 없는 형태(GitHub Pages가 .html로 매핑). 포스트 loc은 .html 유지 — 이미 색인된 자산이라 재색인 안 시킴
const staticUrls = ['/', '/story', '/services', '/activities', '/contact', '/receipt/'];
let imgCount = 0;
const smUrls = [
  ...staticUrls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`),
  ...finalPosts.filter((p) => p.page).map((p) => {
    const imgs = (postImages.get(p.logNo) || []);
    imgCount += imgs.length;
    const ctx = ['생각공작소', '인천', p.tag].filter(Boolean).join(' ');
    const imgXml = imgs.map((u) => `    <image:image><image:loc>${xmlEsc(u)}</image:loc><image:title>${xmlEsc(ctx + ' ' + p.title)}</image:title></image:image>`).join('\n');
    return `  <url><loc>${SITE}/activities/posts/${p.logNo}.html</loc><lastmod>${p.date.replace(/\./g, '-')}</lastmod>${imgXml ? '\n' + imgXml + '\n  ' : ''}</url>`;
  }),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- 활동 글·이미지 URL은 tools/sync-blog.mjs가 자동 생성 -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${smUrls.join('\n')}\n</urlset>\n`;
await writeFile(new URL('../sitemap.xml', OUT_DIR), sitemap, 'utf8');
console.log(`sitemap.xml: ${smUrls.length}개 URL + 이미지 ${imgCount}장`);

} // end 전체 동기화
