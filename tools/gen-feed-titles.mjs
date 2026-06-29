// 피드 제목 자동 생성 — 클로드 API. posts.json의 활동글 중 feedTitle 없는 글(=새 글)만 채운다.
// 동기화(sync-blog.mjs) 뒤에 돌리면, 블로그 새 글이 자동으로 깔끔한 2~3줄 피드 제목을 단다.
//   node tools/gen-feed-titles.mjs         (없는 것만)
//   node tools/gen-feed-titles.mjs --all   (전부 다시 — 프롬프트 튜닝 후)
// 키: 환경변수 ANTHROPIC_API_KEY (로컬 .env 또는 GitHub Actions secret). 채팅/코드에 평문 금지.
import { readFile, writeFile } from 'node:fs/promises';

const MODEL = process.env.FEEDTITLE_MODEL || 'claude-sonnet-4-6';
const KEY = process.env.ANTHROPIC_API_KEY;
const ALL = process.argv.includes('--all');
const POSTS = new URL('../activities/posts.json', import.meta.url);

const SYSTEM = `너는 생각공작소(인천 영유아 발달 방문수업 '오감쑥쑥')의 활동사진 피드에 얹을 짧은 한국어 제목을 만든다. 인스타 피드 사진 위 2~3줄 제목.

규칙:
- 2줄 또는 3줄(보통 3줄).
- 각 줄 '폭' ≤ 8.3. 폭 = 글자수 + 띄어쓰기수×0.3. 예) "퍼니버니 보드게임"=8+0.3=8.3(상한). 물음표·느낌표·숫자·영문은 좁아서 살짝 더 길어도 됨.
- 줄끼리 길이가 비슷해야 한다. 한 줄만 너무 길면 안 됨.
- 너무 잘게 쪼개지 마라(예 "달토끼가/만들어준/인절미"=나쁨, 한 단어를 억지로 한 줄로 두지 말 것).
- 느슨한 틀: 1줄=짧은 훅(의성어·질문·반전·감탄), 2줄=재미있는 설명, 3줄=핵심 명사. 단 모든 글에 같은 틀 금지 — 글마다 변주(어떤 건 2줄, 질문형, 끝이 동사 등).
- "만들기"로 꼭 끝낼 필요 없다.
- 킥(재치·반전·아이 목소리)이 있어야 한다. 밋밋한 요약 금지.
- 이모지·해시태그·따옴표·말줄임표·영어설명 금지. 순수 한국어.
- 출력은 제목 2~3줄만. 각 줄 줄바꿈. 다른 말 금지.

예시:
퍼니버니 보드게임(당근밭 토끼) → 두근두근\\n당근밭 대소동\\n퍼니버니 보드게임
개미집(땅 속 상상) → 땅 속을\\n상상해 봤어?\\n개미집 만들기
인절미(동화 속 달토끼) → 동화 속 달토끼\\n콩콩 빚은\\n쫀득 인절미
햄버거김밥(도시락 속 미니햄버거인 줄, 사실 김밥) → 이게 햄버거라고?\\n한 입 먹으면 김밥\\n햄버거 김밥
키키리키 보드게임(승리보다 경험, 건강한 좌절) → 져도 괜찮아\\n지는 법도 배워\\n키키리키
겨울 간식 포차 → 오뎅 어묵\\n겨울 간식\\n포차 오픈!`;

async function genOne(title, excerpt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 80, system: SYSTEM,
      messages: [{ role: 'user', content: `글 제목: ${title}\n본문 발췌: ${excerpt || ''}\n\n이 활동의 피드 제목을 만들어줘.` }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = (j.content || []).map((c) => c.text || '').join('').trim();
  // 2~3줄만, 각 줄 군더더기 제거
  const lines = text.split('\n').map((l) => l.replace(/^["'\s]+|["'\s]+$/g, '')).filter(Boolean).slice(0, 3);
  return lines.length >= 2 ? lines.join('\n') : null;
}

if (!KEY) { console.error('ANTHROPIC_API_KEY 없음 — 건너뜀(피드 제목 미생성, 원제목 폴백).'); process.exit(0); }
const data = JSON.parse(await readFile(POSTS, 'utf8'));
const targets = data.posts.filter((p) => /오감쑥쑥/.test(p.tag || '') && (ALL || !p.feedTitle));
console.log(`대상 ${targets.length}건 (${ALL ? '전부' : '신규만'})`);
let done = 0;
for (const p of targets) {
  try {
    const ft = await genOne(p.title, p.excerpt);
    if (ft) { p.feedTitle = ft; done++; console.log(`✓ ${p.logNo}: ${ft.replace(/\n/g, ' / ')}`); }
    else console.warn(`✗ ${p.logNo}: 형식 미달, 건너뜀`);
  } catch (e) { console.warn(`✗ ${p.logNo}: ${e.message}`); }
}
if (done) await writeFile(POSTS, JSON.stringify(data, null, 1), 'utf8');
console.log(`feedTitle 생성 ${done}/${targets.length}건`);
