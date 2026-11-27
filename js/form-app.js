// 신청서(06 Apply.html — 구글 화면 두 겹 안) ↔ 이 페이지: 앱 모드 + 문자 자동 입력. /contact, /register가 같이 쓴다(하나 고치면 둘 다).
// 앱 모드 = 폰(≤760px)에서 신청서가 화면 전체를 덮고 이 페이지 스크롤을 잠근다(body.form-app — 모양 CSS는 각 페이지 style).
//   on       = 06 수정 찾기 화면(그대로 켬, 2026-10-10)
//   on+keep  = 06 인증 시트(2026-11-28 S2/S3): 켜기 전에 보던 자리(신청서 맨 위가 화면 위로 얼마나 올라가 있나)를 재서 {tfParent:1, appy}로 돌려줌
//              → 신청서가 제 안에서 그만큼 내림 = 시트를 키보드 위에 붙이면서 뒤 신청서는 안 튐. appy를 먼저 보내고 고정한다(신청서가 다음 그림 전에 내리게)
//   off+y    = 인증 시트 닫힘: y = 신청서가 제 안에서 내린 만큼 → 이 페이지를 그 자리로(고정을 풀면 신청서가 제 높이로 돌아가 안 스크롤이 0이 되므로)
//   off      = 다른 화면(그대로 끔)
// 문자 자동 입력(WebOTP) = 안드로이드 크롬, 삼성 인터넷. 인증 시트가 열리면 기다리고, 문자가 오면 아래 「허용」 한 번 → {tfParent:1, otp} → 신청서가 6칸을 채운다.
//   기다리기 시작 = on+keep, 또는 단계 기록 otp_open, otp_resend(수정 찾기 인증 시트는 앱 모드 메시지가 없다 — 화면이 이미 앱 모드). 그만 = off
//   짝 = 06 문자 끝 줄 「@think-factory.kr #번호」(06 문자인증.js) — 이 페이지 주소가 바뀌면 둘 다. 아이폰은 이 길이 없다(키보드 위 「메시지에서」)
window.tfFormApp = function (f) {
  var ac = null, win = null;
  function phone() { return !!(window.matchMedia && window.matchMedia('(max-width:760px)').matches); }
  function stop() { if (ac) { try { ac.abort(); } catch (e) {} ac = null; } }
  function listen(src) {
    win = src;
    if (ac || !('OTPCredential' in window) || !navigator.credentials || typeof AbortController !== 'function') return;
    var a = ac = new AbortController();
    navigator.credentials.get({ otp: { transport: ['sms'] }, signal: a.signal }).then(function (c) {
      if (ac !== a) return; ac = null;
      var v = String(c && c.code || '').replace(/\D/g, '').slice(0, 6);
      if (v.length === 6 && win) { try { win.postMessage({ tfParent: 1, otp: v }, '*'); } catch (e) {} }
    }).catch(function () { if (ac === a) ac = null; });
  }
  function jump(top) {   // site.css html{scroll-behavior:smooth} — 되돌리기는 한 번에(미끄러지면 신청서가 움직여 보인다)
    var de = document.documentElement, sb = de.style.scrollBehavior;
    de.style.scrollBehavior = 'auto'; window.scrollTo(0, Math.max(0, top)); de.style.scrollBehavior = sb;
  }
  return {
    appmode: function (d, src) {
      var was = document.body.classList.contains('form-app');
      if (d.on) {
        if (d.keep) {
          if (!was && phone()) { try { src.postMessage({ tfParent: 1, appy: Math.max(0, Math.round(-f.getBoundingClientRect().top)) }, '*'); } catch (e) {} }
          listen(src);
        }
        document.body.classList.add('form-app');
      } else {
        stop();
        document.body.classList.remove('form-app');
        if (was && typeof d.y === 'number' && phone()) jump(f.getBoundingClientRect().top + window.pageYOffset + d.y);
      }
    },
    step: function (id, src) { if (id === 'otp_open' || id === 'otp_resend') listen(src); }
  };
};
