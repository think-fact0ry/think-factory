// 지원단 공고 카톡 — icss-watch.mjs가 남긴 사건($RUNNER_TEMP/icss-events.json)을 10 브리핑의 notify 창구로 보낸다(유성 카톡).
//   .github/workflows/icss-watch.yml 「카톡」 단계가 돌린다. 로컬 확인: node tools/icss-notify.mjs <사건.json> --dry [--today=2026-10-08]
//
// 문구 = 부모 레포 docs/1 §2.3(머리 한 줄 + 「- 」 줄, 아이콘, 내부 이름, 가운뎃점 없음, 날짜 10/8(목)) +
//  10-23 만들기 전 미리보기의 카톡 꼴(구 회차 접수기간 / 오감, 아청심). 한 번 돌 때 생긴 것은 한 통으로(900자 넘으면 공고 단위로 나눔).
// 보내는 것 = 새 공고, 공고 바뀜(본문이나 첨부), 사람 확인이 필요한 공고, 3번 다 못 읽은 공고. 그 밖(다시 읽음, 30일 넘은 옛 글)은 안 보낸다.
// 열쇠 = GitHub 비밀 NOTIFY_KEY(10 Script Properties NOTIFY_KEY와 같은 값). 없으면 아무것도 안 보내고 끝(실패 아님).
// 멈춤 카톡 = --stopped(아래 stopped 머리 주석). 검사 = node tools/icss-notify.mjs --selftest
import fs from 'node:fs';
import path from 'node:path';

const NOTIFY_URL = process.env.NOTIFY_URL || 'https://script.google.com/macros/s/AKfycbyWrNRO9a_TWr_xIO5owMNpVcaiKKdWyl_g2VlpPahvaJ2ks4ciQBpEfvDYc5rayEPiZw/exec';   // 10 웹훅 배포(@4, 고정)
const KEY = process.env.NOTIFY_KEY || '';
const [file] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');
const TODAY_ARG = (process.argv.find(a => a.startsWith('--today=')) || '').slice(8);   // 로컬 시험용
const WD = '일월화수목금토';
const md = iso => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const TODAY = TODAY_ARG || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const OLD = new Date(Date.parse(TODAY) - 30 * 864e5).toISOString().slice(0, 10);   // 30일 넘은 글은 안 알림(옛 글 채우기 안전장치)

const svcWord = (name, s) => {
  if (!s) return '';
  if (s.st === '신규') return `${name} 신규 ${s.n}명${s.wait ? `(대기 ${s.wait}명)` : ''}`;
  if (s.st === '대기자만') return `${name} 대기자만`;
  if (s.st === '재판정') return `${name} 재판정${s.n ? ' ' + s.n + '명' : ''}`;
  if (s.st === '예정') { const m = /(\d{1,2})\s*월/.exec(s.text || ''); return `${name} ${m ? m[1] + '월 ' : '다음에 '}모집 예정`; }
  return `${name} 없음`;
};
const kindWord = p => {
  const when = (/(상반기|하반기|\d{1,2}월)/.exec(p.title) || [])[1];
  const k = p.kind === '추가모집' ? '추가 모집' : p.kind === '재판정' ? '재판정 접수' : '모집';
  return when ? `${when} ${k}` : k;
};
const isoToMd = s => s.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => md(`${y}-${m}-${d}`));

// 공고 하나 = 한 덩어리(줄 여럿)
function blocks(events) {
  const out = [];
  for (const { type, post: p } of events) {
    if (!p || p.posted < OLD || !['모집', '추가모집', '재판정'].includes(p.kind)) continue;
    if (p.read === 'fail') { if ((p.tries || 0) >= 3) out.push([`- ${p.gu} ${kindWord(p)} 첨부를 못 읽음`]); continue; }
    if (type !== '새 글' && type !== '바뀜' && !p.check) continue;
    const range = p.apply ? `${md(p.apply.start)}~${md(p.apply.end)}` : '';
    const b = [`- ${p.gu || '구를 모르는'} ${kindWord(p)}${type === '바뀜' ? ' 공고 바뀜' : ''}${range ? ' ' + range : ''}`];
    const many = Object.keys(p.gus || {}).length > 1;
    for (const [gu, s] of Object.entries(p.gus || {})) {
      const w = [svcWord('오감', s.오감), svcWord('아청심', s.아청심)].filter(Boolean).join(' / ');
      if (w) b.push(`- ${many ? gu + ' ' : ''}${w}`);
    }
    if (p.check) b.push(`- 확인 필요: ${isoToMd(p.check)}`);
    out.push(b);
  }
  return out;
}

// 답 = {ok:true, sent:N}. sent 0(카톡 못 보냄)도 실패로 본다
async function send(text) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(NOTIFY_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: KEY, action: 'notify', text }), redirect: 'follow', signal: AbortSignal.timeout(60000) });
      const t = await r.text();
      let o = null;
      try { o = JSON.parse(t); } catch (e) { /* 구글 화면(HTML)으로 올 때가 있다 */ }
      if (o && o.ok === true && o.sent > 0) { console.log('보냄'); return true; }
      console.log(i + '번째: 못 보냄', (o && (o.error || 'sent ' + o.sent)) || t.slice(0, 80));
      if (o && o.error === 'Unauthorized') return false;
    } catch (e) { console.log(i + '번째 실패:', e.message); }
    await new Promise(res => setTimeout(res, 10000 * i));
  }
  return false;
}

// ── 멈춤 카톡(--stopped): 워크플로 「멈춤 카톡」 단계가 예약 실행에서 읽기나 올리기가 실패했을 때 부른다.
// 한 번 실패는 지원단 사이트가 잠깐 안 열린 것일 수 있어 안 보낸다. 예약 실행이 3번 잇달아 실패한 그 순간에만, 한국 날짜로 하루 한 통.
// 상태는 따로 안 둔다 — 지난 실행 목록(GitHub)을 보고 「오늘 이미 3번째 잇단 실패가 있었나」로 판정한다.
const kstDay = iso => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10);
// runs = 최신 먼저, 지금 실행은 뺀 끝난 실행. 취소된 실행(동시 실행 대기 교체)은 줄에서 뺀다
function shouldAlert(runs, today) {
  const done = runs.filter(r => r.conclusion === 'success' || r.conclusion === 'failure');
  const f = i => done[i] && done[i].conclusion === 'failure';
  if (!(f(0) && f(1))) return { send: false, why: '잇단 실패 3번 전' };
  for (let i = 0; i < done.length; i++) {
    if (kstDay(done[i].created_at) !== today) break;
    if (f(i) && f(i + 1) && f(i + 2)) return { send: false, why: '오늘 이미 보냄' };
  }
  return { send: true };
}
async function stopped() {
  const repo = process.env.GITHUB_REPOSITORY, runId = Number(process.env.GITHUB_RUN_ID || 0);
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/icss-watch.yml/runs?event=schedule&per_page=100`,
    { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) { console.log('실행 목록 못 읽음', r.status); process.exit(1); }
  const runs = (await r.json()).workflow_runs.filter(x => x.id !== runId && x.status === 'completed');
  const d = shouldAlert(runs, TODAY);
  if (!d.send) { console.log('안 보냄:', d.why); return; }
  const errFile = path.join(process.env.RUNNER_TEMP || '.', 'icss-error.txt');
  const err = fs.existsSync(errFile) ? fs.readFileSync(errFile, 'utf8').trim() : '';
  const reason = process.env.WHY === 'commit' ? '읽은 결과를 홈페이지에 못 올림' : /[가-힣]/.test(err) ? err : '프로그램 오류';   // 영어 오류 글은 카톡에 안 넣는다
  const text = `[지원단 공고] ${md(TODAY)}\n- 공고 감시가 3번 잇달아 실패: ${reason}\n- 고치기 전까지 새 공고 카톡이 안 옴`;
  console.log(text);
  if (DRY) { console.log('--dry: 안 보냄'); return; }
  if (!KEY) { console.log('NOTIFY_KEY 없음 — 안 보냄'); return; }
  if (!(await send(text))) process.exit(1);
}

function selftest() {
  let bad = 0;
  const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? '✓' : '✗', name, ok ? '' : `→ ${JSON.stringify(got)} (기대 ${JSON.stringify(want)})`); };
  const R = (h, c) => ({ conclusion: c, created_at: `2026-10-29T${String(h).padStart(2, '0')}:00:00Z` });   // h = UTC 시(한국 = +9)
  eq('지난 둘 다 실패 = 보냄', shouldAlert([R(5, 'failure'), R(4, 'failure'), R(3, 'success')], '2026-10-29').send, true);
  eq('지난 하나만 실패 = 안 보냄', shouldAlert([R(5, 'failure'), R(4, 'success')], '2026-10-29').send, false);
  eq('4번째 잇단 실패 = 오늘 이미 보냄', shouldAlert([R(6, 'failure'), R(5, 'failure'), R(4, 'failure'), R(3, 'success')], '2026-10-29').why, '오늘 이미 보냄');
  eq('취소된 실행은 건너뜀', shouldAlert([R(6, 'failure'), R(5, 'cancelled'), R(4, 'failure'), R(3, 'success')], '2026-10-29').send, true);
  const Y = h => ({ conclusion: 'failure', created_at: `2026-10-28T${h}:00:00Z` });   // 어제(한국) 실패
  eq('어제부터 멈춤 = 오늘 첫 실패에 한 통 더', shouldAlert([Y(13), Y(12), Y(11)], '2026-10-29').send, true);
  eq('어제부터 멈춤, 오늘 두 번째 실패 = 안 보냄', shouldAlert([R(1, 'failure'), Y(13), Y(12), Y(11)], '2026-10-29').send, false);
  eq('오늘 오전에 보내고 낫다가 다시 3번 = 안 보냄', shouldAlert([R(9, 'failure'), R(8, 'failure'), R(7, 'success'), R(3, 'failure'), R(2, 'failure'), R(1, 'failure')], '2026-10-29').send, false);
  const before = bad; eq('(일부러 틀림 — 이 줄은 ✗여야 정상)', shouldAlert([R(5, 'failure')], '2026-10-29').send, true); const caught = bad > before; bad = before;
  console.log(caught ? '✓ 검사기가 틀린 기대를 잡음' : '✗ 검사기가 틀린 기대를 못 잡음');
  if (!caught) bad++;
  console.log(bad ? `실패 ${bad}` : '전부 통과');
  process.exit(bad ? 1 : 0);
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--stopped')) return stopped();
  if (!file || !fs.existsSync(file)) { console.log('사건 파일 없음 — 보낼 것 없음'); return; }
  const events = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bs = blocks(events);
  if (!bs.length) { console.log('보낼 것 없음(사건', events.length, '건)'); return; }
  const head = `[지원단 공고] ${md(TODAY)}`, texts = [];
  let cur = [head];
  for (const b of bs) {
    if (cur.length > 1 && [...cur, ...b].join('\n').length > 880) { texts.push(cur.join('\n')); cur = [head]; }
    cur.push(...b);
  }
  texts.push(cur.join('\n'));
  texts.forEach((t, i) => console.log(`── ${i + 1}통 (${t.length}자)\n${t}`));
  if (DRY) { console.log('--dry: 안 보냄'); return; }
  if (!KEY) { console.log('NOTIFY_KEY 없음 — 안 보냄'); return; }
  let fail = 0;
  for (const text of texts) if (!(await send(text))) fail++;
  if (fail) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
