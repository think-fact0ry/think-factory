/* 홈페이지 문의 창 — 시작 파일(모든 페이지가 받는 작은 쪽)
 * 하는 일 = 떠 있는 버튼 줄(.fab) 맨 아래에 「문의하기」를 끼우고, 화면을 다 그린 뒤 서버에 한 번 물어 초록 점(채팅 모드)을 정한다.
 * 창 자체(js/inquiry-pane.js)는 버튼을 누를 때 받는다 — 학부모 대부분은 창을 안 열기 때문(유성 10-10 「홈페이지가 무거워지지 않게」).
 * 설계 = 생각공작소 docs/4_설계_2026-10-08_문의알리미_1단계.md D4~D8 · 디자인 = prototype/문의창_디자인5차_프리뷰.html · 원칙 = docs/1 §4.18
 *
 * 켜기 전(처리방침 시행 2026-10-15 + 유성 GO 전)엔 OPEN=false — 주소 끝 ?inq=1 을 한 번 연 기기(유성 시험)에만 보인다. ?inq=0 이면 해제.
 * ?inq=demo = 서버 없이 상태를 넘겨 보는 미리보기(연습 데이터, 수집 0).
 */
(function () {
  'use strict';
  var OPEN = false;   // ← 모두에게 켜는 스위치(10-15 이후 유성 GO 때 true)
  var PANE_SRC = '/js/inquiry-pane.js?v=3';   // 창 코드를 고치면 ?v= 올리기 — 여기 + c/index.html 두 곳(Pages 캐시 10분)
  var GAS = 'https://script.google.com/macros/s/AKfycbwUdo5pLFvgVxu_3EjspA6U6U196Hu-RzKcC0ucVwRPGMBP3oIQT2fKMK_7fvLmeOx9Gg/exec';

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  var q = (location.search.match(/[?&]inq=([^&]*)/) || [])[1];
  if (q === '1') ls('tf_inq', '1');
  if (q === '0') { ls('tf_inq', null); ss('tf_inq_demo', ''); }
  if (q === 'demo') ss('tf_inq_demo', '1');
  var demo = ss('tf_inq_demo') === '1';
  var dg = (location.search.match(/[?&]diag=([01])/) || [])[1];   // 실기기 실측 상자(유성 폰, 이 탭에서만) — ?diag=1 켬 / ?diag=0 끔. 수집 0(화면에만)
  if (dg) ss('tf_diag', dg);
  if (ss('tf_diag') === '1') { var ds = document.createElement('script'); ds.src = '/js/inq-diag.js?v=1'; document.head.appendChild(ds); }
  if (!OPEN && ls('tf_inq') !== '1' && !demo) return;   // 켜기 전 = 아무것도 안 함(서버도 안 부름)

  var fab = document.querySelector('.fab');
  if (!fab || document.getElementById('tfInqBtn')) return;   // 떠 있는 버튼이 없는 페이지(처리방침, 404)는 안 띄운다

  // 버튼 모양 = 5차 확정값(SNS 버튼과 같은 위계: 흰 바탕, g200 테두리, 같은 그림자). site.css엔 캐시 꼬리표가 없어 여기서 넣는다
  var css = '.fab{align-items:flex-end}'   // 5차 = 버튼 줄 오른쪽 맞춤(넓은 「문의하기」와 둥근 버튼의 오른쪽 끝이 한 줄)
    + '.fab .f.ask{width:auto;min-width:48px;padding:0 16px 0 13px;gap:6px;position:relative;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}'
    + '.fab .ask svg{width:20px;height:20px}'
    + '.fab .ask .t{font-size:14px;font-weight:600;color:var(--g600);letter-spacing:-.2px;line-height:1}'
    + '.fab.on-hero .ask .t{color:rgba(255,255,255,.95)}'
    + '.fab .ask .tfi-dot{position:absolute;top:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:#2fb36b;border:2px solid #fff;display:none}'
    + '.fab .ask.staff .tfi-dot{display:block}'   // 이름 = tfi-dot(사이트에 .live = 실시간 신청 띠가 이미 있다)
    + 'html.tfinq-open .fab{opacity:0;pointer-events:none}'
    + '.fab .ask.shk{animation:tfInqShk .28s cubic-bezier(.36,.07,.19,.97)}'
    + '@keyframes tfInqShk{20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(1px)}}'
    // 폰 = 왼쪽 아래(오른쪽 아래 끝은 「맨 위로」 자리), 「맨 위로」가 나타날 때 같이 나타남(첫 화면엔 없음 — 「실시간 신청 소식」을 가린다, 유성 10-10)
    + '@media (max-width:760px){'
    + '.fab .f.ask{position:fixed;left:14px;right:auto;bottom:calc(14px + env(safe-area-inset-bottom, 0px));opacity:0;pointer-events:none;translate:0 8px;transition:opacity .25s,translate .3s cubic-bezier(.22,.7,.25,1),transform .12s,color .25s,border-color .25s,background-color .25s,box-shadow .25s}'
    + '.fab .f.ask.vis{opacity:1;pointer-events:auto;translate:none}'
    // 상담 신청 페이지 = SNS 버튼과 같은 규칙(FAQ가 보일 때만) — 폼 아래쪽 버튼을 가리지 않게
    + 'body.apply-page .fab .ask{display:none}body.apply-page.faq-visible .fab .ask{display:flex}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var b = document.createElement('button');
  b.type = 'button'; b.className = 'f ask'; b.id = 'tfInqBtn'; b.setAttribute('aria-label', '문의하기');
  b.innerHTML = '<span class="tfi-dot"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/></svg><span class="t">문의하기</span>';
  fab.appendChild(b);   // PC = 줄 맨 아래(모서리) 늘, 「맨 위로」는 그 위 / 폰 = 왼쪽 아래(위 CSS)
  var toTop = document.getElementById('toTop');   // 폰에서 보일 때 = 「맨 위로」가 보일 때(그 페이지 스크립트가 .show를 붙인다)
  function vis() { b.classList.toggle('vis', !toTop || toTop.classList.contains('show')); }
  vis(); if (toTop && window.MutationObserver) new MutationObserver(vis).observe(toTop, { attributes: true, attributeFilter: ['class'] });

  // 초록 점 = 지금 채팅 모드(행정 근무 중). 화면을 다 그린 뒤 한 번만, 답은 3분 동안 다시 안 묻는다
  function setLive(m) { b.classList.toggle('staff', m === 'chat'); }
  function askMode() {
    var c = null; try { c = JSON.parse(ss('tf_inq_mode') || 'null'); } catch (e) {}
    if (c && Date.now() - c.at < 180000) return setLive(c.m);
    if (demo) return setLive('chat');
    fetch(GAS, { method: 'POST', body: JSON.stringify({ action: 'v_mode' }) })
      .then(function (r) { return r.text(); })
      .then(function (t) { var o = JSON.parse(t); if (o && o.mode) { ss('tf_inq_mode', JSON.stringify({ m: o.mode, at: Date.now() })); setLive(o.mode); } })
      .catch(function () {});   // 못 받으면 점 없음(메일 모드처럼 보임 = 안전한 쪽)
  }
  function later() { setTimeout(askMode, 1200); }
  if (document.readyState === 'complete') later(); else addEventListener('load', later);
  window.tfInqSetLive = setLive;   // 창이 모드를 새로 알면 버튼 점도 같이

  // 창 코드는 누를 때 받는다(손가락이 닿는 순간 받기 시작 = 뗄 때까지 ~100ms 번다)
  var loading = null;
  function load() {
    if (window.tfInqPane) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = PANE_SRC; s.async = true;
      s.onload = ok; s.onerror = function () { loading = null; no(); };
      document.head.appendChild(s);
    });
    return loading;
  }
  b.addEventListener('pointerdown', function () { load().catch(function () {}); });
  b.addEventListener('click', function () {
    load().then(function () { window.tfInqPane.open({ gas: GAS, demo: demo }); })
      .catch(function () { b.classList.remove('shk'); void b.offsetWidth; b.classList.add('shk'); });   // 창 코드를 못 받음(연결 끊김) = 흔들어 알리고 다음 누름에 다시(§4.9 조용한 무반응 금지)
  });
})();
