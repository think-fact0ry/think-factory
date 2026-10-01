// 폼 대기 화면 (GAS iframe 래퍼 공용) — 2026-10-01 유성 확정 「링 제거 + 훑기 + 말해 주는 기다림 + 연결 감지 자동 재시도」.
// 쓰는 곳: kr /contact(06)·/recommend(22)·/monitoring(14)·/feedback(16) + 옛 saenggak/index.html(06, 이 파일을 kr 주소로 불러 씀).
// 근거·반응 보드 = 부모 레포 docs/1 §5.4 「대기가 길 때」·백로그 §🏠 「신청폼 안 열려요」.
//
// 페이지가 할 일: 뼈대(.apply-skel 같은 덮개 + 그 안 카드)를 그려 두고 tfFormWait({frame, skel, card, obj, host?}) 한 번 부르기.
//   card = 훑기를 입힐 덩어리(하나 또는 배열) / host = 문구·오류 카드를 띄울 그릇(기본 skel, PC 폰 목업 페이지는 목업 화면).
//   - 뼈대 위치는 이 파일이 절대 건드리지 않는다. 문구·오류 카드는 뼈대 *위*에 겹쳐 뜬다(레이아웃 0 변화) —
//     유성 10-01: 「문구가 뼈대 아래 붙으면 뼈대가 밀려 올라가고, 폼이 그 자리에 안 나온다」.
//   - 도착 판정 = 폼이 window.top으로 보내는 {tfApply:1,type:'ready'} 하나뿐. iframe load는 오류 페이지에도 발화해서 쓰지 않는다
//     (옛 「load 뒤 8초」 안전망이 크롬/구글 오류 화면을 드러내던 원인).
// 시간: T1 3초 문구 / T2 12초 「느리면 더 걸려요」 / T3 20초 뼈대 대신 「다시 불러오기」 카드. 연결이 끊긴 동안은 문구·오류 대신 위 알림만,
//   다시 연결되면 사용자가 아무것도 안 해도 iframe을 다시 불러온다(도착 전에만 — 도착 뒤에 다시 불러오면 적던 내용이 날아간다).
// 측정(Clarity가 실린 페이지만, 없으면 조용히 버림): fw_ready_0_3/3_8/8_15/15p · fw_slow · fw_timeout · fw_retry · fw_autoretry · fw_offline · fw_left_before_ready · fw_ready_after_retry.
(function () {
  if (window.tfFormWait) return;
  var T1 = 3, T2 = 12, T3 = 20;

  var CSS = ''
    + '.tfw-shim{position:relative;overflow:hidden}'
    + '.tfw-shim::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.85) 50%,rgba(255,255,255,0) 70%);transform:translateX(-100%);animation:tfwSh 1.5s ease-in-out infinite}'
    + '@keyframes tfwSh{0%{transform:translateX(-100%)}70%,100%{transform:translateX(100%)}}'
    + '.tfw-off .tfw-shim::after{animation:none;opacity:0}'
    + '.tfw-pill{position:absolute;left:50%;top:50%;z-index:5;transform:translate(-50%,-50%);width:max-content;max-width:calc(100% - 64px);background:#fff;border-radius:14px;padding:14px 22px;box-shadow:0 4px 18px rgba(25,31,40,.12);text-align:center;font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif;font-size:15px;font-weight:600;line-height:1.45;color:#333d4b;word-break:keep-all;animation:tfwIn .35s ease both}'
    + '.tfw-pill small{display:block;margin-top:2px;font-size:13.5px;font-weight:500;color:#6b7684}'
    + '@keyframes tfwIn{from{opacity:0}to{opacity:1}}'
    + '.tfw-failed>*:not(.tfw-err){visibility:hidden}'
    + '.tfw-err{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;justify-content:center;padding:0 16px;visibility:visible;animation:tfwIn .35s ease both}'
    + '.tfw-err .c{width:100%;max-width:420px;margin:0 auto;background:#fff;border-radius:20px;padding:36px 24px 26px;box-shadow:0 1px 4px rgba(0,0,0,.05);text-align:center;font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif;word-break:keep-all}'
    + '.tfw-err svg{display:block;width:48px;height:48px;margin:0 auto 16px}'
    + '.tfw-err .t{margin:0 0 8px;font-size:20px;font-weight:700;letter-spacing:-.4px;line-height:1.4;color:#191f28}'
    + '.tfw-err .s{margin:0 0 24px;font-size:14.5px;line-height:1.6;color:#6b7684}'
    + '.tfw-err button{display:block;width:100%;padding:16px;border:0;border-radius:15px;background:#3a8a5f;color:#fff;font:inherit;font-size:17px;font-weight:700;line-height:1.5;cursor:pointer;transition:background .2s,transform .1s}'
    + '.tfw-err button:active{background:#166841;transform:scale(.97)}'
    + '.tfw-ban{position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 12px);z-index:99999;max-width:480px;margin:0 auto;display:flex;gap:10px;align-items:flex-start;padding:12px 16px;border-radius:14px;background:#333d4b;color:#fff;font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif;font-size:14.5px;font-weight:600;line-height:1.45;word-break:keep-all;box-shadow:0 4px 18px rgba(25,31,40,.18);animation:tfwDrop .35s cubic-bezier(.22,.7,.25,1) both}'
    + '.tfw-ban.back{background:#166841}'
    + '.tfw-ban small{display:block;font-size:13px;font-weight:500;opacity:.85}'
    + '.tfw-ban svg{flex-shrink:0;width:20px;height:20px;margin-top:1px}'
    + '@keyframes tfwDrop{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}'
    + '@media (prefers-reduced-motion:reduce){.tfw-shim::after{animation:none;opacity:0}.tfw-pill,.tfw-err,.tfw-ban{animation:none}}';

  var WIFI = '<svg viewBox="0 0 48 48" fill="none" stroke="#8b95a1" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M8 19c9-8 23-8 32 0"/><path d="M14 26c6-5 14-5 20 0"/><path d="M20 33c2.5-2 5.5-2 8 0"/><circle cx="24" cy="39" r="1.8" fill="#8b95a1" stroke="none"/><path d="M10 10l28 30" stroke="#b0b8c1"/></svg>';
  var WIFI_W = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9.5c4.5-4 11.5-4 16 0"/><path d="M7 13c3-2.5 7-2.5 10 0"/><circle cx="12" cy="18" r="1.2" fill="#fff" stroke="none"/><path d="M4 4l16 16"/></svg>';
  var CHECK_W = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  // Clarity 이벤트 — analytics.js(async)보다 먼저 일어난 이벤트는 모아 뒀다가 clarity가 생기면 보낸다(최대 10초 기다림).
  var queue = [], flushTries = 0;
  function ev(name) { queue.push(name); flush(); }
  function flush() {
    if (!queue.length) return;
    if (typeof window.clarity === 'function') { while (queue.length) { try { window.clarity('event', queue.shift()); } catch (e) {} } return; }
    if (++flushTries > 20) { queue = []; return; }
    setTimeout(flush, 500);
  }
  function okGasOrigin(o) { try { var h = new URL(o).hostname; return h === 'script.google.com' || h.endsWith('.googleusercontent.com'); } catch (e) { return false; } }

  window.tfFormWait = function (o) {
    var frame = o.frame, skel = o.skel, obj = o.obj || '신청서를';
    var host = o.host || skel;   // 문구·오류 카드가 뜰 그릇 — PC 폰 목업이 있는 페이지는 목업 화면(.sk-wrap)을 넘겨 그 안 정중앙에 뜨게
    if (host !== skel && getComputedStyle(host).position === 'static') host.style.position = 'relative';
    if (!frame || !skel) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    [].concat(o.card || []).forEach(function (el) { if (el) el.classList.add('tfw-shim'); });   // 훑기를 입힐 덩어리(카드, 카드 밖 버튼 등)

    var ready = false, retried = false, offline = navigator.onLine === false;
    var pill = null, err = null, ban = null, banTimer = 0, timers = [], slowSent = false;

    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function setPill(html) {
      if (!html) { if (pill) { pill.remove(); pill = null; } return; }
      if (!pill) { pill = document.createElement('div'); pill.className = 'tfw-pill'; pill.setAttribute('role', 'status'); host.appendChild(pill); }
      if (pill.innerHTML !== html) { pill.innerHTML = html; pill.style.animation = 'none'; void pill.offsetWidth; pill.style.animation = ''; }
    }
    function setBanner(kind) {
      clearTimeout(banTimer);
      if (!kind) { if (ban) { ban.remove(); ban = null; } return; }
      if (!ban) { ban = document.createElement('div'); ban.setAttribute('role', 'status'); document.body.appendChild(ban); }
      ban.className = 'tfw-ban' + (kind === 'back' ? ' back' : '');
      ban.innerHTML = kind === 'back'
        ? CHECK_W + '<div>다시 연결됐어요<small>' + obj + ' 불러오고 있어요</small></div>'
        : WIFI_W + '<div>인터넷 연결이 끊겼어요<small>연결되면 바로 다시 불러올게요</small></div>';
      if (kind === 'back') banTimer = setTimeout(function () { setBanner(null); }, 3000);
    }
    function showErr() {
      if (ready || offline) return;
      setPill(null);
      if (!err) {
        err = document.createElement('div'); err.className = 'tfw-err';
        err.innerHTML = '<div class="c">' + WIFI + '<p class="t">' + obj + '<br>아직 못 불러왔어요</p><p class="s">와이파이나 데이터를 확인하고<br>다시 불러와 주세요</p><button type="button">다시 불러오기</button></div>';
        err.querySelector('button').addEventListener('click', function () { ev('fw_retry'); reload(false); });
        host.appendChild(err);
      }
      host.classList.add('tfw-failed');
      ev('fw_timeout');
    }
    function schedule(afterRetry) {
      clearTimers();
      if (afterRetry) setPill('다시 불러오고 있어요');
      else timers.push(setTimeout(function () { if (!ready && !offline) setPill(obj + ' 불러오고 있어요'); }, T1 * 1000));
      timers.push(setTimeout(function () {
        if (ready) return;
        if (!slowSent) { slowSent = true; ev('fw_slow'); }
        if (!offline) setPill('인터넷이 느리면 조금 더 걸려요<small>조금만 더 기다려 주세요</small>');
      }, T2 * 1000));
      timers.push(setTimeout(showErr, T3 * 1000));
    }
    function reload(auto) {
      retried = true;
      if (err) { err.remove(); err = null; }
      host.classList.remove('tfw-failed');
      var u = frame.src; frame.src = u;   // 같은 주소 재대입 = 다시 불러오기(쿼리 안 붙임 — 16은 파라미터 차단 정책)
      schedule(!auto);
      if (auto) ev('fw_autoretry');
    }
    function goOffline() {
      if (ready) return;
      offline = true; skel.classList.add('tfw-off'); setPill(null); setBanner('off'); ev('fw_offline');
      if (err) { err.remove(); err = null; host.classList.remove('tfw-failed'); }   // 알림이 「연결되면 다시 불러올게요」라 오류 카드와 같은 말을 두 번 하지 않게
    }
    function goOnline() {
      if (!offline) return;
      offline = false; skel.classList.remove('tfw-off');
      if (ready) { setBanner(null); return; }
      setBanner('back'); reload(true);
    }

    window.addEventListener('message', function (e) {
      if (ready || !okGasOrigin(e.origin)) return;
      var d = e.data; if (!d || d.tfApply !== 1 || d.type !== 'ready') return;
      ready = true; clearTimers(); setPill(null); if (err) { err.remove(); err = null; }
      if (ban && !ban.classList.contains('back')) setBanner(null);
      document.body.classList.add('form-ready');
      if (retried) ev('fw_ready_after_retry');
      else { var s = performance.now() / 1000; ev(s < 3 ? 'fw_ready_0_3' : s < 8 ? 'fw_ready_3_8' : s < 15 ? 'fw_ready_8_15' : 'fw_ready_15p'); }
      if (typeof o.onReady === 'function') { try { o.onReady(); } catch (x) {} }
    });
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    var leftSent = false;
    function left() { if (!ready && !leftSent) { leftSent = true; ev('fw_left_before_ready'); flush(); } }
    window.addEventListener('pagehide', left);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') left(); });

    if (offline) goOffline();
    schedule(false);
  };
})();
