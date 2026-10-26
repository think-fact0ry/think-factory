// /month 계획안 받기 — .github/workflows/month-plan.yml이 돌린다(로컬: npm i --no-save sharp@0.33.5 && node tools/month-plan.mjs).
//
// 왜(유성 10-26 「로딩이 아예 있어선 안돼」): /month가 열 때마다 07(GAS)에 물으면 원드라이브를 읽느라 3~7초.
//  → 여기서 미리 07 공개 창구(pub)의 이번 달, 다음 달 포스터 + 안내문을 받아 month/plan.js + month/p/<YYMM>-<sig8>.jpg로 넣어 두고,
//    /month는 그 파일을 바로 읽어 첫 화면부터 그린다(불러오는 중 화면 없음).
// 지문 sig = 07 _maPubSig_(안내문 + 포스터 파일) 그대로 싣는다. 07 1일 발송은 이 파일의 그 달 sig가 원드라이브 판과 같아야 보낸다
//  (부모 레포 scripts/07_아동서류화일관리/월안내발송.js _maPageCheck_) → 여기가 멈추면 발송도 기다린다(카톡으로 알림).
// 못 받은 달(07 오류)은 있던 판을 그대로 둔다. 그 달 안내문이 없으면(none) 뺀다. 바뀐 게 없으면 파일을 안 건드린다(커밋 0).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const GAS07 = 'https://script.google.com/macros/s/AKfycbxvWu1xR9udwKiTkZ-nk-Hvx9KPlFKyIelVCdmnVYEilmLADfZnnO2Nq4XmdpwolmG9Yg/exec';
const DIR = 'month', PDIR = path.join(DIR, 'p'), OUT = path.join(DIR, 'plan.js');
const WIDTH = 1240, QUALITY = 82;   // 1654x2339 PNG 1.4MB → 1240 폭 JPEG 약 0.3MB(10-26 11월 실측 325KB) — 폰 3배 화면에도 선명

const two = n => String(n).padStart(2, '0');
const now = new Date(Date.now() + 9 * 3600 * 1000);   // 한국 시각
const y = now.getUTCFullYear() % 100, m = now.getUTCMonth() + 1;
const WANT = [two(y) + two(m), m === 12 ? two(y + 1) + '01' : two(y) + two(m + 1)];

function readOld() {
  try {
    const s = fs.readFileSync(OUT, 'utf8');
    const hit = /window\.MONTH_PLANS\s*=\s*(\[[\s\S]*\])\s*;?\s*$/.exec(s.trim());
    return hit ? JSON.parse(hit[1]) : [];
  } catch (e) { return []; }
}

// GAS 답은 가끔 늦거나 구글 화면(HTML)으로 온다 → 글로 받아 JSON으로, 네 번까지
async function pub(ym) {
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch(GAS07, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'pub', ym }), redirect: 'follow', signal: AbortSignal.timeout(90000) });
      const o = JSON.parse(await r.text());
      if (o && o.ok === true) return o;
      console.log(ym, i + '번째: ok 아님', JSON.stringify(o).slice(0, 120));
    } catch (e) { console.log(ym, i + '번째 실패:', e.message); }
    await new Promise(res => setTimeout(res, 5000 * i));
  }
  return null;
}

async function main() {
  const old = readOld(), next = [], keep = new Set();
  for (const ym of WANT) {
    const prev = old.find(x => x.ym === ym);
    const o = await pub(ym);
    if (!o) { if (prev) { next.push(prev); if (prev.img) keep.add(path.basename(prev.img)); } console.log(ym, '못 받음 — 있던 판 유지'); continue; }
    if (o.none) { console.log(ym, '안내문 없음'); continue; }
    if (!o.sig) { console.log(ym, 'sig 없음(07이 옛 판?) — 건너뜀'); if (prev) { next.push(prev); if (prev.img) keep.add(path.basename(prev.img)); } continue; }
    if (prev && prev.sig === o.sig && (!prev.img || fs.existsSync(path.join(DIR, prev.img)))) {   // 같은 판 = 그림 다시 안 만듦
      next.push(prev); if (prev.img) keep.add(path.basename(prev.img)); console.log(ym, '그대로', o.sig); continue;
    }
    const e = { ym, m: o.m, img: '', w: 0, h: 0, text: o.text, sig: o.sig };
    const dm = /^data:image\/[\w.+-]+;base64,(.+)$/.exec(o.poster || '');
    if (dm) {
      const name = ym + '-' + o.sig.slice(0, 8) + '.jpg';
      const { data, info } = await sharp(Buffer.from(dm[1], 'base64')).rotate()
        .resize({ width: WIDTH, withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      fs.mkdirSync(PDIR, { recursive: true });
      fs.writeFileSync(path.join(PDIR, name), data);
      Object.assign(e, { img: 'p/' + name, w: info.width, h: info.height });
      keep.add(name);
      console.log(ym, '새 판', o.sig, name, info.width + 'x' + info.height, Math.round(data.length / 1024) + 'KB');
    } else console.log(ym, '새 판(그림 없음)', o.sig);
    next.push(e);
  }
  const body = '// 자동 생성 — .github/workflows/month-plan.yml(tools/month-plan.mjs)이 07 공개 창구에서 받아 씀. 손으로 고치지 말 것(다음 실행이 덮어씀)\n'
    + 'window.MONTH_PLANS = ' + JSON.stringify(next) + ';\n';
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (before !== body) { fs.writeFileSync(OUT, body); console.log('plan.js 바뀜'); } else console.log('plan.js 그대로');
  if (fs.existsSync(PDIR)) for (const f of fs.readdirSync(PDIR)) if (!keep.has(f)) { fs.unlinkSync(path.join(PDIR, f)); console.log('지움', f); }
  // /month/h(행복마음 아청 가정 판) = month/index.html 그대로 — 화면이 주소를 보고 아청 통장만 바꾼다. 누가 index.html만 고쳐도 여기서 맞춘다
  const src = fs.readFileSync(path.join(DIR, 'index.html')), hp = path.join(DIR, 'h', 'index.html');
  if (!fs.existsSync(hp) || !fs.readFileSync(hp).equals(src)) { fs.mkdirSync(path.dirname(hp), { recursive: true }); fs.writeFileSync(hp, src); console.log('month/h/index.html 맞춤'); }
}

main().catch(e => { console.error(e); process.exit(1); });
