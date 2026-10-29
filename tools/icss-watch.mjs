// 지원단(icss.kr) 이용자 모집 공고 감시 — .github/workflows/icss-watch.yml이 돌린다.
//   로컬: node tools/icss-watch.mjs [--backfill] [--since=2025-01-01] [--only=188,187] [--no-ai] [--dry] [--out=파일]
//
// 왜(유성 2026-10-23): 인천 어느 구든 바우처 신청 기간이 올라오면 ① 22 추천서 신청 기간 ② 홈페이지 신청 기간 페이지
//  ③ 카톡 ④ 블로그 초안이 그걸 따라간다. 그 넷이 읽을 공개 데이터 = data/icss.json(공개 공고만, 로그인 글은 절대 안 씀).
// 왜 서비스별로 읽나(유성 10-29 「신청기간이 올라왔는데 오감 인원이 없을 수 있음」, 실측 2026 공고 21건):
//  오감을 아예 안 뽑은 공고 5건, 표엔 있는데 신규 「-」·「신규 접수 불가」, 「9월 모집 예정」 한 줄, 재판정만 받는 공고가 있다.
//  그래서 구마다 서비스마다 st = 신규 / 대기자만 / 재판정 / 예정 / 없음 을 적는다.
// 첨부 읽기: 표 모양이 구마다 넷(계·대기자·신규 세 칸 / 모집 인원 한 칸 / 금액표 안 인원 / 한 공고에 두 구 칸)이고,
//  PDF 모집 안내는 한글이 글자로 안 나온다(2026 실측 9개 전부 0자) → 한글 파일은 글로(tools/hwp-text.mjs), PDF는 그대로
//  Claude에 보내 표를 같은 꼴로 옮겨 받는다. 그다음 코드가 검산(인원 합 = 적힌 합계, 접수기간 = 본문 날짜)하고,
//  안 맞으면 check에 까닭을 적는다(소비자는 check가 있는 공고를 자동으로 믿지 않는다).
// 파일 이름으로 고르지 않는다(회차마다 바뀜). 다만 모든 구 공통 안내문 둘은 다른 첨부가 있으면 보내지 않는다(돈만 듦).
// 강화군, 옹진군은 안 넣는다(유성 10-28).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hwpText, kindOfBytes } from './hwp-text.mjs';

const BASE = 'https://icss.kr/registration/township_notice.asp';
const MODEL = process.env.ICSS_MODEL || 'claude-sonnet-5-5';   // 제품 코드 = 최신 소넷. 새 소넷이 나오면 같이 올린다(부모 레포 메모리 model-ids-must-stay-current)
const KEY = process.env.ANTHROPIC_API_KEY || '';
const ARG = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const OUT = ARG.out || path.join('data', 'icss.json');
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);   // 한국 날짜
const daysAgo = n => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
const SINCE = ARG.since || daysAgo(180);   // 첨부를 Claude로 읽는 게시일 하한(그 전 글은 목록, 날짜만)
const RECHECK = daysAgo(30);               // 최근 30일 글은 매번 다시 열어 고쳐졌는지 본다
const ONLY = ARG.only ? new Set(String(ARG.only).split(',').map(Number)) : null;
const SVCS = ['오감', '아청심', '정신토탈', '성인'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dec = new TextDecoder('euc-kr');

// ── 지원단 게시판 ─────────────────────────────────────────────
async function icss(params) {
  const body = new URLSearchParams({ cmode: 'mc', cstep: '0302000000', path_url: '/registration/township_notice.asp', ...params });
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(BASE, { method: 'POST', body, headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return dec.decode(await r.arrayBuffer());
      console.log('지원단', r.status, i + '번째');
    } catch (e) { console.log('지원단 실패', i + '번째:', e.message); }
    await sleep(5000 * i);
  }
  throw new Error('지원단 게시판을 못 읽음');
}
const strip = h => h.replace(/<br[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t\r]+/g, ' ').split('\n').map(s => s.trim()).filter(Boolean).join('\n');
const unent = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function listPage(page) {
  const html = await icss({ page: String(page), ptype: 'list' });
  const out = [], re = /act_view\('[^']*','(\d+)','view','([^']*)','([^']*)'\);">([^<]*)<\/a>/g;
  let m;
  while ((m = re.exec(html))) out.push({ num: +m[1], pNum: m[2], nNum: m[3], title: unent(m[4]) });
  return out;
}

async function viewPost(ref) {
  const html = await icss({ num: String(ref.num), pNum: ref.pNum || '0', nNum: ref.nNum || '0', ptype: 'view', page: '1' });
  const files = [], fre = /href="(\/lib\/UpFileDown\.asp\?[^"]+)"[^>]*>([^<]*)</g;
  let f;
  while ((f = fre.exec(html))) files.push({ name: unent(f[2]).replace(/\s*\(\s*[\d,.]+\s*[KM]b\s*\)\s*$/i, ''), url: 'https://icss.kr' + f[1].replace(/&amp;/g, '&') });
  const text = strip(html), i = text.indexOf(ref.title.slice(0, 12)), j = text.indexOf('다음글');
  // 「조회수 - 196」 줄은 볼 때마다 바뀐다 → 빼야 「글이 고쳐졌나」를 지문으로 가릴 수 있다(10-29 실측: 안 빼면 매번 「바뀜」)
  const body = (i > -1 ? text.slice(i, j > i ? j : undefined) : '').split('\n').filter(l => !/^조회수\s*-?\s*\d*$/.test(l)).join('\n');
  const dm = body.match(/(\d{4}-\d{2}-\d{2})/);
  return { posted: dm ? dm[1] : '', body, files };
}

// ── 글 → 구, 종류, 본문 날짜 ──────────────────────────────────
// 「남동」을 「동구」보다 먼저(남동구 안에 동구가 있다). 서구·중구·동구 = 2026-07 개편 전 이름(옛 글에 그대로 둠)
const GU = [['검단', '검단구'], ['서해', '서해구'], ['미추홀', '미추홀구'], ['연수', '연수구'], ['남동', '남동구'], ['부평', '부평구'], ['계양', '계양구'],
  ['제물포', '제물포구'], ['영종', '영종구'], ['중구', '중구'], ['동구', '동구'], ['서구', '서구'], ['강화', '강화군'], ['옹진', '옹진군']];
const guOf = t => { for (const [k, v] of GU) if (t.includes(k)) return v; return ''; };
const SKIP_GU = new Set(['강화군', '옹진군']);
function kindOf(title) {
  if (/청년|커리어|게시판/.test(title)) return '기타';
  if (/재판정|재연장/.test(title)) return '재판정';
  if (/추가/.test(title)) return '추가모집';
  if (/(모집|접수|신청)/.test(title)) return '모집';
  return '기타';
}
const AI_KINDS = new Set(['모집', '추가모집', '재판정']);

// 본문 「모집기간/접수기간/신청기간」 줄의 첫 날짜 ~ 둘째 날짜(10-23 실측 145건 중 133건 판독, 나머지는 원문 오타 포함)
// 날짜 뒤 (요일)도 읽어 둔다 — 공고가 스스로 틀릴 때가 있다(제물포 26-07: 본문 「8.6.(수)」 = 실제 목요일, 첨부 「8. 5.(수)」가 맞음)
const WD = '일월화수목금토';
const wdOf = iso => WD[new Date(iso + 'T00:00:00Z').getUTCDay()];
// 적힌 요일이 날짜와 맞나: 하나라도 틀리면 false, 적힌 게 다 맞으면 true, 요일이 없으면 null
const wdCheck = (p, w1, w2) => { const ws = [[p.start, w1], [p.end, w2]].filter(([, w]) => w); return ws.length ? ws.every(([d, w]) => wdOf(d) === w) : null; };
function bodyPeriod(body, posted) {
  const line = body.split('\n').find(l => /(모집|접수|신청)\s*기간|기\s*간\s*:/.test(l));
  if (!line) return null;
  const y0 = +(posted || TODAY).slice(0, 4);
  const ds = [...line.matchAll(/(?:(\d{4})\s*[.\-년]\s*)?(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*[.일]?\s*(?:\(\s*([월화수목금토일])\s*\))?/g)]
    .map(m => ({ y: m[1] ? +m[1] : null, m: +m[2], d: +m[3], w: m[4] || '' })).filter(x => x.m >= 1 && x.m <= 12 && x.d >= 1 && x.d <= 31);
  if (ds.length < 2) return null;
  const a = ds[0], b = ds[1];
  a.y = a.y || y0; b.y = b.y || a.y;
  const iso = x => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
  const p = { start: iso(a), end: iso(b) };
  p.wd = wdCheck(p, a.w, b.w);
  return p;
}
// 본문 날짜와 첨부 날짜가 다르면: 요일이 맞는 쪽 하나만 있으면 그쪽(note에 남김), 아니면 사람 확인 + 끝날이 이른 쪽(늦게 알려 주는 것보다 안전)
function pickPeriod(bp, ap) {
  if (!ap) return { apply: bp, why: '' };
  if (!bp || (bp.start === ap.start && bp.end === ap.end)) return { apply: ap, why: '' };
  const dd = `본문 ${bp.start}~${bp.end}, 첨부 ${ap.start}~${ap.end}`;
  if (bp.wd === false && ap.wd !== false) return { apply: ap, why: '', note: dd + ' — 본문 요일이 날짜와 안 맞아 첨부를 씀' };
  if (ap.wd === false && bp.wd !== false) return { apply: bp, why: '', note: dd + ' — 첨부 요일이 날짜와 안 맞아 본문을 씀' };
  return { apply: bp.end <= ap.end ? bp : ap, why: '접수기간이 ' + dd + '로 다름' };
}
const periodOk = (p, posted) => {
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end)) return false;
  const s = Date.parse(p.start), e = Date.parse(p.end), y = +(posted || TODAY).slice(0, 4);
  return !isNaN(s) && !isNaN(e) && s <= e && (e - s) / 864e5 <= 45 && [y, y + 1].includes(+p.start.slice(0, 4));
};
const viewUrl = num => `${BASE}?cmode=mc&cstep=0302000000&path_url=${encodeURIComponent('/registration/township_notice.asp')}&ptype=view&page=1&num=${num}&pNum=0&nNum=0`;
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

// ── 첨부 → Claude 표 옮기기 ───────────────────────────────────
const GENERIC = /인천시_?지역사회서비스(투자)?사업_?안내문|이용자_?안내문/;
const N = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['found', 'fileUsed', 'reassessOnly', 'apply', 'statedTotal', 'rows', 'planned'],
  properties: {
    found: { type: 'boolean' },
    fileUsed: { type: 'string' },
    reassessOnly: { type: 'boolean' },
    apply: { type: 'object', additionalProperties: false, required: ['start', 'end', 'startWd', 'endWd'],
      properties: { start: { type: 'string' }, end: { type: 'string' }, startWd: { type: 'string' }, endWd: { type: 'string' } } },
    statedTotal: N,
    rows: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['gu', 'name', 'svc', 'total', 'waiting', 'newCount', 'newClosed', 'note'],
      properties: {
        gu: { type: 'string' }, name: { type: 'string' }, svc: { type: 'string', enum: ['오감', '아청심', '정신토탈', '성인', '기타'] },
        total: N, waiting: N, newCount: N, newClosed: { type: 'boolean' }, note: { type: 'string' } } } },
    planned: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['svc', 'text'],
      properties: { svc: { type: 'string', enum: ['오감', '아청심', '정신토탈', '성인', '기타'] }, text: { type: 'string' } } } },
  },
};
const SYSTEM = `너는 인천 지역사회서비스투자사업 「이용자 모집 공고」의 첨부 파일을 읽어 모집 표를 그대로 옮긴다. 문서에 적힌 것만 옮기고 추측하지 않는다.
- 첨부 여러 개 중 「접수(신청, 모집)기간」과 「사업(서비스)별 인원 표」가 있는 모집 안내를 찾는다. 인천시 전체 사업 안내문, 이용자 안내문, 신청서식처럼 이번 회차 인원 표가 없는 파일은 무시한다. 찾으면 found=true, 그 파일 이름을 fileUsed에.
  첨부에 표가 없어도 게시글 본문에 이번 회차 사업 목록(인원이 있든 없든)이 적혀 있으면 그걸 쓰고 fileUsed="본문". 둘 다 없으면 found=false, rows=[].
- apply: 이번 회차 접수기간을 YYYY-MM-DD로. 연도가 안 적혀 있으면 공고 게시일의 연도. 못 찾으면 둘 다 "". startWd, endWd = 문서에 날짜 옆 괄호로 적힌 요일 글자 그대로(예: "화"), 안 적혀 있으면 "". 요일이 날짜와 안 맞아도 고치지 말고 적힌 대로.
- statedTotal: 문서에 적힌 모집 인원 합계(예: 「12개 사업 500명」, 표의 계/합계 줄). 없으면 null.
- rows: 표의 사업 줄을 빠짐없이 한 줄씩(우리 서비스만이 아니라 전부).
  · gu: 표가 구별 칸으로 나뉘어 있으면(예: 서해구, 검단구 칸) 칸마다 한 줄씩 그 구 이름, 아니면 "".
  · name: 문서의 사업명 그대로. svc: 오감쑥쑥 → "오감", 아동청소년 심리지원 → "아청심", 정신건강 토탈케어 → "정신토탈", 성인심리상담 → "성인", 나머지(아동정서발달, 진로설계 등) → "기타".
  · total: 「계」 또는 「모집 인원」 숫자. waiting: 「대기자」 칸 숫자(칸이 있는데 「-」이면 0, 칸이 없으면 null). newCount: 「신규모집」 칸 숫자(칸이 있는데 「-」이면 0, 칸이 없으면 null).
  · newClosed: 그 사업에 「신규 접수 불가」, 「신규모집 인원 없음」, 「대기자 중 선정」처럼 새로 신청할 수 없다는 말이 있으면 true.
  · 한 사업이 「*대기자」, 「*신규」처럼 두 줄로 나뉘어 있으면 두 줄로 옮긴다.
  · note: 그 줄의 비고를 짧게(없으면 "").
- planned: 표에 없고 「○월 모집 예정」처럼 다음에 뽑는다고 적힌 사업. text = 그 말 그대로.
- reassessOnly: 이번 공고가 재판정(재연장) 대상자만 받는 접수면 true, 신규 이용자도 받으면 false.`;

async function askClaude(post, docs) {
  const content = [];
  for (const d of docs.filter(x => x.pdf)) content.push({ type: 'document', title: d.name, source: { type: 'base64', media_type: 'application/pdf', data: d.pdf } });
  const texts = docs.filter(x => x.text != null).map(d => `[첨부: ${d.name} (한글 파일에서 뽑은 글, 표 칸마다 한 줄)]\n${d.text.slice(0, 15000)}`);
  content.push({ type: 'text', text: [`공고 제목: ${post.title}`, `게시일: ${post.posted}`, `[게시글 본문]\n${post.body.slice(0, 4000)}`, ...texts,
    `PDF 첨부: ${docs.filter(x => x.pdf).map(x => x.name).join(', ') || '없음'}`].join('\n\n') });
  const req = { model: MODEL, max_tokens: 16000, system: SYSTEM, fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content }] };
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(300000),
        headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
        body: JSON.stringify(req) });
      const j = await res.json();
      if (!res.ok) { console.log('  Claude', res.status, (j.error && j.error.message || '').slice(0, 200)); if (res.status < 500 && res.status !== 429) return null; }
      else if (j.stop_reason !== 'end_turn') { console.log('  Claude 멈춤:', j.stop_reason); return null; }
      else {
        const t = (j.content || []).find(c => c.type === 'text');
        if (t) return JSON.parse(t.text);
        console.log('  Claude 답에 글 없음');
        return null;
      }
    } catch (e) { console.log('  Claude 실패', i + '번째:', e.message); }
    await sleep(15000 * i);
  }
  return null;
}

// 표 줄 → 구마다 서비스마다 상태. 같은 사업 두 줄(*대기자, *신규)은 합친다
function summarize(ai, post) {
  const gus = {};
  const rows = ai.rows.map(r => ({ ...r, gu: r.gu || post.gu }));
  const guList = [...new Set(rows.map(r => r.gu).filter(Boolean))];
  if (!guList.length && post.gu) guList.push(post.gu);
  for (const g of guList) {
    gus[g] = {};
    for (const s of SVCS) {
      const mine = rows.filter(r => r.gu === g && r.svc === s);
      const open = mine.filter(r => !r.newClosed);
      const n = open.reduce((a, r) => a + (r.newCount ?? r.total ?? 0), 0);
      const wait = mine.reduce((a, r) => a + (r.waiting || 0), 0);
      const plan = ai.planned.find(p => p.svc === s);
      if (mine.length && ai.reassessOnly) gus[g][s] = { st: '재판정', n: mine.reduce((a, r) => a + (r.total ?? r.newCount ?? 0), 0) };
      else if (n > 0) gus[g][s] = wait ? { st: '신규', n, wait } : { st: '신규', n };
      else if (mine.length) gus[g][s] = { st: '대기자만', n: 0, ...(wait ? { wait } : {}) };
      else if (plan) gus[g][s] = { st: '예정', text: plan.text };
      else gus[g][s] = { st: '없음' };
    }
  }
  return gus;
}

function verify(ai, post) {
  const why = [];
  if (!ai.found) why.push('모집 표 못 찾음');
  if (ai.found && !periodOk(ai.apply, post.posted) && !post.apply) why.push('접수기간 못 읽음');
  if (ai.statedTotal != null && ai.rows.length && ai.rows.every(r => r.total != null || r.newCount != null)) {   // 본문에 사업 이름만 있으면(남동 재판정) 합계를 못 대 본다
    const s1 = ai.rows.reduce((a, r) => a + (r.total ?? r.newCount ?? 0), 0), s2 = ai.rows.reduce((a, r) => a + (r.newCount ?? r.total ?? 0), 0);
    if (ai.statedTotal !== s1 && ai.statedTotal !== s2) why.push(`합계 ${ai.statedTotal}명인데 표를 더하면 ${s1}명`);
  }
  for (const r of ai.rows) if (r.total != null && r.waiting != null && r.newCount != null && r.total !== r.waiting + r.newCount) why.push(`${r.name} 계 ${r.total}명이 대기 ${r.waiting}명 + 신규 ${r.newCount}명과 안 맞음`);
  return why.join(' / ');
}

async function readAttachments(post) {
  const docs = [], files = post.files || [];
  const nonGeneric = files.filter(f => !GENERIC.test(f.name));
  for (const f of nonGeneric.length ? nonGeneric : files) {
    try {
      const r = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: BASE }, signal: AbortSignal.timeout(60000) });
      const b = Buffer.from(await r.arrayBuffer());
      const k = kindOfBytes(b);
      if (k === 'pdf') { if (b.length <= 15e6) docs.push({ name: f.name, pdf: b.toString('base64') }); else console.log('  PDF 너무 큼', f.name, b.length); }
      else if (k === 'hwp' || k === 'zip') { const t = hwpText(b); docs.push({ name: f.name, text: t || '(이 한글 파일은 글을 뽑지 못함 — 배포용 또는 깨짐)' }); }
      else console.log('  모르는 파일', f.name, k);
    } catch (e) { console.log('  첨부 실패', f.name, e.message); }
    await sleep(800);
  }
  return docs;
}

// ── 본체 ─────────────────────────────────────────────────────
function readOld() { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return { posts: [] }; } }

// --selftest: 날짜, 요일 고르기만 시험(지원단, Claude 안 부름). 틀리면 exit 1
function selftest() {
  let bad = 0;
  const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { bad++; console.log('✗', name, '\n   받음', g, '\n   기대', w); } else console.log('✓', name); };
  const b177 = bodyPeriod('○ 모집기간 : 2026.8.3.(월) ~ 2026.8.6.(수)', '2026-07-24');
  eq('제물포 본문 = 8/6(수)는 목요일이라 요일 틀림', b177, { start: '2026-08-03', end: '2026-08-06', wd: false });
  const a177 = { start: '2026-08-03', end: '2026-08-05', wd: wdCheck({ start: '2026-08-03', end: '2026-08-05' }, '월', '수') };
  eq('제물포 첨부 8/5(수) 요일 맞음', a177.wd, true);
  const p177 = pickPeriod(b177, a177);
  eq('제물포 = 첨부를 쓰고 확인 요청 없음', [p177.apply.end, p177.why, !!p177.note], ['2026-08-05', '', true]);
  eq('검단 본문 요일 맞음', bodyPeriod('□ 모집기간: 2026. 10. 13.(화) ~ 2026. 10. 19.(월)(7일간)', '2026-10-08'), { start: '2026-10-13', end: '2026-10-19', wd: true });
  eq('요일 없는 본문', bodyPeriod('○ 접수기간 : 2026. 9. 4. ~ 9. 11.', '2026-09-03'), { start: '2026-09-04', end: '2026-09-11', wd: null });
  const both = pickPeriod({ start: '2026-03-04', end: '2026-03-11', wd: null }, { start: '2026-03-04', end: '2026-03-12', wd: null });
  eq('둘 다 요일 없고 다름 = 사람 확인 + 이른 끝날', [both.apply.end, !!both.why], ['2026-03-11', true]);
  eq('같으면 그대로', pickPeriod({ start: '2026-03-04', end: '2026-03-11', wd: true }, { start: '2026-03-04', end: '2026-03-11', wd: true }).why, '');
  eq('첨부 못 읽으면 본문', pickPeriod({ start: '2026-03-04', end: '2026-03-11', wd: null }, null).apply.end, '2026-03-11');
  // 검사기가 틀린 걸 틀렸다고 하는지(✗를 낼 줄 아는지) — 일부러 틀린 기대
  const before = bad; eq('(일부러 틀림 — 이 줄은 ✗여야 정상)', wdOf('2026-08-06'), '수'); const caught = bad > before; bad = before;
  console.log(caught ? '✓ 검사기가 틀린 기대를 잡음' : '✗ 검사기가 틀린 기대를 못 잡음');
  if (!caught) bad++;
  console.log(bad ? `실패 ${bad}` : '전부 통과');
  process.exit(bad ? 1 : 0);
}

async function main() {
  if (ARG.selftest) return selftest();
  const old = readOld(), byNum = new Map((old.posts || []).map(p => [p.num, p]));
  const events = [];
  // 목록: 평소 1쪽(새 글은 맨 위). 1쪽이 전부 처음 보는 글이면 2쪽도. --backfill = 끝까지
  const refs = new Map();
  for (let page = 1; page <= 30; page++) {
    const list = await listPage(page);
    list.forEach(r => refs.set(r.num, r));
    if (!list.length) break;
    if (!ARG.backfill && !(page === 1 && list.every(r => !byNum.has(r.num)) && byNum.size)) break;
    await sleep(1500);
  }
  if (!refs.size) throw new Error('지원단 목록이 비어 있음(화면 모양이 바뀌었을 수 있음)');
  console.log('목록', refs.size, '건, 저장된 글', byNum.size);

  for (const ref of [...refs.values()].sort((a, b) => a.num - b.num)) {
    if (ONLY && !ONLY.has(ref.num)) continue;
    const prev = byNum.get(ref.num);
    const gu = guOf(ref.title);
    if (SKIP_GU.has(gu)) continue;
    // 새 글, 최근 30일 글, 못 읽은 글(3번까지), --reread 만 연다
    const want = !prev || (prev.posted >= RECHECK) || (prev.read === 'fail' && (prev.tries || 0) < 3) || ARG.reread
      || (prev.read === 'skip' && prev.posted >= SINCE && AI_KINDS.has(prev.kind) && !ARG['no-ai'] && KEY);
    if (!want) continue;
    const v = await viewPost(ref); await sleep(1500);
    const post = { num: ref.num, gu, title: ref.title, posted: v.posted, kind: kindOf(ref.title), url: viewUrl(ref.num),
      files: v.files.map(f => f.name), bodyHash: hash(v.body + '|' + v.files.map(f => f.name).join('|')) };
    const changed = prev && prev.bodyHash !== post.bodyHash;
    if (prev && !changed && !ARG.reread && !(prev.read === 'fail') && !(prev.read === 'skip' && post.posted >= SINCE && AI_KINDS.has(post.kind) && KEY && !ARG['no-ai'])) continue;
    const bp = bodyPeriod(v.body, v.posted);
    post.apply = bp && periodOk(bp, v.posted) ? { start: bp.start, end: bp.end } : null;
    post.read = 'skip';
    if (AI_KINDS.has(post.kind) && post.posted >= SINCE && KEY && !ARG['no-ai']) {
      console.log(`#${post.num} ${post.posted} ${post.title.slice(0, 50)} — 첨부 ${v.files.length}개 읽는 중`);
      const docs = await readAttachments({ ...post, files: v.files });
      const ai = await askClaude({ ...post, body: v.body }, docs);
      if (!ai) { post.read = 'fail'; post.tries = ((prev && prev.read === 'fail' && prev.tries) || 0) + 1; post.check = '첨부의 표를 못 옮김'; }
      else {
        post.read = 'ai';
        const ap = periodOk(ai.apply, post.posted) ? { start: ai.apply.start, end: ai.apply.end, wd: wdCheck(ai.apply, ai.apply.startWd, ai.apply.endWd) } : null;
        const pick = pickPeriod(post.apply && bp, ap);
        post.apply = pick.apply ? { start: pick.apply.start, end: pick.apply.end } : null;
        if (pick.note) post.note = pick.note;
        post.gus = summarize(ai, post);
        post.rows = ai.rows.map(r => [r.gu, r.name, r.svc, r.total, r.waiting, r.newCount, r.newClosed ? 1 : 0, r.note].map(x => x === null ? '' : x));
        post.planned = ai.planned;
        post.fileUsed = ai.fileUsed;
        post.check = [pick.why, verify(ai, post)].filter(Boolean).join(' / ');
        if (!post.gu && Object.keys(post.gus).length === 0) post.check = (post.check ? post.check + ' / ' : '') + '구를 모름';
      }
    }
    if (!post.check) delete post.check;
    byNum.set(post.num, post);
    events.push({ type: prev ? (changed ? '바뀜' : '다시 읽음') : '새 글', post });
    console.log(`#${post.num} ${post.gu || '(구?)'} ${post.kind} ${post.apply ? post.apply.start + '~' + post.apply.end : '(날짜?)'} ${post.read}${post.check ? ' ⚠ ' + post.check : ''}`);
    if (post.gus) for (const [g, s] of Object.entries(post.gus)) console.log('   ', g, SVCS.map(k => `${k} ${s[k].st}${s[k].n ? ' ' + s[k].n : ''}${s[k].wait ? '(대기 ' + s[k].wait + ')' : ''}`).join(', '));
  }

  const posts = [...byNum.values()].sort((a, b) => b.num - a.num);
  const data = { v: 1, about: '인천 지역사회서비스 지원단(icss.kr) 이용자 모집 공고 — 공개 글만. tools/icss-watch.mjs가 만듦. gus[구][서비스].st = 신규/대기자만/재판정/예정/없음, check가 있으면 사람 확인 전', posts };
  const body = JSON.stringify(data, null, 1);
  const oldBody = JSON.stringify({ v: old.v, about: old.about, posts: old.posts || [] }, null, 1);
  if (body === oldBody) console.log('바뀐 것 없음');
  else if (ARG.dry) console.log('--dry: 파일 안 씀', events.length, '건');
  else { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ ...data, updated: new Date().toISOString() }, null, 1) + '\n'); console.log('씀', OUT, events.length, '건'); }

  // 다음 단계(카톡)가 읽을 사건 목록 + Actions 요약
  if (process.env.RUNNER_TEMP) fs.writeFileSync(path.join(process.env.RUNNER_TEMP, 'icss-events.json'), JSON.stringify(events));
  if (process.env.GITHUB_STEP_SUMMARY && events.length) {
    const lines = ['| 글 | 구 | 종류 | 접수 | 읽기 | 오감 | 아청심 | 확인 |', '|---|---|---|---|---|---|---|---|'];
    for (const { type, post: p } of events) {
      const g = p.gus ? Object.entries(p.gus).map(([k, s]) => `${k}: ${s.오감.st}${s.오감.n ? ' ' + s.오감.n : ''}`).join('<br>') : '';
      const a = p.gus ? Object.entries(p.gus).map(([k, s]) => `${s.아청심.st}${s.아청심.n ? ' ' + s.아청심.n : ''}`).join('<br>') : '';
      lines.push(`| ${type} #${p.num} ${p.posted} | ${p.gu} | ${p.kind} | ${p.apply ? p.apply.start + '~' + p.apply.end : ''} | ${p.read} | ${g} | ${a} | ${p.check || ''} |`);
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
