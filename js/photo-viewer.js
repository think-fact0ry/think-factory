// 활동 글 사진 뷰어 — 본문 사진을 탭하면 전면으로 열려 넘겨 본다. (2026-08-31)
//
// 왜: Clarity 녹화에서 학부모가 활동 글의 사진을 반복해서 탭하는데 아무 일도 안 났다
//     (21 시트 url×DeadClickCount = 08-28 창 activities/posts/224291425765.html 세션의 100%).
//     본문 strip 사진은 폰에서 장당 ~173px로 렌더된다 → 전면이면 ~386px = 2.2배.
//
// 형태(유성 확정 2026-08-31): 페이지를 새로 만들지 않고 **오버레이 + 해시**(`…html#p=4`).
//   뒤로가기·새로고침·주소 공유가 '페이지처럼' 되면서 sitemap·canonical·중복 콘텐츠 비용이 0이다.
//   ⚠ 사진 넘김은 pushState가 아니라 replaceState — 21장 넘기고 뒤로가기를 21번 누르게 하지 않는다.
//
// 시각·동작(전부 유성 픽, prototype/홈페이지_활동글_사진뷰어_프리뷰.html에서 렌더 비교 후 확정):
//   검정 배경 / 페이드로 열림 / 좌상단 글 제목(앞줄, 잘림) / 위 가운데 카운터 / 우상단 공유+닫기
//   / 하단 썸네일 줄 / 사진 탭 = 닫기 / 위·아래로 쓸어 닫기 / PC는 좌우 화살표·키보드
//   🔴 §4.10 예외: 전면 닫기 ×는 원칙상 '좌상단'인데 여기만 **우상단**이다.
//      이유 = 네이버 블로그 뷰어가 학부모에게 더 익숙하다(유성 2026-08-31). 이 화면 한정 일회 예외이지 원칙 갱신이 아니다.
//
// ⚠ CSS를 site.css가 아니라 이 파일 안에 두는 이유: site.css엔 캐시 꼬리표(`?v=`)가 없어서
//    돌아온 방문자에게 '새 JS + 옛 CSS'가 될 수 있다(스타일 없는 오버레이). 새 파일 하나면 둘이 같이 갱신된다.
//    색·라운드는 site.css의 `var(--…)` 토큰을 그대로 쓴다(docs/1 §3.1 정본).
//
// 되돌리기: tools/render-post.mjs의 이 파일 include 한 줄을 지우고 Actions 재생성. (readback = RB-005)

(function () {
  'use strict';

  var imgs = [].slice.call(document.querySelectorAll('.post-body figure img'));
  if (!imgs.length) return;                       // 사진 없는 글(안내·가이드 3건)은 아무것도 하지 않는다

  var N = imgs.length;
  var art = document.querySelector('article.post');
  var canon = document.querySelector('link[rel="canonical"]');
  var SHARE_URL = (canon && canon.href) || location.href.split('#')[0];      // 유성 확정: 공유는 해시 없는 글 주소
  var H1 = document.querySelector('.post h1');
  var TITLE_FULL = H1 ? H1.textContent.trim() : document.title;
  var TITLE = (art && art.getAttribute('data-t1')) || TITLE_FULL;            // 화면 표시는 제목 앞줄
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  function tag(name) { try { if (window.clarity) window.clarity('event', name); } catch (e) {} }   // analytics.js 게이트 존중(없으면 무시)

  // ── 스타일 (고유 접두 pv- · 루트 #tfpv) ──────────────────────────────
  var css = [
    '#tfpv{position:fixed;inset:0;z-index:1200;display:none;overscroll-behavior:contain}',
    '#tfpv.on{display:block}',
    '#tfpv .pv-bd{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .26s ease}',
    '#tfpv.in .pv-bd{opacity:1}',
    // 필름스트립 — 사진 요소가 하나면 손 뗄 때 '제자리로 돌아오며 src만 바뀌어' 새 사진이 반대 방향에서 튀어나온다(유성 08-31 반려).
    // 그래서 [이전][지금][다음] 3칸을 실제로 옆에 두고 트랙을 민다. 끌고 있는 동안 지금 사진은 절대 안 바뀐다.
    '#tfpv .pv-stage{position:absolute;inset:0;overflow:hidden}',
    '#tfpv .pv-track{position:absolute;left:0;right:0;top:56px;bottom:104px;display:flex;transform:translateX(-100%);' +
      'opacity:0;transition:opacity .26s ease;will-change:transform}',
    '#tfpv.in .pv-track{opacity:1}',
    '#tfpv .pv-track.mv{transition:transform .3s cubic-bezier(.22,.7,.25,1),opacity .26s ease}',
    '#tfpv .pv-cell{flex:0 0 100%;display:flex;align-items:center;justify-content:center;min-width:0}',
    '#tfpv .pv-img{max-width:100%;max-height:100%;width:auto;height:auto;display:block}',
    '#tfpv .pv-cell.empty .pv-img{visibility:hidden}',
    // 크롬(상단바·카운터·썸네일)
    '#tfpv .pv-chrome{opacity:0;transition:opacity .24s ease}',
    '#tfpv.in .pv-chrome{opacity:1}',
    '#tfpv .pv-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:flex-start;gap:8px;' +
      'padding:calc(10px + env(safe-area-inset-top)) 8px 26px;background:linear-gradient(rgba(0,0,0,.5),transparent)}',   // §3.5 scrim — 밝은 사진 위에서도 대비 확보
    '#tfpv .pv-title{flex:0 1 auto;min-width:0;max-width:calc(50% - 48px);color:var(--ink-on-dark,#F9FBFA);font-size:14px;font-weight:600;' +
      'line-height:1.4;padding:11px 6px 0 10px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;word-break:keep-all}',
    '#tfpv .pv-sp{flex:1 1 auto}',
    '#tfpv .pv-btn{flex:0 0 auto;width:44px;height:44px;border:0;background:transparent;color:var(--ink-on-dark,#F9FBFA);' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:transform .12s}',
    '#tfpv .pv-btn:active{transform:scale(.93)}',                                   // §5.3-2 박스 없는 요소 = 축소만, 색 변경 없음
    '#tfpv .pv-btn svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '#tfpv .pv-count{position:absolute;left:50%;transform:translateX(-50%);top:calc(21px + env(safe-area-inset-top));' +
      'color:var(--ink-on-dark,#F9FBFA);font-size:13px;font-weight:700;letter-spacing:.4px;pointer-events:none}',
    // PC 화살표
    '#tfpv .pv-nav{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border:0;border-radius:50%;' +
      'background:rgba(0,0,0,.34);color:var(--ink-on-dark,#F9FBFA);display:none;align-items:center;justify-content:center;cursor:pointer;transition:background .18s,transform .12s}',
    '#tfpv .pv-nav:hover{background:rgba(0,0,0,.55)}',
    '#tfpv .pv-nav:active{transform:translateY(-50%) scale(.93)}',
    '#tfpv .pv-nav svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
    // 끝에 닿은 화살표: 흐리게 두되 **죽이지는 않는다**. pointer-events:none이면 그 자리 클릭이 뒤 배경으로 새서
    // 뷰어가 닫히고(놀람), 그냥 무반응으로 두면 그게 또 데드클릭이다 → §4.9대로 shake로 "지금은 못 눌러요"를 말한다.
    '#tfpv .pv-nav.end{opacity:.25}',
    '#tfpv .pv-nav.shake{animation:pvshake .3s}',
    '@keyframes pvshake{0%,100%{transform:translateY(-50%) translateX(0)}25%{transform:translateY(-50%) translateX(-4px)}75%{transform:translateY(-50%) translateX(4px)}}',
    '#tfpv .pv-prev{left:14px}#tfpv .pv-next{right:14px}',
    '@media (hover:hover) and (pointer:fine){#tfpv .pv-nav{display:flex}}',
    // 썸네일 줄 — 본문과 같은 URL이라 스크롤해서 본 사진은 캐시 히트(새 바이트 0)
    '#tfpv .pv-thumbs{position:absolute;left:0;right:0;bottom:0;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;' +
      'padding:14px 14px calc(14px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.5) 45%)}',
    '#tfpv .pv-thumbs::-webkit-scrollbar{display:none}',
    '#tfpv .pv-thumbs img{flex:0 0 auto;width:46px;height:46px;object-fit:cover;border-radius:var(--r-sm,8px);opacity:.42;' +
      'outline:2px solid transparent;outline-offset:-2px;cursor:pointer;transition:opacity .18s,outline-color .18s}',
    '#tfpv .pv-thumbs img.cur{opacity:1;outline-color:var(--ink-on-dark,#F9FBFA)}',   // ⛔ 솔리드 초록 선택 상태는 재제안 금지 목록
    // 로딩 = 출렁이는 점 3개(§5.2 — 정적 '…' 금지)
    '#tfpv .pv-load{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:var(--ink-on-dark,#F9FBFA);' +
      'font-size:14px;font-weight:600;display:none;align-items:center}',
    '#tfpv.loading .pv-load{display:flex}',
    '#tfpv .pv-dots{display:inline-flex;gap:3px;margin-left:7px;vertical-align:middle}',
    '#tfpv .pv-dots i{width:4px;height:4px;border-radius:50%;background:var(--ink-on-dark,#F9FBFA);animation:pvld .9s infinite ease-in-out}',
    '#tfpv .pv-dots i:nth-child(2){animation-delay:.16s}#tfpv .pv-dots i:nth-child(3){animation-delay:.32s}',
    '@keyframes pvld{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-4px);opacity:1}}',
    // 토스트 = site.css .exithint 스펙 복제(§5.5 성공 = 초록 원 + 흰 체크)
    '#tfpv .pv-toast{position:absolute;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(10px);' +
      'display:flex;align-items:center;gap:10px;max-width:calc(100% - 32px);background:#191f28;color:#F9FBFA;font-size:14.5px;font-weight:600;' +
      'padding:9px 20px 9px 9px;border-radius:99px;box-shadow:0 6px 24px rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;white-space:nowrap}',
    '#tfpv .pv-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}',
    '#tfpv .pv-toast .ck{width:28px;height:28px;border-radius:50%;background:var(--green600,#3a8a5f);display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '#tfpv .pv-toast .ck svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    '@media (hover:hover) and (pointer:fine){.post-body figure img{cursor:zoom-in}}',
    '@media (prefers-reduced-motion:reduce){#tfpv .pv-bd,#tfpv .pv-img,#tfpv .pv-chrome,#tfpv .pv-toast{transition-duration:.01ms!important}}',
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ── DOM ──────────────────────────────────────────────────────────────
  var ICON_SHARE = '<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_L = '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>';
  var ICON_R = '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';
  var ICON_CK = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';

  var pv = document.createElement('div');
  pv.id = 'tfpv';
  pv.setAttribute('role', 'dialog');
  pv.setAttribute('aria-modal', 'true');
  pv.innerHTML =
    '<div class="pv-bd"></div>' +
    '<div class="pv-stage"><div class="pv-track">' +                                        // alt="" — 본문 alt는 SEO 키워드 문자열이라 복제하지 않는다
      '<div class="pv-cell"><img class="pv-img" alt="" draggable="false"></div>' +          // 이전
      '<div class="pv-cell"><img class="pv-img" alt="" draggable="false"></div>' +          // 지금
      '<div class="pv-cell"><img class="pv-img" alt="" draggable="false"></div>' +          // 다음
    '</div></div>' +
    '<div class="pv-load"><span>사진을 불러오고 있어요<span class="pv-dots"><i></i><i></i><i></i></span></span></div>' +
    '<div class="pv-chrome">' +
      '<div class="pv-top"><div class="pv-title"></div><span class="pv-sp"></span>' +
        '<button class="pv-btn pv-share" aria-label="공유하기">' + ICON_SHARE + '</button>' +
        '<button class="pv-btn pv-close" aria-label="닫기">' + ICON_X + '</button></div>' +
      '<div class="pv-count"></div>' +
      '<button class="pv-nav pv-prev" aria-label="이전 사진">' + ICON_L + '</button>' +
      '<button class="pv-nav pv-next" aria-label="다음 사진">' + ICON_R + '</button>' +
      '<div class="pv-thumbs"></div>' +
    '</div>' +
    '<div class="pv-toast"><span class="ck">' + ICON_CK + '</span><span class="msg"></span></div>';
  document.body.appendChild(pv);

  var $ = function (s) { return pv.querySelector(s); };
  var stage = $('.pv-stage'), track = $('.pv-track');
  var cells = [].slice.call(pv.querySelectorAll('.pv-cell'));      // [이전, 지금, 다음]
  var cellImg = cells.map(function (c) { return c.querySelector('.pv-img'); });
  var curImg = function () { return cellImg[1]; };
  var elCount = $('.pv-count'), elThumbs = $('.pv-thumbs');
  var elPrev = $('.pv-prev'), elNext = $('.pv-next'), toast = $('.pv-toast'), toastMsg = $('.pv-toast .msg');
  $('.pv-title').textContent = TITLE;

  imgs.forEach(function (im, i) {
    var t = document.createElement('img');
    t.src = im.src; t.alt = ''; t.loading = 'lazy'; t.decoding = 'async';
    t.addEventListener('click', function () { go(i); });
    elThumbs.appendChild(t);
  });

  var idx = 0, open = false, toastT = null, nexted = false, bodyOv = '';

  function prefetch(i) {
    [i - 2, i - 1, i + 1, i + 2].forEach(function (j) {
      if (j >= 0 && j < N) { var im = new Image(); im.decoding = 'async'; im.src = imgs[j].src; }
    });
  }

  // 3칸에 실제 사진을 앉힌다(이전·지금·다음). 트랙은 항상 -100%에 서서 가운데 칸을 보여준다.
  function renderCells(i) {
    [i - 1, i, i + 1].forEach(function (n, k) {
      var has = n >= 0 && n < N;
      cells[k].classList.toggle('empty', !has);
      cellImg[k].src = has ? imgs[n].src : cellImg[k].src || '';
    });
    var c = curImg();
    pv.classList.toggle('loading', !c.complete);
    c.onload = function () { pv.classList.remove('loading'); };
  }
  function trackX(pct, px) { track.style.transform = 'translateX(calc(' + pct + '% + ' + (px || 0) + 'px))'; }

  // syncUrl=false = 주소를 건드리지 않는다. ⚠ 열 때 여기서 replaceState를 하면 **글의 히스토리 칸**에
  //   `#p=` 상태가 덮어씌워져, 뒤로가기가 '닫기'가 아니라 '그 칸으로 복귀'가 되고 닫은 뒤에도 주소에 해시가 남는다.
  function syncUI(i, syncUrl) {
    elCount.textContent = (i + 1) + ' / ' + N;
    pv.setAttribute('aria-label', '사진 ' + (i + 1) + ' / ' + N);
    for (var j = 0; j < elThumbs.children.length; j++) {
      var t = elThumbs.children[j];
      t.classList.toggle('cur', j === i);
      if (j === i && t.scrollIntoView) t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: open && !REDUCED ? 'smooth' : 'auto' });
    }
    elPrev.classList.toggle('end', i === 0);
    elNext.classList.toggle('end', i === N - 1);
    prefetch(i);
    if (syncUrl) { try { history.replaceState({ pv: 1, i: i }, '', '#p=' + (i + 1)); } catch (e) {} }   // 넘김은 칸을 쌓지 않고 주소만 갈아끼운다
  }
  function paint(i, syncUrl) { idx = i; renderCells(i); trackX(-100); syncUI(i, syncUrl); }

  // 옆 칸으로 한 장 — 트랙을 그 칸까지 밀고, **끝난 뒤에** 칸을 재배치한다(재배치는 눈에 안 보인다).
  var sliding = false, slideT = null;
  // 진행 중인 밀기를 그 자리서 마무리한다. 막지 않고 마무리하는 이유 = 화살표 연타·빠른 연속 스와이프가
  // 300ms 동안 통째로 먹히면 "안 눌린다"로 읽힌다(실측: 5연타 중 1번만 반영).
  function finishSlide() {
    if (!sliding) return;
    clearTimeout(slideT); slideT = null;
    track.classList.remove('mv');
    renderCells(idx);
    trackX(-100);
    sliding = false;
  }
  function slide(dir) {
    var to = idx + dir;
    if (to < 0 || to >= N) { settleBack(); return; }
    finishSlide();                                       // 이전 밀기를 닫고 새 위치를 기준으로 이어 민다
    idx = to;
    syncUI(idx, true);                                   // 카운터·주소는 즉시 — 들어오는 사진이 이미 보이니까
    if (REDUCED) { renderCells(idx); trackX(-100); return; }
    sliding = true;
    track.classList.add('mv');
    trackX(dir > 0 ? -200 : 0);                          // 다음=왼쪽으로, 이전=오른쪽으로 밀린다
    slideT = setTimeout(finishSlide, 300);               // 전환 끄고 같은 프레임에 재배치+원위치 → 깜빡임 0
    if (!nexted) { nexted = true; tag('photo_next'); }
  }
  function settleBack() { track.classList.add('mv'); trackX(-100); }

  // 옆 칸이면 밀고, 멀리 뛰면(썸네일 탭) 그냥 갈아끼운다 — 10칸을 밀어 보여줄 이유가 없다.
  function go(i) {
    if (i < 0 || i >= N || i === idx) return;
    if (Math.abs(i - idx) === 1) { slide(i - idx); return; }
    finishSlide();
    paint(i, true);
    if (!nexted) { nexted = true; tag('photo_next'); }
  }

  // push=false = 히스토리를 이미 그 자리에 둔 채 여는 경우(앞으로가기로 되돌아옴) — 칸을 또 쌓지 않는다
  function openAt(i, push) {
    if (open) return;
    open = true;
    bodyOv = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    pv.classList.add('on');
    paint(i, false);                                   // 주소는 아래 pushState가 새 칸에 얹는다(글의 칸은 안 건드림)
    requestAnimationFrame(function () { pv.classList.add('in'); });
    if (push !== false) { try { history.pushState({ pv: 1, i: i }, '', '#p=' + (i + 1)); } catch (e) {} }
    tag('photo_open');
  }

  function closeNow() {
    if (!open) return;
    open = false;
    // 히스토리를 안 거치고 닫힌 경우(딥링크 정리 뒤 등)에도 주소에 해시가 남지 않게
    if (/^#p=\d+$/.test(location.hash || '')) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    pv.classList.remove('in');
    setTimeout(function () {
      pv.classList.remove('on', 'loading');
      track.classList.remove('mv');
      track.style.opacity = '';
      trackX(-100);
      sliding = false;
      $('.pv-bd').style.opacity = '';
      document.body.style.overflow = bodyOv;
      var t = imgs[idx];
      if (t && t.scrollIntoView) { var r = t.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) t.scrollIntoView({ block: 'center' }); }
    }, REDUCED ? 0 : 280);
  }
  // 닫기는 언제나 히스토리를 통해서 — 버튼·제스처·하드웨어 뒤로가 같은 길로 모인다(§4.11-2)
  function requestClose() { if (history.state && history.state.pv) history.back(); else closeNow(); }

  imgs.forEach(function (im, i) {
    im.addEventListener('click', function (e) { e.preventDefault(); openAt(i); });
  });

  $('.pv-close').addEventListener('click', requestClose);
  $('.pv-bd').addEventListener('click', requestClose);
  function navClick(btn, to) {
    if (to < 0 || to >= N) {                       // 끝 — 무반응 대신 흔들어 '지금은 못 눌러요'만 말한다(§4.9, 사유가 자명하니 토스트는 안 붙인다)
      btn.classList.remove('shake');
      void btn.offsetWidth;                        // 리플로 강제 — 연속 클릭에도 매번 재생
      btn.classList.add('shake');
      return;
    }
    go(to);
  }
  elPrev.addEventListener('click', function () { navClick(elPrev, idx - 1); });
  elNext.addEventListener('click', function () { navClick(elNext, idx + 1); });
  track.addEventListener('click', function (e) {
    e.stopPropagation();
    if (moved) { moved = false; return; }        // 끌고 나서 뗀 것은 '탭'이 아니다(안 그러면 넘길 때마다 닫힌다)
    requestClose();                              // 유성 픽: 사진 탭 = 닫기
  });
  window.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') requestClose();
    else if (e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'ArrowRight') go(idx + 1);
  });
  // 뒤로 = 닫기 / 앞으로 = 다시 열기. 주소와 화면이 어긋난 채 남지 않게 양방향으로 맞춘다.
  window.addEventListener('popstate', function () {
    var st = history.state;
    if (open) { if (st && st.pv) paint(st.i, false); else closeNow(); }
    else if (st && st.pv && st.i >= 0 && st.i < N) openAt(st.i, false);
  });

  // ── 스와이프 ─────────────────────────────────────────────────────────
  // 8px 임계를 넘긴 뒤에만 preventDefault → 사진을 길게 눌러 저장하는 게 살아 있다.
  // 세로는 위·아래 둘 다 탈출(아래만 열어 두면 위로 올린 손가락이 영영 안 닫힌다 — 유성 실측 2026-08-31).
  var sx = 0, sy = 0, dx = 0, dy = 0, axis = '', dragging = false, moved = false, t0 = 0, edgeBack = false;
  // 세로 탈출 임계(px) · 속도 임계(px/ms). 가로는 아래 dend()의 폭 18%.
  // 🔧 이 셋과 슬라이드 속도(.3s, 위 `.pv-track.mv`)를 다시 만질 땐 조절판에서 정하고 옮긴다
  //    = 부모 레포 `prototype/홈페이지_활동글_사진뷰어_프리뷰.html`(실물 21장·실제 배치, 마우스로도 스와이프됨).
  var SWIPE_Y = 72, SWIPE_V = .45;

  function dstart(x, y) {
    if (!open) return;
    finishSlide();                                 // 밀던 중이면 그 자리서 닫고 새 손가락을 바로 받는다
    sx = x; sy = y; dx = dy = 0; axis = ''; dragging = true; moved = false; t0 = Date.now();
    // 좌측 가장자리 = OS 뒤로 제스처 자리. 대개 안드로이드가 먼저 먹지만, 안 먹는 기기에선 우리에게 온다
    // → 그때도 '이전 사진'이 아니라 '나가기'가 되게 한다. (오른쪽 가장자리는 '다음 사진'과 충돌해 넣지 않는다)
    edgeBack = (x - stage.getBoundingClientRect().left) <= 24;
    track.classList.remove('mv');                  // 손가락은 즉시 따라온다
  }
  function dmove(x, y, e) {
    if (!dragging) return;
    dx = x - sx; dy = y - sy;
    if (!axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    moved = true;
    if (e && e.cancelable) e.preventDefault();
    if (axis === 'x') {
      // 끝에서는 저항을 준다 — 옆 칸이 비어 있는데 그대로 따라오면 검은 빈칸이 끌려 나온다
      var d = dx;
      if ((idx === 0 && d > 0) || (idx === N - 1 && d < 0)) d = d * .28;
      trackX(-100, d);
    } else {
      track.style.transform = 'translateX(-100%) translateY(' + dy + 'px) scale(' + Math.max(.82, 1 - Math.abs(dy) / 900) + ')';
      $('.pv-bd').style.opacity = String(Math.max(.25, 1 - Math.abs(dy) / 500));
    }
  }
  // 닫힐 땐 끌던 방향으로 날려 보낸다 — 제자리로 튕겼다 닫히면 '내가 닫은 것'으로 안 읽힌다
  function flyOut(tx, ty) {
    track.classList.add('mv');
    track.style.transform = 'translateX(-100%) translate(' + tx + 'px,' + ty + 'px) scale(.9)';
    track.style.opacity = '0';
    $('.pv-bd').style.opacity = '';
    requestClose();
  }
  function dend() {
    if (!dragging) return;
    dragging = false;
    var r = stage.getBoundingClientRect();
    var dt = Math.max(1, Date.now() - t0);
    var vx = Math.abs(dx) / dt, vy = Math.abs(dy) / dt;
    if (edgeBack && axis === 'x' && dx > 40) { flyOut(r.width * .6, 0); return; }
    if (axis === 'x' && (Math.abs(dx) > r.width * .18 || vx > SWIPE_V)) { slide(dx < 0 ? 1 : -1); return; }
    if (axis === 'y' && (Math.abs(dy) > SWIPE_Y || vy > SWIPE_V)) { flyOut(0, dy < 0 ? -r.height * .5 : r.height * .5); return; }
    settleBack(); $('.pv-bd').style.opacity = '';                 // 임계 미달 = 잡고 있던 사진이 제자리로
  }
  stage.addEventListener('touchstart', function (e) { if (e.touches.length === 1) dstart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  stage.addEventListener('touchmove', function (e) { if (e.touches.length === 1) dmove(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
  stage.addEventListener('touchend', dend);
  stage.addEventListener('touchcancel', dend);
  stage.addEventListener('mousedown', function (e) { e.preventDefault(); dstart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { if (dragging) dmove(e.clientX, e.clientY, null); });
  window.addEventListener('mouseup', dend);

  // ── 공유 = OS 공유 시트 → 안 되면 복사 + 토스트 ───────────────────────
  // 문자·카톡·복사는 OS 시트에 이미 다 들어 있다(선례 = 14·16 리뷰 영수증 저장). 자체 9칸 패널은 만들지 않는다(§1.5).
  $('.pv-share').addEventListener('click', function () {
    tag('photo_share');
    if (navigator.share) { navigator.share({ title: TITLE_FULL, url: SHARE_URL }).catch(function () {}); return; }
    function done() { showToast('링크를 복사했어요'); }
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = SHARE_URL; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(SHARE_URL).then(done, fallbackCopy);
    else fallbackCopy();
  });
  function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  // ── 딥링크(#p=N)로 들어온 경우 ────────────────────────────────────────
  // 해시를 먼저 벗기고(replaceState) 다시 얹어야(openAt의 pushState) 뒤로가기가 '뷰어 닫기 → 글'이 된다.
  // 안 그러면 공유 링크로 들어온 사람의 뒤로가기가 페이지를 통째로 떠난다.
  var m = /^#p=(\d+)$/.exec(location.hash || '');
  if (m) {
    var n = parseInt(m[1], 10) - 1;
    if (n >= 0 && n < N) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      openAt(n);
    }
  }
})();
