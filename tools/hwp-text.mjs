// 한글 파일(.hwp, .hwpx) → 문단 글. 의존성 0(node 내장 zlib만). tools/icss-watch.mjs가 지원단 공고 첨부를 읽을 때 쓴다.
//
// 출처: 부모 레포 tools/한글문서/hwp읽기.js(2026-08-28)를 모듈로 옮기고 두 가지를 더함(2026-10-29)
//  ① Section0만이 아니라 Section1, 2…를 차례로 읽는다(쪽이 많은 공고).
//  ② .hwpx(ZIP+XML)도 읽는다. 지원단 공고 첨부는 2025~2026년 실측 hwp 33개, hwpx 0개지만 구청마다 바뀔 수 있다.
// .hwp = CFB(OLE) 안 BodyText/SectionN 스트림을 raw inflate → 레코드 tag 67(PARA_TEXT, UTF-16LE). 표 칸도 문단으로 나온다(칸마다 한 줄).
// 배포용 문서(ViewText 암호화)나 깨진 파일은 '' — 부르는 쪽이 「못 읽음」으로 다룬다.
import zlib from 'node:zlib';

const END = 0xFFFFFFFE;

function cfbStreams(b) {
  const ssz = 1 << b.readUInt16LE(30), msz = 1 << b.readUInt16LE(32);
  const dirStart = b.readUInt32LE(48), miniCut = b.readUInt32LE(56), miniStart = b.readUInt32LE(60);
  const difStart = b.readUInt32LE(68), nDif = b.readUInt32LE(72);
  const off = s => 512 + s * ssz;
  const fatSecs = [];
  for (let i = 0; i < 109; i++) { const v = b.readUInt32LE(76 + i * 4); if (v < END) fatSecs.push(v); }
  let ds = difStart;
  for (let n = 0; n < nDif && ds < END; n++) {
    const base = off(ds), per = ssz / 4 - 1;
    for (let i = 0; i < per; i++) { const v = b.readUInt32LE(base + i * 4); if (v < END) fatSecs.push(v); }
    ds = b.readUInt32LE(base + per * 4);
  }
  const FAT = [];
  for (const s of fatSecs) { const base = off(s); for (let i = 0; i < ssz / 4; i++) FAT.push(b.readUInt32LE(base + i * 4)); }
  const chain = st => { const o = []; let s = st, g = 0; while (s < END && g++ < 200000) { o.push(s); s = FAT[s]; } return o; };
  const readChain = (st, sz) => Buffer.concat(chain(st).map(s => b.subarray(off(s), off(s) + ssz))).subarray(0, sz);
  const DIR = Buffer.concat(chain(dirStart).map(s => b.subarray(off(s), off(s) + ssz)));
  const entries = [];
  for (let i = 0; i * 128 < DIR.length; i++) {
    const e = DIR.subarray(i * 128, (i + 1) * 128), nl = e.readUInt16LE(64);
    if (nl < 2) continue;
    entries.push({ name: e.subarray(0, nl - 2).toString('utf16le'), type: e[66], start: e.readUInt32LE(116), size: Number(e.readBigUInt64LE(120)) });
  }
  const root = entries.find(e => e.type === 5);
  const miniBuf = root && root.size > 0 ? readChain(root.start, root.size) : null;
  const MFAT = [];
  { const m = Buffer.concat(chain(miniStart).map(s => b.subarray(off(s), off(s) + ssz))); for (let i = 0; i < m.length / 4; i++) MFAT.push(m.readUInt32LE(i * 4)); }
  const readMini = (st, sz) => { const p = []; let s = st, g = 0; while (s < END && g++ < 200000) { p.push(miniBuf.subarray(s * msz, s * msz + msz)); s = MFAT[s]; } return Buffer.concat(p).subarray(0, sz); };
  const read = e => (e.size < miniCut && miniBuf) ? readMini(e.start, e.size) : readChain(e.start, e.size);
  return { entries, read };
}

const INLINE = new Set([4, 5, 6, 7, 8, 9, 19, 20]);
const EXT = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);

function paraTexts(d) {
  const out = [];
  let p = 0;
  while (p + 4 <= d.length) {
    const h = d.readUInt32LE(p); p += 4;
    const tag = h & 0x3FF; let size = (h >>> 20) & 0xFFF;
    if (size === 0xFFF) { size = d.readUInt32LE(p); p += 4; }
    if (tag === 67) {
      const seg = d.subarray(p, p + size); let s = '', i = 0;
      while (i + 1 < seg.length) {
        const c = seg.readUInt16LE(i);
        if (c < 32) { if (EXT.has(c) || INLINE.has(c)) i += 16; else { if (c === 10 || c === 13) s += '\n'; i += 2; } }
        else { s += String.fromCharCode(c); i += 2; }
      }
      out.push(s);
    }
    p += size;
  }
  return out;
}

function hwp(b) {
  const { entries, read } = cfbStreams(b);
  const fh = entries.find(e => e.type === 2 && e.name === 'FileHeader');
  if (fh) { const flags = read(fh).readUInt32LE(36); if (flags & 0b110) return ''; }   // 암호 걸림(bit1) 또는 배포용(bit2) = 못 읽음
  // BodyText 아래 SectionN — 이름이 같은 스트림(ViewText)이 있어도 배포용은 위에서 이미 돌려보냈다
  const secs = entries.filter(e => e.type === 2 && /^Section\d+$/.test(e.name))
    .sort((a, c) => +a.name.slice(7) - +c.name.slice(7))
    .filter((e, i, all) => i === 0 || e.name !== all[i - 1].name);
  const paras = [];
  for (const sec of secs) {
    const raw = read(sec);
    let d = null;
    for (const fn of [zlib.inflateRawSync, zlib.inflateSync]) { try { d = fn(raw); break; } catch (e) { /* 다음 방법 */ } }
    paras.push(...paraTexts(d || raw));
  }
  return paras.map(t => t.replace(/\s+$/, '')).filter(t => t.trim()).join('\n');
}

// .hwpx = ZIP. 중앙 디렉터리에서 Contents/sectionN.xml을 찾아 <hp:t> 글을 모은다(문단 = </hp:p>)
function hwpx(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return '';
  const n = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const files = [];
  for (let k = 0; k < n && b.readUInt32LE(p) === 0x02014b50; k++) {
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20);
    const nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), lho = b.readUInt32LE(p + 42);
    files.push({ name: b.subarray(p + 46, p + 46 + nl).toString('utf8'), method, csize, lho });
    p += 46 + nl + xl + cl;
  }
  const secs = files.filter(f => /^Contents\/section\d+\.xml$/i.test(f.name)).sort((a, c) => +a.name.match(/\d+/)[0] - +c.name.match(/\d+/)[0]);
  const out = [];
  for (const f of secs) {
    const l = f.lho, start = l + 30 + b.readUInt16LE(l + 26) + b.readUInt16LE(l + 28);
    const data = b.subarray(start, start + f.csize);
    const xml = (f.method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    for (const para of xml.split(/<\/hp:p>/)) {
      const t = [...para.matchAll(/<hp:t(?:\s[^>]*)?>([^<]*)<\/hp:t>/g)].map(m => m[1]).join('')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      if (t.trim()) out.push(t.trim());
    }
  }
  return out.join('\n');
}

// 파일 모양은 이름이 아니라 앞 바이트로 가린다(지원단 첨부는 이름과 실제가 다를 수 있다)
export function kindOfBytes(b) {
  if (b.length >= 8 && b.readUInt32LE(0) === 0xE011CFD0 && b.readUInt32LE(4) === 0xE11AB1A1) return 'hwp';
  if (b.length >= 4 && b.readUInt32LE(0) === 0x04034b50) return 'zip';
  if (b.length >= 4 && b.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  return 'other';
}

export function hwpText(b) {
  try {
    const k = kindOfBytes(b);
    if (k === 'hwp') return hwp(b);
    if (k === 'zip') return hwpx(b);
  } catch (e) { /* 깨진 파일 */ }
  return '';
}
