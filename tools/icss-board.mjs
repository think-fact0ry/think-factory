// 지원단(icss.kr) 소식란(공개) + 등록제공기관 공지사항(로그인) 새 글 → 유성 카톡 — .github/workflows/icss-watch.yml 「소식, 공지」 단계가 돌린다.
//   로컬: node tools/icss-board.mjs [--dry] [--probe] [--selftest]   (로그인은 GitHub 비밀이 있어야 함 — 로컬엔 없음)
//
// 왜(유성 10-23 「⑥소식란 = go(검토필요)」, 「공지사항(로그인) 수집 = 예」, 11-02 기관 계정 4개를 비밀 칸에):
//  단가, 지침, 정산, 결제 오류 같은 제공기관 안내가 이 두 게시판에 올라온다. 지금은 사람이 가끔 들어가 봐야 안다.
// ⛔ 로그인 글(공지사항)은 제목도 Actions 기록, data/, 홈페이지에 절대 안 쓴다 — 카톡으로만(공개 레포라 실행 기록을 누구나 본다).
//   기록에 찍는 건 건수, 계정 이름표(HAPPY 등)뿐. 카톡 글은 $RUNNER_TEMP/icss-board.json(실행이 끝나면 사라짐)으로 icss-notify.mjs에 넘긴다.
// 상태 = data/icss-seen.json { news: 마지막 글 번호, notice: 마지막 글 번호, bad: { 계정: 지문 } } — 글 번호만(제목 없음).
//   처음(번호가 null)이면 지금 맨 위 번호만 적고 안 보낸다(옛 글 폭탄 방지).
// 소식란 거르기 = 2025-01~2026-10 260건 실측(11-02): 교육 일정, 참석자 명단, 지원단 부재, 일상돌봄, 신규 등록, 바깥 홍보는 할 일이 안 바뀌어 뺌
//  → 2026년 1~10월 14건(달 1건꼴, 설명회 실시 안내 포함). 「★」「필독」은 빼는 낱말이 있어도 보냄(일상돌봄, 신규 등록, 홍보는 ★여도 뺌).
//  10-23 계획안의 「결제 오류, 단가, 설명회만」은 실측 24건 중 대부분 설명회 참석 안내였고 부정수급, 사후심사, 연도전환을 놓쳐 버림.
// 공지사항 = 거르지 않음(제공기관에만 보이는 게시판). 로그인은 평일 한국 9시, 13시, 17시대 첫 20분 안의 실행에서만(하루 3번 —
//  센터 직원이 같은 계정을 쓰고 있을 수 있어 자주 들어가지 않는다). 읽고 나면 로그아웃.
// 계정 = 비밀 ICSS_{HAPPY,MICHU,SEOHAE,YEONSU}_{ID,PW}. 앞에서부터 하나로 로그인, 안 되면 다음(한 실행에 계정마다 1번만 — 잠김 방지).
//  비밀번호가 틀린 계정은 bad에 지문(NOTIFY_KEY로 만든 HMAC 앞 8자 — 비밀번호를 거꾸로 못 구함)을 적고, 비밀 칸이 바뀔 때까지 다시 안 씀.
//  그때 카톡 한 번. 넷 다 안 되면 그날 공지를 못 읽음 카톡(같은 까닭은 하루 한 번 — 지문이 같으면 다시 안 보냄).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ARG = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const SEEN = path.join('data', 'icss-seen.json');
const HOST = 'https://icss.kr';
const NEWS = { path: '/notice/news.asp', cstep: '0301000000' };
const NOTICE = { path: '/registration/registration_notice.asp' };
const ACCTS = [['HAPPY', '행복마음'], ['MICHU', '생각미추'], ['SEOHAE', '생각서해구'], ['YEONSU', '생각연수']];
const NOW_KST = new Date(Date.now() + 9 * 3600 * 1000);
const dec = new TextDecoder('euc-kr');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unent = s => s.replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ── 소식란 거르기(머리 주석 실측) ─────────────────────────────
const NEVER = /\[일상|일상돌봄|가사간병|등록사전교육|등록서류|신규등록|홍보|유유기지|청년/;
const SKIP = /참석자\s*명단|실시\s*안내|월간\s*계획|[년연]간\s*계획|교육\s*자료|이수증|참석확인증|접속\s*안내|사전테스[트크]|수료증|설문조사|부재|전화\s*연결|전화번호|우수사례|운영사례|정책포럼|찾아가는\s*컨설팅|외로움|폭염|홈페이지\s*업데이트|게시판\s*변경|수요조사|노인·장애인|보수교육|실태조사|불용물품|교육장\s*안내|교육\s*참석|교육\s*인정\s*시간|교육인정시간|나눔부스|정책평가단|교류회|경영관리\s*직무교육/;
const MUST = /★|필독/;
const BRIEF = t => /설명회/.test(t) && !/참석자|명단|접속|자료s*공유/.test(t);   // 기준정보 설명회 실시 안내 = 연초 참석 신청(부모 레포 백로그 「2027 연초 인천 설명회 참석」)
export const newsWanted = t => !NEVER.test(t) && (MUST.test(t) || BRIEF(t) || !SKIP.test(t));

// ── 목록 한 쪽 읽기: 줄마다 { num, date, title } ─────────────────
// 표 줄 = <td class="boardTitle"><a href="javascript:act_view('경로','번호','view','앞','뒤');">제목</a></td> … <td>26.10.29</td>
export function parseList(html) {
  const out = [];
  for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
    const m = /act_view\('[^']*','(\d+)','view','[^']*','[^']*'\);?"?[^>]*>([\s\S]*?)<\/a>/.exec(tr);
    if (!m) continue;
    const d = /<td[^>]*>\s*(\d{2})\.(\d{2})\.(\d{2})\s*<\/td>/.exec(tr);
    out.push({ num: +m[1], date: d ? `20${d[1]}-${d[2]}-${d[3]}` : '', title: unent(m[2].replace(/<[^>]+>/g, '')) });
  }
  return out;
}

// ── 쿠키를 들고 다니는 요청(로그인 세션) ───────────────────────
function jar() {
  const c = new Map();
  const take = r => { for (const s of r.headers.getSetCookie ? r.headers.getSetCookie() : []) { const [kv] = s.split(';'); const i = kv.indexOf('='); if (i > 0) c.set(kv.slice(0, i).trim(), kv.slice(i + 1)); } };
  const header = () => [...c].map(([k, v]) => `${k}=${v}`).join('; ');
  let last = HOST + '/main/';   // 앞 화면 주소 = Referer. 없으면 로그인이 「정상적인 접근이 아닙니다」로 거절됨(11-02 Actions 첫 시험 실측)
  return async (url, opt = {}) => {
    let u = url.startsWith('http') ? url : HOST + url, method = opt.method || 'GET', body = opt.body;
    for (let hop = 0; hop < 5; hop++) {
      const r = await fetch(u, { method, body, redirect: 'manual', signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': 'Mozilla/5.0', Cookie: header(), Referer: last, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: HOST } : {}) } });
      take(r);
      if (method === 'GET') last = u;
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        if (opt.noFollow) return { status: r.status, location: new URL(loc, u).href, html: '' };
        u = new URL(loc, u).href; method = 'GET'; body = undefined; continue;
      }
      return { status: r.status, location: '', html: dec.decode(await r.arrayBuffer()), url: u };
    }
    throw new Error('지원단: 넘겨주기가 너무 많음');
  };
}
const form = o => new URLSearchParams(o).toString();

async function readNews(get) {
  const r = await get(NEWS.path, { method: 'POST', body: form({ cmode: 'mc', cstep: NEWS.cstep, path_url: NEWS.path, page: '1', ptype: 'list' }) });
  const rows = parseList(r.html);
  if (!rows.length) throw new Error('소식란 목록이 비어 있음(화면 모양이 바뀌었을 수 있음)');
  return rows;
}

const fp = pw => crypto.createHmac('sha256', process.env.NOTIFY_KEY || 'no-key').update(pw).digest('hex').slice(0, 8);

// 로그인 → 공지사항 목록. 반환 { rows, who, tried: [{ label, ok, why }] } — why는 지원단 경고창 글(아이디, 비밀번호 값은 없음)
async function readNotice(state, { all = false } = {}) {
  const tried = [];
  let rows = null, who = '';
  for (const [label, name] of ACCTS) {
    const id = process.env[`ICSS_${label}_ID`], pw = process.env[`ICSS_${label}_PW`];
    if (!id || !pw) { tried.push({ label, name, ok: false, why: '비밀 칸 없음', skip: true }); continue; }
    if (state.bad && state.bad[label] === fp(pw)) { tried.push({ label, name, ok: false, why: '전에 틀린 비밀번호 그대로', skip: true }); continue; }
    const get = jar();
    try {
      await get('/member/login.asp');
      const lr = await get('/member/login_process.asp', { method: 'POST', body: form({ ptype: 'login', path_url: '/main/', login_id: id, login_pw: pw }) });
      const alertMsg = (/alert\(\s*['"]([^'"]{1,120})['"]/.exec(lr.html) || [])[1] || '';
      const lst = await get(NOTICE.path, { noFollow: true });
      if (lst.status >= 300 && /login/.test(lst.location)) {
        tried.push({ label, name, ok: false, why: alertMsg || '로그인 화면으로 돌아감', wrong: !!alertMsg && /(아이디|비밀번호|패스워드|일치|확인)/.test(alertMsg) });
        continue;
      }
      if (lst.status !== 200) { tried.push({ label, name, ok: false, why: '공지사항 응답 ' + lst.status }); continue; }
      tried.push({ label, name, ok: true });
      if (!rows) { rows = parseList(lst.html); who = label; ARG.probe && probeShape(lst.html, rows); }
      const out = (/href=["']([^"']*logout[^"']*)["']/i.exec(lst.html) || [])[1];
      if (out && /^(\/|https?:)/.test(out)) await get(out.replace(/&amp;/g, '&')).catch(() => {});
      if (!all) break;
    } catch (e) { tried.push({ label, name, ok: false, why: '연결 실패: ' + e.message }); }
    await sleep(1500);
  }
  return { rows, who, tried };
}

// --probe: 로그인 글 화면 모양만 찍는다(제목은 글자 수만) — 공개 기록에 내용을 안 남기고 파서를 맞추려고
function probeShape(html, rows) {
  console.log('공지 목록 줄', rows.length, rows.map(r => `#${r.num} ${r.date || '날짜?'} 제목${r.title.length}자`).join(', '));
  console.log('숨은 칸', (html.match(/<input[^>]+type=["']?hidden[^>]*>/gi) || []).map(x => (/name=["']?(\w+)/.exec(x) || [])[1] + '=' + ((/value=["']?([\w./]*)/.exec(x) || [])[1] || '')).join(' '));
  console.log('로그아웃 주소', (/href=["']([^"']*logout[^"']*)["']/i.exec(html) || [])[1] || '못 찾음');
  if (!rows.length) {   // 모양 뼈대: 글자는 길이만
    const i = html.search(/board|<table/i), s = html.slice(Math.max(0, i), i + 4000);
    console.log('뼈대', s.replace(/>([^<]+)</g, (_, t) => '>' + (t.trim() ? '#' + t.trim().length : '') + '<').replace(/\s+/g, ' ').slice(0, 3000));
  }
}

function readSeen() { try { return JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch (e) { return { v: 1, news: null, notice: null, bad: {} }; } }
const md = d => `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${'일월화수목금토'[d.getUTCDay()]})`;
// 공지 로그인 때 = 평일 한국 9, 13, 17시대 첫 20분(실행은 평일 낮 15분마다라 창마다 한 번꼴)
export const noticeWindow = d => d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && [9, 13, 17].includes(d.getUTCHours()) && d.getUTCMinutes() < 20;

function selftest() {
  let bad = 0;
  const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`); };
  eq('결제 오류 안내 = 보냄', newsWanted('8월 3일 바우처 결제 오류 관련 안내'), true);
  eq('★ 사후심사 = 보냄', newsWanted('★지급비용 사후심사 제도 신설 안내 (보건복지부 지침 개정사항)'), true);
  eq('교육 실시 안내 = 안 보냄', newsWanted("[지투] 1112 '응급상황별 대처 및 응급처치' 교육 실시 안내 - 접수가능"), false);
  eq('참석자 명단 = 안 보냄', newsWanted("[지투] 1103 '심폐소생술 및 응급처치 교육' 참석자 명단 & 교육장 안내"), false);
  eq('★여도 일상돌봄 = 안 보냄', newsWanted('★2026년 일상돌봄서비스사업 제공자교육 이수 안내'), false);
  eq('★여도 등록서류 = 안 보냄', newsWanted('★2025년 3차 지역사회서비스투자사업 제공기관 등록서류 제출 안내'), false);
  eq('★ 제공자 교육 이수 = 보냄', newsWanted('★2026년 지역사회서비스투자사업 제공자 교육 이수 안내'), true);
  eq('지원단 부재 = 안 보냄', newsWanted('8월 지원단 부재 안내'), false);
  eq('기준정보 설명회 실시 안내 = 보냄', newsWanted("'2026년 지역사회서비스투자사업 기준정보 설명회' 실시 안내 - 접수마감"), true);
  eq('설명회 참석자 명단 = 안 보냄', newsWanted("0122 '2026년 지역사회서비스투자사업 기준정보 설명회' 참석자 명단 & 줌 접속 안내"), false);
  eq('일상돌봄 설명회 = 안 보냄', newsWanted("'2026년 일상돌봄서비스사업 기준정보 설명회' 실시 안내 - 1/20까지 신청가능"), false);
  const row = `<tr class='noticeBg'> <td><span class='noticeBul'>필독</span></td> <td class="boardTitle"> <a href="javascript:act_view('/notice/news.asp','780','view','N','779');">[지투] 1103 &apos;심폐&apos; 명단 &amp; 안내</a> </td> <td>16</td> <td>26.10.29</td> </tr>`;
  eq('목록 줄 읽기', parseList('<table>' + row + '</table>'), [{ num: 780, date: '2026-10-29', title: "[지투] 1103 '심폐' 명단 & 안내" }]);
  eq('공지 때 = 화 13:05', noticeWindow(new Date('2026-11-03T13:05:00Z')), true);
  eq('공지 때 아님 = 화 13:25', noticeWindow(new Date('2026-11-03T13:25:00Z')), false);
  eq('공지 때 아님 = 토 9:05', noticeWindow(new Date('2026-11-07T09:05:00Z')), false);
  const before = bad; eq('(일부러 틀림 — 이 줄은 ✗여야 정상)', newsWanted('8월 지원단 부재 안내'), true); const caught = bad > before; bad = before;
  console.log(caught ? '✓ 검사기가 틀린 기대를 잡음' : '✗ 검사기가 틀린 기대를 못 잡음');
  if (!caught) bad++;
  console.log(bad ? `실패 ${bad}` : '전부 통과');
  process.exit(bad ? 1 : 0);
}

async function main() {
  if (ARG.selftest) return selftest();
  const state = readSeen(), before = JSON.stringify(state);
  state.bad = state.bad || {};
  const msgs = { 소식: [], 공지: [] };

  // 소식란(공개) — 매 실행
  const news = await readNews(jar());
  const top = Math.max(...news.map(r => r.num));
  if (state.news == null) console.log('소식란 처음 — 맨 위 번호만 적음', top);
  else {
    const fresh = news.filter(r => r.num > state.news).sort((a, b) => a.num - b.num);
    const send = fresh.filter(r => newsWanted(r.title));
    for (const r of fresh) console.log('소식 새 글', '#' + r.num, newsWanted(r.title) ? '보냄' : '거름', r.title.slice(0, 60));   // 공개 글이라 제목을 찍어도 됨
    msgs.소식 = send.map(r => r.title);
  }
  state.news = Math.max(state.news || 0, top);

  // 공지사항(로그인) — 정해진 때만(--probe는 바로, 계정 넷 다 시험)
  if (ARG.probe || noticeWindow(NOW_KST)) {
    const { rows, who, tried } = await readNotice(state, { all: !!ARG.probe });
    for (const t of tried) console.log('계정', t.label, t.ok ? '로그인 됨' : '안 됨: ' + t.why);
    for (const t of tried) if (t.wrong) { const pw = process.env[`ICSS_${t.label}_PW`]; if (state.bad[t.label] !== fp(pw)) { state.bad[t.label] = fp(pw); msgs.공지.push(`${t.name} 계정 로그인 안 됨: ${t.why.replace(/\\n|\s+/g, ' ').trim().slice(0, 50)}`); } }
    for (const t of tried) if (t.ok && state.bad[t.label]) delete state.bad[t.label];   // 비밀 칸이 바뀌어 다시 됨
    if (!rows) {
      const why = tried.every(t => t.skip) ? '계정 비밀 칸이 비었거나 다 틀림' : '로그인이 안 됨';
      const k = 'all:' + NOW_KST.toISOString().slice(0, 10);
      if (!ARG.probe && state.failDay !== k && tried.some(t => !t.skip)) { msgs.공지.push(`공지사항을 못 읽음: ${why}`); state.failDay = k; }
      console.log('공지 못 읽음:', why);
    } else if (!rows.length) {   // 로그인은 됐는데 줄을 못 읽음 = 화면 모양이 바뀜. 던지면 소식란 상태까지 못 쓰니 하루 한 번 카톡만
      const k = 'shape:' + NOW_KST.toISOString().slice(0, 10);
      if (!ARG.probe && state.failDay !== k) { msgs.공지.push('공지사항 목록을 못 읽음(화면 모양이 바뀐 듯)'); state.failDay = k; }
      console.log('공지 목록 0줄');
    } else {
      const ntop = Math.max(...rows.map(r => r.num));
      if (state.notice == null) console.log('공지 처음 — 맨 위 번호만 적음(카톡 없음)');
      else {
        const fresh = rows.filter(r => r.num > state.notice).sort((a, b) => a.num - b.num);
        console.log('공지 새 글', fresh.length, '건(계정 ' + who + ')');   // ⛔ 제목은 안 찍는다
        msgs.공지.push(...fresh.map(r => r.title));
      }
      if (!ARG.probe) state.notice = Math.max(state.notice || 0, ntop);
    }
  } else console.log('공지사항: 로그인 때 아님(평일 9, 13, 17시대 첫 20분)');

  if (ARG.probe) { console.log('--probe: 상태 파일, 카톡 안 씀'); return; }
  if (JSON.stringify(state) !== before && !ARG.dry) { fs.writeFileSync(SEEN, JSON.stringify(state, null, 1) + '\n'); console.log('씀', SEEN); }
  const texts = [];
  const day = md(NOW_KST);
  const clean = t => t.replace(/★|필독/g, '').replace(/^[\s\])]+/, '').trim();   // 지원단이 붙인 ★, 필독 표시는 카톡에서 뺌(docs/1 §2.3 아이콘 안 씀)
  if (msgs.소식.length) texts.push([`[지원단 소식] ${day}`, ...msgs.소식.map(t => '- ' + clean(t))].join('\n'));
  if (msgs.공지.length) texts.push([`[지원단 공지] ${day}`, ...msgs.공지.map(t => '- ' + clean(t))].join('\n'));
  console.log('카톡', texts.length, '통');   // ⛔ 공지 글은 기록에 안 찍는다 — 건수만
  if (ARG.dry) { msgs.소식.length && console.log(texts[0]); console.log('--dry: 카톡 파일 안 씀'); return; }
  if (process.env.GITHUB_ACTIONS && !process.env.WILL_COMMIT) { console.log('커밋 안 하는 손 실행 — 카톡 안 남김'); return; }
  if (process.env.RUNNER_TEMP && texts.length) fs.writeFileSync(path.join(process.env.RUNNER_TEMP, 'icss-board.json'), JSON.stringify(texts));
}

main().catch(e => { console.error('소식, 공지 실패:', e.message); process.exit(1); });
