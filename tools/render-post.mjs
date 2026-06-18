// 본문 블록(extract-post) + 메타 → 개별 글 HTML 페이지 문자열.
// 페이지 위치: activities/posts/<logNo>.html (공통 자산은 ../../ 상대, 본문 이미지는 img/<logNo>/<n>.jpg)
// SEO: title·description·canonical·OG(article)·JSON-LD Article 풀세트 — 구글 색인용.

const SITE = 'https://think-factory.kr';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// <script> 안에 JSON-LD를 넣을 때 </script> 브레이크아웃 차단 (title/desc가 작가 제어 = 준신뢰).
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

// 문단 → <p> (정렬·해시태그 클래스 적용). p.html은 extract에서 이미 안전 이스케이프됨.
// align은 enum 화이트리스트로 재검증(방어심층 — 속성 주입 차단, extract 신뢰에 의존 안 함).
const ALIGN_OK = new Set(['center', 'right', 'justify']);
function renderPara(p) {
  const isTag = /^#\S/.test(p.text || '');
  const cls = isTag ? ' class="tags"' : '';
  const align = !isTag && ALIGN_OK.has(p.align) ? ` style="text-align:${p.align}"` : '';
  return `<p${cls}${align}>${p.html}</p>`;
}

// 본문 블록 → 기사 HTML (순서 보존). 이미지 그룹=가로 strip, 단일=풀폭.
function renderBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.kind === 'text') {
      for (const p of b.paras) out.push(renderPara(p));
    } else if (b.kind === 'quote') {
      out.push(`<blockquote>${b.paras.map(renderPara).join('')}</blockquote>`);
    } else if (b.kind === 'images') {
      const locals = b.locals || [];
      if (!locals.length) continue;
      if (b.layout === 'strip' && locals.length > 1) {
        const imgs = locals.map((l, i) => `<img src="${esc(l)}" alt="${esc(b.alt ? b.alt + ' ' + (i + 1) : '')}" loading="lazy">`).join('');
        out.push(`<figure class="strip strip-${locals.length}">${imgs}</figure>`);
      } else {
        out.push(`<figure><img src="${esc(locals[0])}" alt="${esc(b.alt || '')}" loading="lazy"></figure>`);
      }
    } else if (b.kind === 'hr') {
      out.push('<hr>');
    }
  }
  return out.join('\n');
}

// post = {logNo,title,date,tag,url}, blocks = 로컬경로(locals) 박힌 블록, desc = SEO 설명, ogImage = 절대 URL(첫 이미지), keywords = 해시태그 문자열
export function renderPost(post, blocks, desc, ogImage, keywords = '') {
  const pageUrl = `${SITE}/activities/posts/${post.logNo}.html`;
  const title = post.title;
  const isoDate = (post.date || '').replace(/\./g, '-');                  // 2026.06.10 → 2026-06-10 (date 누락 방어)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    image: ogImage ? [ogImage] : undefined,
    datePublished: isoDate,
    dateModified: isoDate,
    author: { '@type': 'Organization', name: '생각공작소' },
    publisher: { '@type': 'Organization', name: '생각공작소', logo: { '@type': 'ImageObject', url: `${SITE}/assets/logo.png` } },
    mainEntityOfPage: pageUrl,
    description: desc,
  };
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | 생각공작소</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="생각공작소">${keywords ? `\n<meta name="keywords" content="${esc(keywords)}">` : ''}
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${pageUrl}">${ogImage ? `\n<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta property="article:published_time" content="${isoDate}">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32x32.png">
<link rel="apple-touch-icon" href="../../assets/android-icon-192x192.png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="../../css/site.css">
<script type="application/ld+json">${jsonLd(ld)}</script>
</head>
<body>

<nav class="nav">
  <div class="inner">
    <a class="brand" href="../../index.html"><img src="../../assets/logo.png" alt="생각공작소"></a>
    <a class="menu" href="../../index.html">홈</a>
    <a class="menu" href="../../story.html">이야기</a>
    <a class="menu" href="../../services.html">서비스</a>
    <a class="menu on" href="../../activities.html">활동</a>
    <a class="cta" href="../../contact.html">상담 신청</a>
    <button class="hb" id="hbBtn" aria-label="메뉴 열기"><span></span><span></span><span></span></button>
  </div>
</nav>

<article class="post">
  <div class="inner">
    <a class="back" href="../../activities.html">← 활동 이야기</a>
    <div class="date">${esc(post.date)}${post.tag ? ' · ' + esc(post.tag) : ''}</div>
    <h1>${esc(title)}</h1>
    <div class="post-body">
${renderBlocks(blocks)}
    </div>
    <div class="post-foot">
      <a href="${esc(post.url)}" target="_blank" rel="noopener">네이버 블로그에서 원문 보기 →</a>
      <a class="back" href="../../activities.html">← 다른 활동 이야기 보기</a>
    </div>
  </div>
</article>

<footer>
  <div class="inner">
    <div class="flinks">
      <a href="../../privacy.html">개인정보 처리방침</a>
      <a href="https://blog.naver.com/think5007" target="_blank" rel="noopener">교사지원</a>
    </div>
    <div class="info">
      <div class="row"><span><b class="k">상호명</b>생각공작소</span><span><b class="k">대표</b>한유성</span></div>
      <div class="row"><span><b class="k">사업자등록번호</b>410-96-58003</span><span><b class="k">대표전화</b>032-277-2007 (평일 11:00~18:00)</span></div>
      <div class="row"><span><b class="k">주소</b>인천광역시 미추홀구 주안로 128, 우리들애 601호</span><span><b class="k">이메일</b>think5007@naver.com</span></div>
      <div class="copy">© 2026 생각공작소</div>
    </div>
  </div>
</footer>

<div class="drawer" id="drawer">
  <div class="dim" data-close></div>
  <div class="panel">
    <button class="dclose" data-close aria-label="메뉴 닫기">×</button>
    <a href="../../index.html">홈</a>
    <a href="../../story.html">이야기</a>
    <a href="../../services.html">서비스</a>
    <a href="../../activities.html">활동</a>
    <a class="dcta" href="../../contact.html">상담 신청</a>
  </div>
</div>

<div class="fab">
  <a class="f kakao" href="http://pf.kakao.com/_MnPkn" target="_blank" rel="noopener" aria-label="카카오톡 채널" title="카카오톡 채널">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7L6 21.5c-.1.4.3.7.6.5l4.2-2.6c.4 0 .8.1 1.2.1 5.5 0 10-3.6 10-8.1S17.5 3 12 3z"/></svg>
  </a>
  <a class="f insta" href="https://www.instagram.com/think_fact0ry/" target="_blank" rel="noopener" aria-label="인스타그램" title="인스타그램">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>
  </a>
  <a class="f naver" href="https://blog.naver.com/think5007" target="_blank" rel="noopener" aria-label="네이버 블로그" title="네이버 블로그">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.3 12.7 7.4 0H0v24h7.7V11.3L16.6 24H24V0h-7.7v12.7z" transform="translate(2.5 2.5) scale(0.79)"/></svg>
  </a>
  <a class="f top" href="#" id="toTop" aria-label="맨 위로" title="맨 위로">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14l7-7 7 7"/></svg>
  </a>
</div>

<script>
(function () {
  var d = document.getElementById('drawer'), b = document.getElementById('hbBtn');
  if (d && b) {
    var close = function () { d.classList.remove('open'); document.body.style.overflow = ''; };
    b.addEventListener('click', function () { d.classList.add('open'); document.body.style.overflow = 'hidden'; });
    d.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close') || e.target.closest('a')) close(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 760 && d.classList.contains('open')) close(); });
  }
  var tb = document.getElementById('toTop');
  if (tb) {
    tb.addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    var toggle = function () { tb.classList.toggle('show', window.pageYOffset > 300); };
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();
  }
})();
</script>

</body>
</html>
`;
}
