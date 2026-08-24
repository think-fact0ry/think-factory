// 방문 통계 로더 (Microsoft Clarity) — 근거·판정=부모 레포 docs/5_탐색_2026-08-23_홈페이지계측_SEO_GEO_리서치.md, 백로그 §🏠.
// 처리방침(privacy.html §1②·§7·§9·§10)과 한 쌍: 도구·쿠키·보존을 바꾸면 처리방침도 같이(0-9).
//
// 게이트(위에서부터 하나라도 걸리면 아무것도 싣지 않음):
//  ① #nocount 로 열면 → 이 기기 영구 제외(localStorage tf_nocount) + 안내. #count 로 열면 해제.
//     (유성 기기 4대: 집·폰 IP가 유동이라 IP 제외는 불가 → 기기 플래그. 처리방침 §9의 방문자 거부 수단이기도 함)
//  ② 제외 플래그 켜진 기기 → 작은 "집계 제외 중" 표시만(캐시 삭제로 조용히 풀리는 걸 눈으로 알게).
//  ③ 자동화(webdriver 등)·think-factory.kr 외 호스트(로컬·프리뷰·github.io 래퍼)·iframe 안·프리렌더 → 미로드.
//  ④ CLARITY_ID 비어 있으면 미로드 (유성이 clarity.microsoft.com 프로젝트 만든 뒤 ID만 채움).
// 성능: 이 파일 <2KB·async, Clarity 태그도 async — 렌더 차단 0. 집계 대상 페이지=홈·이야기·바우처·활동·상담·활동 글 미러
// (설문 /monitoring·/feedback, 영수증 /receipt, QR /q 는 이용자 개인 맥락이라 싣지 않음).
// 첫 진입 출처 버킷(문자 vs 검색 vs 블로그 — 백로그 §🏠 #37): 세션당 1회 sessionStorage에만 저장(외부 전송 0),
// /contact 가 신청폼(06)에 넘겨 시트 X열 유입버킷에 범주값으로 기록. 문자 채널=전용 입구 /apply(sessionStorage에 tag:sms 직접 기록 후 /contact 이동 — 유성 08-24 "문자는 짧고 깔끔하게"). ?s=sms·?utm_source= 쿼리도 계속 인식(구형 링크·noscript 폴백).
window.tfSrcBucket = function () {
  try {
    var q = new URLSearchParams(location.search);
    var u = String(q.get('utm_source') || q.get('s') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
    if (u) return 'tag:' + u;
    var r = document.referrer; if (!r) return 'direct';
    var h = new URL(r).hostname;
    if (h === location.hostname) return 'site';
    if (/blog\.naver\.com$/.test(h)) return 'blog-naver';
    if (/search\.naver\.com$/.test(h)) return 'search-naver';
    if (/naver\.com$/.test(h)) return 'naver';
    if (/google\./.test(h)) return 'search-google';
    if (/daum\.net$|bing\.com$|yahoo\./.test(h)) return 'search-other';
    if (/instagram\.com$|facebook\.com$|fb\.com$|threads\.net$/.test(h)) return 'sns';
    if (/chatgpt\.com$|openai\.com$|perplexity\.ai$|gemini\.google\.com$|copilot\.microsoft\.com$/.test(h)) return 'ai';
    return 'other';
  } catch (e) { return 'other'; }
};
(function () { try { var b = window.tfSrcBucket(); if (b.indexOf('tag:') === 0 || !sessionStorage.getItem('tf_src')) sessionStorage.setItem('tf_src', b); } catch (e) {} })();

(function () {
  var CLARITY_ID = 'y7dihtbv2e';               // ← Clarity 프로젝트 ID (비면 수집 0)
  var KEY = 'tf_nocount';
  function get() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function set(on) { try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) {} }
  function pill(msg, ms) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;background:rgba(25,31,40,.88);color:#fff;font:600 13px/1.4 Pretendard,-apple-system,sans-serif;padding:8px 14px;border-radius:99px;pointer-events:none;letter-spacing:-.2px;';
    function mount() { document.body.appendChild(d); setTimeout(function () { d.remove(); }, ms); }
    document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
  }
  function clean() { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }

  if (location.hash === '#nocount') { set(true); clean(); pill('이 기기는 방문 집계에서 제외돼요', 3000); return; }
  if (location.hash === '#count') { set(false); clean(); pill('방문 집계 제외를 해제했어요', 3000); return; }
  if (get()) { pill('집계 제외 중', 1400); return; }
  if (navigator.webdriver || window._phantom || window.__nightmare || window.Cypress) return;
  if (location.hostname !== 'think-factory.kr') return;
  if (window.top !== window) return;
  if (!CLARITY_ID) return;

  function load() {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }
  if (document.prerendering) document.addEventListener('prerenderingchange', load, { once: true });
  else load();
})();
