// 뒤로가기 실기기 진단(2026-11-28) — 주소에 ?nav=1을 붙였을 때만 페이지의 한 줄 로더가 이 파일을 부른다(일반 방문자는 받지 않는다). 짝 = js/kbd-diag.js(같은 틀).
// 왜: 유성 폰에서 「오감쑥쑥 바우처 수정했어요 → 뒤로(← 또는 스와이프) → '← 서비스 다시 고르기'가 안 눌림」. 헤드리스 16장면에선 안 나서
//     캡처 한 장으로 갈래를 가른다 — ① 누름이 폼에 안 닿음(바깥이 그 자리를 덮음) ② 닿았는데 popstate가 폼에 안 옴(뒤로가 바깥 칸을 먹음) ③ 왔는데 다른 갈래가 먹음(겹 표식, 스택 어긋남).
// 값 = 이 페이지(바깥) + 폼 안(06 Apply.html이 tfDiag nav 질문에 회신). 읽기 전용, 화면 터치는 통과(pointer-events:none).
(function () {
  var f = document.querySelector('.apply-frame');
  if (!f) return;
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;background:rgba(255,255,224,.93);color:#111;' +
    'font:10.5px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:3px 6px 4px;white-space:pre-wrap;word-break:break-all;border-top:1px solid #c9c39a';
  document.documentElement.appendChild(box);
  var t0 = Date.now(), inner = null, innerAt = 0, out = [];
  function sec() { return ((Date.now() - t0) / 1000).toFixed(1); }
  function note(s) { out.push(sec() + ' ' + s); if (out.length > 5) out.shift(); }
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
  function st() { try { return JSON.stringify(history.state) || 'null'; } catch (e) { return '?'; } }
  // 바깥 페이지에 온 뒤로(popstate)와 바깥에 떨어진 누름 = 폼이 아니라 이 페이지가 받은 것
  window.addEventListener('popstate', function () { note('바깥 popstate ' + st()); });
  document.addEventListener('pointerdown', function (e) { var t = e.target; note('바깥 누름 ' + String(t.id || t.className || t.tagName).slice(0, 24)); }, true);
  function kids(w, o) { try { for (var i = 0; i < w.length; i++) { o.push(w[i]); kids(w[i], o); } } catch (e) {} return o; }
  function ask() {
    if (!f.contentWindow) return;
    [f.contentWindow].concat(kids(f.contentWindow, [])).forEach(function (w) { try { w.postMessage({ tfDiag: 1, ask: 1, nav: 1 }, '*'); } catch (e) {} });
  }
  window.addEventListener('message', function (e) { var d = e.data; if (d && d.tfDiag === 1 && d.nav) { inner = d.nav; innerAt = Date.now(); } });
  function render() {
    var r = f.getBoundingClientRect(), L = [];
    L.push('① ' + ua() + ' | 폭 ' + window.innerWidth + ' | 바깥 칸 수 ' + history.length + ' 칸 ' + st() + ' | 앱모드 ' + (document.body.classList.contains('form-app') ? 'O' : 'X') + ' 스크롤 ' + Math.round(window.scrollY));
    if (!(inner && Date.now() - innerAt < 1500)) L.push('② 폼 안: 응답 없음(폼이 아직 안 떴거나 새 배포 전)');
    else {
      L.push('② 폼 안: 화면 ' + inner.scr + ' | 스택 ' + inner.stack + ' | 이 칸 ' + inner.tf + ' | 칸 수 ' + inner.hl + ' | 시트 표식 ' + (inner.sheet ? 'O' : 'X') + '(보임 ' + (inner.sheetOn ? 'O' : 'X') + ') 홍보지 표식 ' + (inner.zoom ? 'O' : 'X'));
      var on = '없음';
      if (inner.bk) {   // 폼 안 뒤로 단추 가운데를 바깥 좌표로(가운데 GAS 틀 두 겹은 위, 왼쪽 0 — kbd-diag와 같은 가정) → 그 점에 바깥 페이지가 무엇을 놓았나
        var x = r.left + inner.bk[0] + inner.bk[2] / 2, y = r.top + inner.bk[1] + inner.bk[3] / 2, el = document.elementFromPoint(x, y);
        on = '(' + Math.round(x) + ',' + Math.round(y) + ') 위 = ' + (el === f ? '폼(정상)' : el ? String(el.tagName + '.' + (el.className || '') + '#' + (el.id || '')).slice(0, 40) : '화면 밖');
      }
      L.push('③ 뒤로 단추 ' + on);
      L.push('④ 폼 기록: ' + (inner.log || []).join(' / '));
    }
    L.push('⑤ 바깥 기록: ' + (out.join(' / ') || '-'));
    box.textContent = L.join('\n');
  }
  setInterval(function () { ask(); render(); }, 300);
  render();
})();
