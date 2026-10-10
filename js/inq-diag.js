/* 실기기 실측 상자 — 주소 끝 ?diag=1 (이 탭에서만, ?diag=0 끔). js/inquiry.js가 그때만 받는다. 수집 0(화면에만 그림)
 * 왜: 헤드리스엔 안드로이드 키패드·아래 제스처 막대(chin)가 없어 유성 폰에서만 숫자를 볼 수 있다(유성 10-10 「추측하거나 가정하지 말고 실측해」).
 * 보는 것 = 화면·보이는 높이·막대 높이(inset)·떠 있는 버튼 위치, 손가락 한 번 동안의 최소~최대, 문의 창이 열렸으면 창·입력 줄·칸 위치.
 * 다 쓰면 이 파일과 inquiry.js의 diag 세 줄을 지운다.
 */
(function () {
  'use strict';
  if (window.__tfDiag) return; window.__tfDiag = 1;
  function el(css) { var d = document.createElement('div'); d.style.cssText = css; document.body.appendChild(d); return d; }
  // 막대 높이 재는 자 = bottom에 env를 건 높이 0 상자(padding-bottom에 걸면 크롬이 막대 접기를 멈춰 버린다 — 재는 행동이 대상을 바꾸지 않게)
  var probe = el('position:fixed;left:0;bottom:env(safe-area-inset-bottom,0px);width:1px;height:0;visibility:hidden;pointer-events:none');
  var probeMax = el('position:fixed;left:0;bottom:env(safe-area-max-inset-bottom,0px);width:1px;height:0;visibility:hidden;pointer-events:none');
  var box = el('position:fixed;left:6px;top:6px;z-index:2147483647;pointer-events:none;background:rgba(0,0,0,.8);color:#fff;font:600 11px/1.4 ui-monospace,Menlo,monospace;padding:6px 8px;border-radius:8px;white-space:pre;max-width:calc(100% - 12px);overflow:hidden');
  var g;   // 손가락 한 번(누른 순간부터) 동안의 최소~최대
  function reset() { g = { fab: [], ih: [], inset: [], vv: [] }; }
  reset();
  addEventListener('touchstart', reset, { passive: true, capture: true });
  function add(k, v) { var a = g[k]; if (!a.length) { a[0] = a[1] = v; } else { if (v < a[0]) a[0] = v; if (v > a[1]) a[1] = v; } }
  function rng(a) { return a.length ? (a[0] === a[1] ? String(a[0]) : a[0] + '~' + a[1]) : '-'; }
  function q(s) { return document.querySelector(s); }
  function rect(e) { if (!e) return '-'; var b = e.getBoundingClientRect(); return Math.round(b.top) + '~' + Math.round(b.bottom); }
  var ver = (navigator.userAgent.match(/(?:Chrome|CriOS)\/(\d+)/) || [])[1] || (/Safari/.test(navigator.userAgent) ? '사파리' : '?');
  function tick() {
    var v = window.visualViewport, ih = innerHeight;
    var inset = Math.round(ih - probe.getBoundingClientRect().top), imax = Math.round(ih - probeMax.getBoundingClientRect().top);
    var btn = q('.fab .naver') || q('.fab .f'), fb = btn ? Math.round(btn.getBoundingClientRect().bottom) : 0;
    add('fab', fb); add('ih', ih); add('inset', inset); if (v) add('vv', Math.round(v.height));
    var vp = (q('meta[name=viewport]') || {}).content || '';
    var L = [
      '크롬 ' + ver + '  화면 ' + screen.width + 'x' + screen.height + '  dpr ' + (Math.round(devicePixelRatio * 100) / 100),
      'innerH ' + ih + '  보이는 높이 ' + (v ? Math.round(v.height) + ' 위 ' + Math.round(v.offsetTop) + ' x' + v.scale.toFixed(2) : '-'),
      '막대 ' + inset + ' (최대 ' + imax + ')  cover ' + (/viewport-fit=cover/.test(vp) ? 'O' : 'X') + '  scrollY ' + Math.round(scrollY),
      '버튼 아래끝 ' + fb + '  (화면 끝에서 ' + (ih - fb) + ')',
      '손가락 한 번: 버튼 ' + rng(g.fab) + ' / innerH ' + rng(g.ih) + ' / 막대 ' + rng(g.inset) + ' / 보이는 ' + rng(g.vv)
    ];
    var P = q('#tfInq.on .ti-pane');
    if (P) {
      var a = document.activeElement || {};
      L.push('창 ' + rect(P) + '  높이칸 ' + (P.style.height || '없음') + '  키패드판정 ' + (q('#tfInq.kb') ? 'O' : 'X'));
      L.push('입력줄 ' + rect(q('#tfInq .ti-comp')) + '  칸 ' + rect(q('#tiTa')) + '  초점 ' + (a.id || a.tagName || '-'));
    }
    box.textContent = L.join('\n');
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
