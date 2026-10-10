// 키보드 실기기 진단(2026-10-10) — 주소에 ?kbd=1을 붙였을 때만 페이지의 한 줄 로더가 이 파일을 부른다(일반 방문자는 받지 않는다).
// 왜: 헤드리스 크롬은 폰 소프트 키보드(화면 줄임, 크롬의 자동 스크롤)를 재현하지 못한다. 10-10 /contact 「수정하기」가 헤드리스에선 키보드에 붙는데
//     유성 폰에선 안 붙었다 → 폰 화면 맨 위에 실제 값을 띄워 캡처 1장으로 원인을 본다. /recommend(잘 되는 쪽)에도 같은 것을 띄워 나란히 대조한다.
// 값 = 이 페이지(바깥) + 폼 안(GAS 폼이 tfDiag 질문에 회신 — 06 Apply.html, 22 Index.html). 읽기 전용, 화면 터치는 통과(pointer-events:none).
(function () {
  var f = document.querySelector('.apply-frame, .rc-frame');
  if (!f) return;
  var SEL = /\/recommend/.test(location.pathname)
    ? { btn: '#lkBtn', name: '#lk_name', scr: '#scr-lookup' }
    : { btn: '#lkBtn', name: '#lkName', scr: '#lookupScreen' };
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;pointer-events:none;background:rgba(255,255,224,.93);color:#111;' +
    'font:11px/1.38 ui-monospace,Menlo,Consolas,monospace;padding:3px 6px 4px;white-space:pre-wrap;word-break:break-all;border-bottom:1px solid #c9c39a';
  document.documentElement.appendChild(box);
  var t0 = Date.now(), maxH = 0, inner = null, innerAt = 0, log = [], lastKey = '';
  function vv() { var v = window.visualViewport; return v ? { h: v.height, top: v.offsetTop } : { h: window.innerHeight, top: 0 }; }
  function ua() {
    var u = navigator.userAgent, m, p = [];
    if ((m = u.match(/SamsungBrowser\/[\d.]+/))) p.push(m[0]);
    if ((m = u.match(/Chrome\/(\d+)/))) p.push('Chrome' + m[1]);
    if (/; wv\)/.test(u)) p.push('웹뷰');
    if (/KAKAOTALK/i.test(u)) p.push('카톡');
    if (/NAVER/i.test(u)) p.push('네이버앱');
    if ((m = u.match(/Android [\d.]+/))) p.push(m[0]);
    if (/iPhone|iPad/.test(u)) p.push('iOS');
    return p.join(' ') || u.slice(0, 50);
  }
  // 폼은 GAS 이중 iframe 안쪽이라 어느 창이 폼인지 모른다 → 자식 창을 전부 돌며 묻는다(교차 출처라도 frames 순회와 postMessage는 된다)
  function kids(w, out) { try { for (var i = 0; i < w.length; i++) { out.push(w[i]); kids(w[i], out); } } catch (e) {} return out; }
  function ask() {
    if (!f.contentWindow) return;
    [f.contentWindow].concat(kids(f.contentWindow, [])).forEach(function (w) {
      try { w.postMessage({ tfDiag: 1, ask: 1, btn: SEL.btn, name: SEL.name, scr: SEL.scr }, '*'); } catch (e) {}
    });
  }
  window.addEventListener('message', function (e) { var d = e.data; if (d && d.tfDiag === 1 && d.v) { inner = d.v; innerAt = Date.now(); } });
  function sec() { return ((Date.now() - t0) / 1000).toFixed(1) + '초'; }
  function rng(a) { return a ? a[0] + '~' + a[1] : '없음'; }
  function render() {
    var v = vv(), r = f.getBoundingClientRect(), b = document.body.classList;
    if (window.innerHeight > maxH) maxH = window.innerHeight;
    var meta = (document.querySelector('meta[name=viewport]') || {}).content || '';
    // 바깥 값이 바뀔 때마다 한 줄 기록(키보드가 열리는 순서를 본다)
    var key = window.innerHeight + '/' + Math.round(v.h) + '/' + Math.round(v.top) + '/' + Math.round(r.height) + '/' + Math.round(window.scrollY);
    if (key !== lastKey) { lastKey = key; log.push(sec() + ' 창' + window.innerHeight + ' 보임' + Math.round(v.h) + ' 밀림' + Math.round(v.top) + ' 틀' + Math.round(r.height) + ' 스크롤' + Math.round(window.scrollY)); if (log.length > 4) log.shift(); }
    var L = [];
    L.push('① ' + ua() + ' | 화면줄임 설정 ' + (/resizes-content/.test(meta) ? '있음' : '없음') + ' | 폭 ' + window.innerWidth);
    L.push('② 바깥: 창높이 ' + window.innerHeight + '(최대 ' + maxH + ') 보이는높이 ' + Math.round(v.h) + ' 위로밀림 ' + Math.round(v.top) +
      ' 스크롤 ' + Math.round(window.scrollY) + (/\/recommend/.test(location.pathname) ? '' : ' 앱모드 ' + (b.contains('form-app') ? 'O' : 'X') + ' 키보드판정 ' + (b.contains('kb-open') ? 'O' : 'X')));
    L.push('③ 폼틀: 위 ' + Math.round(r.top) + ' 높이 ' + Math.round(r.height) + ' 아래끝 ' + Math.round(r.bottom));
    var fresh = inner && Date.now() - innerAt < 1500;
    if (!fresh) {
      L.push('④ 폼 안: 응답 없음(폼이 아직 안 떴거나 새 배포 전)');
    } else {
      L.push('④ 폼 안: 창높이 ' + inner.ih + ' 문서 ' + inner.doc + ' 안스크롤 ' + inner.sy + ' pvh ' + (inner.pvh || '-') + ' 포커스 ' + inner.focus + ' 터치 ' + (inner.coarse ? 'O' : 'X'));
      L.push('⑤ 폼 안 위치: 칸 ' + rng(inner.scr) + ' 이름칸 ' + rng(inner.name) + ' 버튼 ' + rng(inner.btn) + (inner.btn ? '(' + inner.btnPos + ')' : ''));
      // 판정: 버튼 아래끝을 바깥 좌표로(가운데 GAS 틀 두 겹은 위 0이라 가정 — 헤드리스 실측 0, 폰에서 다르면 ④ 창높이와 ③ 높이가 어긋난다)
      var seeBot = Math.round(v.top + v.h), j;
      if (!inner.btn) j = '버튼 없음(전화 11자리와 이름 1자를 적으면 생김)';
      else {
        var bb = Math.round(r.top) + inner.btn[1], gap = seeBot - bb;
        j = '버튼 아래끝 ' + bb + ' / 보이는 화면 아래끝 ' + seeBot + ' → ' + (Math.abs(gap) <= 2 ? '붙음' : gap > 0 ? '떠 있음 ' + gap + 'px' : '가려짐 ' + (-gap) + 'px');
      }
      if (inner.ih !== Math.round(r.height)) j += ' | 폼 안 창이 폼틀과 ' + (inner.ih - Math.round(r.height)) + 'px 다름';
      if (inner.doc > inner.ih) j += ' | 폼 문서가 창보다 ' + (inner.doc - inner.ih) + 'px 김';
      L.push('⑥ ' + j);
    }
    L.push('⑦ ' + log.join(' → '));
    box.textContent = L.join('\n');
    box.style.transform = 'translateY(' + Math.round(v.top) + 'px)';   // 화면이 밀려도 보이는 화면 맨 위에
  }
  setInterval(function () { ask(); render(); }, 250);
  window.addEventListener('resize', render);
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', render); window.visualViewport.addEventListener('scroll', render); }
  render();
})();
