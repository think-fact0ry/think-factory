/* 신청 기간 띠(입구 ② — 2026-10-24 8차 유성 「권장대로」, 10-31 라이브 준비): 인천 어느 구든 바우처 신청을 받고 있는 날에만
   모든 페이지 메뉴 밑에 연한 초록 한 줄 「지금 N개 구에서 바우처 신청 중  기간 보기 →」 → /period.
   공고 없는 날(1년의 약 80%)엔 아무것도 안 그린다. 모달은 안 씀(진입 즉시 본문을 가리는 창 = docs/1 §1.4-1, 10-24 보류).
   셈 = /period 페이지 build()와 같은 규칙: 오늘이 신청 기간 안 + 강화·옹진 뺀 9개 구 + 우리 서비스 넷 중 하나라도 받는 구(표를 못 읽은 공고는 셈). 규칙을 바꾸면 period.html도 같이.
   굵기 = docs/1 §3.2 사다리(강조어 600, 링크 500), 누르면 링크 글자 .93(§5.3-2).
   자리(실측): 첫 화면이 메뉴 바로 밑 꽉 찬 한 화면(홈 .fold, 이야기 .st-hero, 바우처 .sp)이고 띠 자리 아래에 글, 버튼, 칸이 없으면
   → 첫 화면 위에 겹쳐 띄운다(ov). 한 화면 = 한 휠 페이지가 그대로고, 첫 화면 아래 화살표·실시간 띠가 안 잘리고, 띠가 늦게 와도 화면이 안 밀린다.
   꽉 찬 첫 화면인데 띠 자리 밑에 칸이 있으면(낮은 노트북의 바우처 서비스 탭) → 겹쳐 띄우고 그 첫 화면 위 여백만 띠 높이만큼 늘린다
   (메뉴 밑에 끼우면 휠 첫 목표가 띠 높이만큼 내려가 휠로는 맨 위 띠로 못 돌아온다 — 10-31 실측).
   보통 흐름 페이지(활동, 문의, 활동 글)와 폰 바우처(첫 화면 높이 고정 없음) → 메뉴 밑에 끼워 글을 밀어 내림. 창 크기가 바뀌면 다시 잰다.
   첫 페이지에서만 데이터를 받고(약 15KB), 같은 날 다음 페이지는 탭 저장소에 둔 수로 바로 그린다. */
(function () {
  if (/^\/period(\.html)?\/?$/.test(location.pathname)) return;   // 신청 기간 페이지 자신엔 안 그림
  var NOW_GU = ['미추홀구', '연수구', '남동구', '부평구', '계양구', '서해구', '검단구', '제물포구', '영종구'];
  var SVC = ['오감', '아청심', '정신토탈', '성인'], TAKE = { 신규: 1, 재판정: 1, 대기자만: 1 }, KEY = 'tf-period-band-v1';
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function count(posts, today) {
    var on = {};
    posts.forEach(function (p) {
      if (!p.apply || !(p.apply.start <= today && today <= p.apply.end)) return;
      (p.gus ? Object.keys(p.gus) : [p.gu]).forEach(function (gu) {
        if (NOW_GU.indexOf(gu) < 0) return;
        var g = p.gus && p.gus[gu];
        if (g && !SVC.some(function (k) { return g[k] && TAKE[g[k].st]; })) return;
        on[gu] = 1;
      });
    });
    return Object.keys(on).length;
  }
  /* 띠 자리 아래에 보이는 것이 있나: 글이 든 요소, 버튼·입력·그림, 배경색이나 테두리가 있는 칸.
     단 첫 화면 맨 위 가장자리에서 시작해 폭을 거의 다 덮는 층(배경 영상, 어둡게 덮는 막, 감싸는 틀)은 배경이라 덮어도 된다 */
  function covers(full, br) {
    var fr = full.getBoundingClientRect(), els = full.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var e = els[i], r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.top >= br.bottom + 8 || r.bottom <= br.top || r.right <= br.left || r.left >= br.right) continue;
      if (r.top <= fr.top + 1 && r.width >= fr.width * .9) continue;
      var cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      var text = false;
      for (var c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && /\S/.test(c.nodeValue)) { text = true; break; }
      if (text || /^(BUTTON|INPUT|SELECT|TEXTAREA|IMG|VIDEO|CANVAS|IFRAME)$/.test(e.tagName) ||
          !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || cs.backgroundImage !== 'none' || parseFloat(cs.borderTopWidth) > 0) return true;
    }
    return false;
  }
  var pushed = null;
  function place(a, nav) {
    var full = document.querySelector('.fold, .st-hero, .sp');
    if (pushed) { pushed.style.paddingTop = ''; pushed = null; }
    a.classList.add('ov'); a.style.top = '';
    if (full && parseFloat(getComputedStyle(full).minHeight) > 0) {
      var top = full.getBoundingClientRect().top + window.pageYOffset;
      if (Math.abs(top - nav.offsetHeight) < 2) {
        a.style.top = top + 'px';
        if (covers(full, a.getBoundingClientRect())) { full.style.paddingTop = (parseFloat(getComputedStyle(full).paddingTop) + a.offsetHeight) + 'px'; pushed = full; }
        return;
      }
    }
    a.classList.remove('ov'); a.style.top = '';
  }
  var placeT = null;
  function draw(n) {
    var old = document.querySelector('.pband');
    if (!n) { if (old) old.remove(); if (pushed) { pushed.style.paddingTop = ''; pushed = null; } return; }
    var nav = document.querySelector('nav.nav'); if (!nav) return;
    if (!document.getElementById('pbandCss')) {
      var st = document.createElement('style'); st.id = 'pbandCss';
      st.textContent = '.pband{display:flex;align-items:center;justify-content:center;gap:10px;min-height:40px;padding:8px 16px;background:var(--green100,#e9f8ee);color:var(--g800,#333d4b);font-size:14px;line-height:1.4;text-decoration:none;word-break:keep-all;text-align:center;-webkit-tap-highlight-color:transparent}' +
        '.pband.ov{position:absolute;left:0;right:0;z-index:8}' +
        '.pband b{font-weight:600;color:var(--g900,#191f28)}.pband .go{font-weight:500;color:var(--green700,#166841);white-space:nowrap;display:inline-block;transition:transform .12s}' +
        '.pband:active .go{transform:scale(.93)}@media (hover:hover){.pband:hover .go{text-decoration:underline;text-underline-offset:2px}}';
      document.head.appendChild(st);
    }
    var a = old || document.createElement('a');
    a.className = 'pband'; a.href = '/period';
    a.innerHTML = '<span>지금 <b>' + n + '개 구</b>에서 바우처 신청 중</span><span class="go">기간 보기 →</span>';
    if (!old) {
      nav.insertAdjacentElement('afterend', a);
      addEventListener('resize', function () { clearTimeout(placeT); placeT = setTimeout(function () { place(a, nav); }, 150); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(a, nav); });
    }
    place(a, nav);
  }
  var today = todayIso(), cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  function start() {
    var fresh = cached && cached.d === today;
    if (fresh) draw(cached.n);
    if (fresh && Date.now() - (cached.t || 0) < 30 * 60000) return;   // 30분 안에 받은 수면 다시 안 받음(감시기 주기 = 평일 낮 15분, 그 밖 1시간)
    fetch('/data/icss.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      var n = count(j.posts || [], today);
      try { sessionStorage.setItem(KEY, JSON.stringify({ d: today, n: n, t: Date.now() })); } catch (e) {}
      if (!cached || cached.d !== today || cached.n !== n) draw(n);
    }).catch(function () {});   // 못 받으면 띠 없음(페이지는 그대로)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
