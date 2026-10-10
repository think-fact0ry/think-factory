/* 홈페이지 문의 창 — 창 본체(「문의하기」를 누를 때 받는 쪽, 문자 링크 페이지 /c/도 이 파일)
 * 서버 = 26_문의알리미(doPost text/plain JSON): v_mode · v_send · v_phone · v_poll · v_load · v_job
 * 디자인 = 생각공작소 prototype/문의창_디자인5차_프리뷰.html 실값 · 원칙 = docs/1 §4.18 채팅 · §4.16 동의 · §4.9 제출 게이트 · §4.11 뒤로 · §5.3 누름
 * 지키는 것(사전 계획 2026-10-10, prototype/26_홈페이지문의창_1d_사전계획_프리뷰.html):
 *   - 대화 내용은 방문 통계에 안 남는다 → 창 맨 바깥에 data-clarity-mask(처리방침 「입력창 내용은 기록되지 않으며」)
 *   - 응답을 못 받은 쓰기는 다시 보내지 않는다 → 작업 번호(cid)로 결과만 묻기(22 추천서 BAD_REPLY 실사고의 처방)
 *   - 창이 열려 있고 화면이 보일 때만 묻는다(3초 → 2분 조용하면 10초 → 15분이면 멈춤). GAS 동시 실행 30개는 계정 전체가 나눠 쓴다
 *   - 글은 글자로만 넣고, 행정 답장 속 웹 주소만 링크로(전화번호는 링크 아님 — 유성 10-08)
 *   - PC에서 홈, 서비스, 이야기 페이지의 휠과 방향키 가로채기가 창 안까지 오지 않게
 */
(function () {
  'use strict';
  if (window.tfInqPane) return;
  var CONSENT_VER = '2026-10-08';               // 26 INQ_CONSENT_VER와 같아야 첫 줄이 들어간다
  var TEL = '032-277-2007';
  var T_LIVE = 3000, T_SLOW = 10000, SLOW_AFTER = 120000, STOP_AFTER = 900000;
  var MAX_LEN = 1000;
  var GAS = '', DEMO = false, PAGE = false;

  // ── 작은 도구 ──
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function K(n) { return DEMO ? n + '_demo' : n; }   // 연습 화면은 다른 칸에 — 실제 대화 열쇠·동의를 안 건드린다
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function el(h) { var d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; }
  function $(s) { return R.querySelector(s); }
  function ev(n) { if (DEMO) return; try { if (window.clarity) window.clarity('event', n); } catch (e) {} }   // 내용은 안 싣는다(이름만), 연습 화면은 0
  function shk(e) { e.classList.remove('ti-shk'); void e.offsetWidth; e.classList.add('ti-shk'); }
  function fmtPh(v) { v = String(v).replace(/\D/g, '').slice(0, 11); if (v.length < 4) return v; if (v.length < 8) return v.slice(0, 3) + '-' + v.slice(3); return v.slice(0, 3) + '-' + v.slice(3, 7) + '-' + v.slice(7); }
  function cid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  var coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;
  var mqPhone = window.matchMedia ? matchMedia('(max-width:760px)') : { matches: true };

  // 시간 표시 = 이용자 언어(§2.1-8): 「오후 2:03」, 날 구분 「오늘」 「어제」 「10월 15일」
  function kst(iso) { var d = iso ? new Date(iso) : new Date(); return new Date(d.getTime() + (d.getTimezoneOffset() + 540) * 60000); }
  function hm(iso) { var d = kst(iso), h = d.getHours(), m = d.getMinutes(); return (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m; }
  function dayKey(iso) { var d = kst(iso); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function dayLabel(iso) {
    var k = dayKey(iso), t = dayKey(), y = kst(new Date(Date.now() - 86400000).toISOString()), yk = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
    if (k === t) return '오늘'; if (k === yk) return '어제'; var d = kst(iso); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  // 웹 주소만 링크로(글자로 넣은 뒤 주소 조각만 a로) — 메일 주소 안의 도메인은 건드리지 않는다
  var URL_RE = /(^|[^@\w.\-\/])((?:https?:\/\/|www\.)[!#-&*-;=?-~]+|[a-z0-9][a-z0-9\-]*(?:\.[a-z0-9\-]+)*\.(?:kr|com|net|org)(?![a-z0-9\-])(?:\/[!#-&*-;=?-~]*)?)/gi;
  function linkify(node, text) {
    var last = 0, m; URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text))) {
      var start = m.index + m[1].length, url = m[2];
      var trail = (url.match(/[.,!?)\]」』]+$/) || [''])[0]; url = url.slice(0, url.length - trail.length);
      if (!url) continue;
      node.appendChild(document.createTextNode(text.slice(last, start)));
      var a = document.createElement('a'); a.textContent = url;
      a.href = /^https?:\/\//i.test(url) ? url : 'https://' + url.replace(/^\/+/, '');
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      node.appendChild(a); last = start + url.length;
    }
    node.appendChild(document.createTextNode(text.slice(last)));
  }

  // ── 서버 부르기(22 rec run()과 같은 결) ──
  //   읽기 = 4초 안에 안 오면 같은 요청을 하나 더(먼저 온 것). 구글이 JSON 대신 HTML을 줄 때가 있다(BAD_REPLY = 일시적)
  //   쓰기 = 한 번만. 응답을 못 받으면 v_job으로 결과를 묻는다
  function once(body) {
    if (DEMO) return fake(body);
    return fetch(GAS, { method: 'POST', body: JSON.stringify(body) })
      .then(function (r) { return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (x) { throw new Error('BAD_REPLY'); } });
  }
  function transient(x) { return x instanceof TypeError || String(x && x.message) === 'BAD_REPLY'; }
  function read(body) {
    return new Promise(function (res, rej) {
      var started = 0, inflight = 0, done = false, timer = 0;
      var go = function () {
        started++; inflight++;
        once(body).then(function (d) { inflight--; if (done) return; done = true; clearTimeout(timer); res(d); },
          function (x) {
            inflight--; if (done) return;
            if (!transient(x)) { done = true; clearTimeout(timer); return rej(x); }
            if (started < 2) { clearTimeout(timer); return go(); }
            if (!inflight) { done = true; rej(x); }
          });
      };
      go();
      timer = setTimeout(function () { if (!done && started < 2) go(); }, 4000);
    });
  }

  // ── 상태 ──
  var R = null, P, TH, TA;
  var S = { open: false, key: '', mode: '', read: 0, lastSeq: 0, hasPhone: false, more: false, loaded: '', sentFresh: false, noteMode: '', phonePending: '', saidMail: false };
  var known = {};          // 화면에 그린 줄 번호
  var queue = [], sending = null;
  var pollT = 0, polling = false, lastChange = Date.now();

  function consentAt() { try { var c = JSON.parse(ls(K('tf_inq_cs')) || 'null'); return c && c.ver === CONSENT_VER ? c.at : ''; } catch (e) { return ''; } }

  // ── 모양(5차 실값, 이 창 안에만 — site.css 클래스와 안 겹치게 ti- 접두) ──
  var CSS = [
    '#tfInq{--ease:cubic-bezier(.22,.7,.25,1);font-family:"Pretendard Variable",Pretendard,-apple-system,sans-serif;color:var(--g900);word-break:keep-all;letter-spacing:-.2px;-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}',
    '#tfInq *{box-sizing:border-box}',
    '#tfInq button{font-family:inherit}',
    '#tfInq .ti-pane{position:fixed;left:0;top:0;width:100%;height:100%;z-index:1150;background:#fff;display:flex;flex-direction:column;overflow:hidden;transform-origin:left bottom;transform:scale(.4);opacity:0;pointer-events:none;transition:transform .38s var(--ease),opacity .22s ease;-webkit-user-select:none;user-select:none;touch-action:pan-x pan-y}',   // 기준점 = 폰 「문의하기」(왼쪽 아래 — 실제 값은 open·close 때 버튼 가운데를 재서 originToBtn, 이 값은 버튼이 없을 때만) · touch-action = 두 손가락 확대 막음(유성 10-10 「렉이 걸려」)
    '#tfInq.on .ti-pane{transform:none;opacity:1;pointer-events:auto}',
    '@media (min-width:761px){#tfInq .ti-pane{left:auto;top:auto;right:20px;bottom:20px;width:380px;height:min(640px,calc(100vh - 40px));border-radius:20px;box-shadow:0 12px 40px rgba(25,31,40,.18),0 2px 8px rgba(25,31,40,.08);transform-origin:calc(100% - 40px) calc(100% - 20px)}}',
    '#tfInq.page .ti-pane{transition:none;transform:none;opacity:1;pointer-events:auto}',
    '@media (min-width:761px){#tfInq.page .ti-pane{left:calc(50% - 240px);right:auto;top:0;bottom:auto;width:480px;height:100%;border-radius:0;box-shadow:0 0 0 1px var(--g200)}}',
    'html.tfinq-open,html.tfinq-open body{overflow:hidden}',
    '@media (min-width:761px){html.tfinq-open:not(.tfinq-page),html.tfinq-open:not(.tfinq-page) body{overflow:visible}}',
    // 머리
    '#tfInq .ti-hd{display:flex;align-items:center;gap:10px;padding:16px 16px 12px;border-bottom:1px solid var(--g100);flex:none}',
    '#tfInq .ti-x{width:38px;height:38px;border:0;background:none;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--g700);cursor:pointer;transition:transform .16s;padding:0}',
    '#tfInq .ti-x:active{transform:scale(.82)}',
    '#tfInq .ti-x svg{width:22px;height:22px}',
    '#tfInq .ti-av{width:38px;height:38px;flex:none;display:flex}',
    '#tfInq .ti-av img{width:100%;height:100%;display:block}',   // 생각공작소 로고(말풍선 모양 그대로 — 「생」 글자는 AI 같다, 유성 10-10)
    '#tfInq .ti-tt{flex:1;min-width:0}',
    '#tfInq .ti-nm{font-size:17px;font-weight:700;letter-spacing:-.3px;line-height:1.3;display:flex;align-items:center;gap:4px}',
    '#tfInq .ti-onp{font-size:10.5px;font-weight:800;letter-spacing:.3px;color:var(--green700);background:#fff;border:1.5px solid var(--green600);border-radius:99px;padding:0 4px;line-height:14px;display:none}',
    '#tfInq.chat .ti-onp{display:inline-block;animation:tiPop .32s cubic-bezier(.3,1.5,.5,1) backwards}',
    '#tfInq .ti-tel{font-size:12px;color:var(--g600);font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:5px;-webkit-user-select:text;user-select:text}',
    '#tfInq .ti-tel i{display:none;width:7px;height:7px;border-radius:50%;background:var(--green600);flex:none}',
    '#tfInq.chat .ti-tel i{display:inline-block}',
    // 대화
    '#tfInq .ti-th{flex:1 1 0;min-height:0;overflow-y:auto;padding:18px 16px 12px;display:flex;flex-direction:column;scrollbar-width:none;position:relative;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
    '#tfInq .ti-th::-webkit-scrollbar{width:0}',
    '#tfInq .ti-day,#tfInq .ti-sys{align-self:center;font-size:12px;color:var(--g600);margin:16px 0 0;text-align:center;line-height:1.5}',
    '#tfInq .ti-th>.ti-day:first-child{margin-top:0}',
    '#tfInq .ti-day+.ti-row{margin-top:12px}',
    '#tfInq .ti-row{display:flex;gap:6px;align-items:flex-end;max-width:100%;margin-top:16px}',
    '#tfInq .ti-row.cont{margin-top:4px}',
    '#tfInq .ti-row.me{justify-content:flex-end}',
    '#tfInq .ti-who{font-size:12px;color:var(--g600);margin:0 0 4px 2px}',
    '#tfInq .ti-bub{max-width:258px;padding:10px 13px;border-radius:18px;font-size:15px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;-webkit-user-select:text;user-select:text}',
    '#tfInq .them .ti-bub{background:var(--g100);color:var(--g900)}',
    '#tfInq .them:not(.cont) .ti-bub{border-top-left-radius:6px}',
    '#tfInq .them .ti-bub a{color:var(--green700);text-decoration:underline;text-underline-offset:2px}',
    '#tfInq .me .ti-bub{background:var(--green600);color:#fff}',   // 채움 600(유성 10-10 「추천대로」 — 700은 너무 강함)
    // 우리 쪽 말풍선 = 네 모서리 18px(꼬리 모서리 없음) — 유성 10-10 「오른쪽이 잘려있는 듯」, 실측 잘림 0·원인 = 마지막 말풍선의 6px 꼬리(받은함 1-c와 같이)
    '#tfInq .ti-meta{font-size:11px;color:var(--g600);white-space:nowrap;margin-bottom:2px;display:flex;flex-direction:column;align-items:flex-end;line-height:1.35}',
    '#tfInq .them .ti-meta{align-items:flex-start}',
    '#tfInq .ti-row:not(.last) .ti-meta{display:none}',
    '#tfInq .ti-meta .rd{color:var(--green700);font-weight:600;display:none}',
    '#tfInq .ti-row.isread .ti-meta .rd{display:block}',
    '#tfInq .ti-meta .ck{width:12px;height:12px;display:none;color:var(--g500)}',
    '#tfInq .ti-row.pend .ti-meta .ck{display:block}',
    '#tfInq .ti-row.pend .ti-meta .tm{display:none}',
    '#tfInq .ti-note{font-size:12px;color:var(--g600);text-align:right;margin:4px 2px 0;line-height:1.4}',
    '#tfInq .ti-note button{border:0;background:none;color:var(--green700);font-size:12px;font-weight:700;text-decoration:underline;padding:4px 0 4px 6px;cursor:pointer;transition:transform .12s}',
    '#tfInq .ti-note button:active{transform:scale(.93)}',
    '#tfInq .ti-new{animation:tiUp .42s var(--ease) backwards}',
    '@keyframes tiUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
    '@keyframes tiPop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}',
    // 뼈대(§5.4 훑기)
    '#tfInq .ti-sk{height:40px;border-radius:18px;background-color:var(--g100);background-image:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);background-size:200% 100%;background-repeat:no-repeat;animation:tiSk 1.5s linear infinite;margin-top:12px}',
    '@keyframes tiSk{0%{background-position:150% 0}70%,100%{background-position:-50% 0}}',
    '@media (prefers-reduced-motion:reduce){#tfInq .ti-sk{animation:none}}',
    // 번호 카드
    '#tfInq .ti-nc{align-self:stretch;background:#fff;border:1px solid var(--g200);border-radius:16px;padding:16px 14px 14px;margin-top:8px;box-shadow:0 1px 3px rgba(25,31,40,.06)}',
    '#tfInq .ti-nc .t1{font-size:15px;font-weight:700;margin-bottom:6px}',
    '#tfInq .ti-nc .t2{font-size:13.5px;color:var(--g700);margin-bottom:10px}',
    '#tfInq .ti-line{display:flex;gap:8px;align-items:flex-end}',
    '#tfInq .ti-inp{flex:1;min-width:0;background:var(--g100);border:1.5px solid transparent;border-radius:12px;padding:11px 12px;font-size:16px;font-family:inherit;color:var(--g900);outline:none;caret-color:var(--green600);transition:background .15s,border-color .15s;-webkit-user-select:text;user-select:text}',
    '#tfInq .ti-inp::placeholder{color:var(--g500)}',
    '#tfInq .ti-inp:focus{background:#fff;border-color:var(--green600)}',
    '#tfInq .ti-dbtn{border:0;background:var(--g100);color:var(--dark);border-radius:12px;padding:0 16px;height:47px;font-size:15px;font-weight:600;cursor:pointer;transition:transform .08s,background .15s,color .15s;flex:none}',
    '#tfInq .ti-dbtn.ready{background:var(--dark);color:#fff}',
    '#tfInq .ti-dbtn.ready:active{transform:scale(.97);background:var(--g800)}',
    '#tfInq .ti-nc.done{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--g700);padding:11px 14px}',
    '#tfInq .ti-ok{width:18px;height:18px;border-radius:50%;background:var(--green600);display:inline-flex;align-items:center;justify-content:center;flex:none}',
    '#tfInq .ti-ok svg{width:11px;height:11px;fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}',
    '#tfInq .ti-gone{align-self:center;text-align:center;margin:auto 0;padding:24px 8px}',
    '#tfInq .ti-gone b{display:block;font-size:17px;margin-bottom:4px}',
    '#tfInq .ti-gone p{margin:0 0 16px;color:var(--g600);font-size:14px}',
    '#tfInq .ti-resume{align-self:center;margin-top:14px;border:0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.1);border-radius:99px;padding:9px 16px;font-size:14px;font-weight:600;color:var(--g800);cursor:pointer;transition:transform .08s}',
    '#tfInq .ti-resume:active{transform:scale(.96)}',
    // 입력
    // 입력 칸 = 흐름 안 맨 아래(px 여유 없음). 키보드가 커서 보이는 높이가 모자라면 대화 칸이 먼저 0까지 줄고, 그래도 모자라면 입력 칸이 스스로 스크롤
    //   (메모리 responsive-first 10-10 「키보드 위 버튼 — 띄우고 px로 맞추지 말 것」: 지금 적는 칸 우선)
    '#tfInq.kb .ti-comp{padding-bottom:14px}',   // 키패드가 올라오면 아래 막대는 키패드 뒤 = 막대 높이 여백 없음(유성 10-10 「좀 잘려서 붙어」)
    '@media (max-width:760px){#tfInq.on.kb:not(.page)::before{content:"";position:fixed;inset:0;background:#fff;z-index:1149}}',   // 키패드가 올라오는 동안 창(보이는 높이로 먼저 줄어듦)과 키패드 사이에 뒤 화면이 비치지 않게 흰 바닥(유성 10-10 「채팅 뒤쪽 화면이 보이는듯함」)
    '#tfInq .ti-comp{border-top:1px solid var(--g100);padding:10px 12px 14px;padding-bottom:calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;background:#fff;flex:0 1 auto;min-height:0;overflow-y:auto;scrollbar-width:none}',
    '#tfInq .ti-comp::-webkit-scrollbar{width:0}',
    '#tfInq .ti-taw{flex:1;min-width:0;position:relative;border-radius:20px;overflow:hidden}',
    '#tfInq .ti-taw::before,#tfInq .ti-taw::after{content:"";position:absolute;left:0;right:0;height:22px;pointer-events:none;opacity:0;transition:opacity .2s;z-index:1}',
    '#tfInq .ti-taw::before{top:0;background:var(--sf-top)}',
    '#tfInq .ti-taw::after{bottom:0;background:var(--sf-bot)}',
    '#tfInq .ti-taw.more::after,#tfInq .ti-taw.moreTop::before{opacity:1}',
    '#tfInq .ti-ta{display:block;width:100%;resize:none;background:var(--g100);border:1.5px solid transparent;border-radius:20px;padding:10px 14px;font-size:16px;font-family:inherit;line-height:1.45;color:var(--g900);outline:none;max-height:120px;scrollbar-width:none;caret-color:var(--green600);transition:background .15s,border-color .15s;-webkit-user-select:text;user-select:text}',
    '#tfInq .ti-ta::-webkit-scrollbar{width:0;height:0}',
    '#tfInq .ti-ta::placeholder{color:var(--g500)}',
    '#tfInq .ti-ta:focus{background:#fff;border-color:var(--green600)}',
    '#tfInq .ti-send{width:42px;height:42px;border-radius:50%;border:0;background:var(--green600);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;transition:transform .1s,background .2s;padding:0}',
    '#tfInq .ti-send.off{background:var(--p-disabled);cursor:default}',
    '#tfInq .ti-send:not(.off):active{transform:scale(.92);background:var(--green700)}',
    '#tfInq .ti-send svg{width:20px;height:20px}',
    '#tfInq .ti-mailf{display:none;flex-direction:column;gap:8px}',
    '#tfInq.mailnew .ti-mailf{display:flex}',
    '#tfInq.mailnew .ti-chatline{display:none}',
    '#tfInq .ti-mailf .ti-taw{border-radius:14px}',
    '#tfInq .ti-mailf .ti-ta{border-radius:14px;min-height:96px;max-height:150px}',
    '#tfInq .ti-mailf .ti-inp{flex:none}',
    '#tfInq .ti-fl{font-size:13.5px;font-weight:600;color:var(--g600);margin:2px 0 -2px 4px}',
    '#tfInq .ti-fl.on{color:var(--green600)}',
    '#tfInq .ti-ta.err,#tfInq .ti-inp.err{border-color:var(--red)!important;background:#fff}',
    '#tfInq .ti-shk{animation:tiShk .28s cubic-bezier(.36,.07,.19,.97)}',
    '@keyframes tiShk{20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(1px)}}',
    // 채움 버튼(§5.3-1: 어두워짐 + 누른 자리에서 퍼지는 물결 + 살짝 축소, 흰 글자는 그대로)
    '#tfInq .ti-btn{width:100%;font-size:17px;font-weight:700;padding:17px;border-radius:var(--r-md);border:none;background:var(--green600);color:#fff;cursor:pointer;transition:transform .12s,background .12s;position:relative;overflow:hidden}',   // 채움 = green600·누름 green700(유성 10-10, §3.1 기본)
    '#tfInq .ti-btn:active{transform:scale(.97);background:var(--green700)}',
    '#tfInq .ti-btn.gate,#tfInq .ti-btn.gate:active{background:var(--p-disabled);transform:none}',
    '#tfInq .ti-out{width:100%;background:none;border:none;font-size:15px;font-weight:600;color:var(--g500);padding:14px;margin-top:4px;cursor:pointer;transition:transform .12s}',
    '#tfInq .ti-out:active{transform:scale(.93)}',
    '#tfInq .ti-bl{position:relative;z-index:1}',
    '#tfInq .ti-rip{position:absolute;z-index:0;top:50%;width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.16);transform:translate(-50%,-50%) scale(0);pointer-events:none}',
    '#tfInq .ti-rip.go{transform:translate(-50%,-50%) scale(var(--rs,16));transition:transform .46s cubic-bezier(.25,.6,.3,1)}',
    '#tfInq .ti-rip.fade{opacity:0;transition:opacity .3s}',
    // 토스트(§5.5: 성공만 초록 원 체크, 그 밖엔 글자만 · 입력 칸 위 12px)
    '#tfInq .ti-toast{position:absolute;left:50%;transform:translate(-50%,8px);bottom:80px;z-index:15;background:#191f28;color:#F9FBFA;font-size:14px;font-weight:600;line-height:1.45;padding:10px 16px;border-radius:12px;max-width:calc(100% - 32px);width:max-content;text-align:center;white-space:pre-line;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}',
    '#tfInq .ti-toast.on{opacity:1;transform:translate(-50%,0)}',
    // 동의 시트(태블릿 #consentSheet 실값 · §4.3 · §4.16)
    '#tfInq .ti-dim{position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:20;opacity:0;pointer-events:none;transition:opacity .25s}',
    '#tfInq .ti-dim.on{opacity:1;pointer-events:auto}',
    '#tfInq .ti-sheet{touch-action:none;position:absolute;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));background:#fff;border-radius:var(--r-lg);z-index:21;padding:14px 24px 24px;transform:translateY(calc(100% + 24px));transition:transform .3s cubic-bezier(.2,.8,.3,1)}',
    '#tfInq .ti-sheet.on{transform:none}',
    '#tfInq .ti-sheet,#tfInq .ti-sheet>*{will-change:transform,opacity}',
    '#tfInq .ti-sheet.on>*{animation:tiSheet .6s cubic-bezier(.22,.7,.25,1) backwards}',
    '#tfInq .ti-sheet.on>*:nth-child(1){animation-delay:.06s}#tfInq .ti-sheet.on>*:nth-child(2){animation-delay:.16s}',
    '#tfInq .ti-sheet.on>*:nth-child(3){animation-delay:.26s}#tfInq .ti-sheet.on>*:nth-child(4){animation-delay:.36s}',
    '@keyframes tiSheet{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
    '#tfInq .ti-sheet::before{content:"";display:block;width:40px;height:4px;background:var(--g200);border-radius:99px;margin:0 auto 18px}',
    '#tfInq .ti-sheet h2{font-size:21px;font-weight:700;letter-spacing:-.5px;line-height:1.4;margin:0 0 22px;color:var(--g900)}',
    '#tfInq .ti-agl{display:flex;flex-direction:column;gap:7px;margin-bottom:24px}',
    '#tfInq .ti-agi{display:flex;align-items:flex-start;gap:9px;font-size:15px;color:var(--g700);font-weight:500;line-height:1.45;background:none;border:none;text-align:left;cursor:pointer;padding:5px 6px;margin:0 -6px;border-radius:var(--r-md);transition:background .12s;width:calc(100% + 12px)}',
    '#tfInq .ti-agi:active{background:var(--g100)}',
    '#tfInq .ti-agi .ck{flex-shrink:0;color:var(--green600);display:flex;margin-top:1px}',
    '#tfInq .ti-agi .ck svg{width:19px;height:19px;display:block}',
    '#tfInq .ti-agi .req{color:var(--green700);font-weight:700;margin-right:8px}',
    '#tfInq .ti-agi .at{flex:1}',
    '#tfInq .ti-agi .ch{flex-shrink:0;color:var(--g400);display:flex;align-self:center;margin-left:8px;transition:transform .25s}',
    '#tfInq .ti-agi .ch svg{width:18px;height:18px;display:block}',
    '#tfInq .ti-agi.open .ch{transform:rotate(90deg)}',
    '#tfInq .ti-det{overflow:hidden;max-height:0;transition:max-height .35s var(--ease)}',
    '#tfInq .ti-agi.open+.ti-det{max-height:260px}',
    '#tfInq .ti-det dl{margin:4px 0 2px 28px;background:var(--g50);border-radius:12px;padding:11px 13px;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13.5px}',
    '#tfInq .ti-det dt{color:var(--g600);white-space:nowrap}',
    '#tfInq .ti-det dd{margin:0;color:var(--g900)}',
    // 덫칸 = 사람 눈에도 자동완성에도 안 걸리는 자리(폼 밖·이름 낯섦·자동완성 끔·화면 밖)
    '#tfInq .ti-hpx{position:absolute;left:-9999px;top:auto;width:1px;height:1px;opacity:0;pointer-events:none}',
    // 연습 화면 조종판(?inq=demo 일 때만)
    '#tfInq .ti-demo{position:fixed;left:8px;top:8px;z-index:1300;background:rgba(25,31,40,.92);color:#fff;border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:6px;max-width:300px;font-size:12px}',
    '#tfInq .ti-demo b{width:100%;font-size:12px;color:#ace8c3;cursor:pointer}',
    '#tfInq .ti-demo.min button{display:none}',
    '#tfInq .ti-demo button{border:0;border-radius:8px;background:rgba(255,255,255,.14);color:#fff;font-size:12px;padding:6px 8px;cursor:pointer}',
    '#tfInq .ti-demo button.on{background:#ace8c3;color:#191f28}'
  ].join('\n');

  var ICO = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>',
    clock: '<svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    ok: '<span class="ti-ok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>'
  };

  function build() {
    var st = document.createElement('style'); st.id = 'tfInqCss'; st.textContent = CSS; document.head.appendChild(st);
    R = el('<div id="tfInq" data-clarity-mask="True" role="dialog" aria-label="문의 창"></div>');   // Clarity 문서 표기 그대로(창 안 글자 전부 가림, 무게 0)
    R.innerHTML =
      '<div class="ti-pane">'
      + '<div class="ti-hd"><div class="ti-av"><img src="/assets/favicon-96x96.png" alt="" width="38" height="38"></div><div class="ti-tt"><div class="ti-nm">생각공작소 <span class="ti-onp">ON</span></div><div class="ti-tel"><i></i>' + TEL + '</div></div>'
      + '<button class="ti-x" type="button" aria-label="닫기">' + ICO.x + '</button></div>'
      + '<div class="ti-th" aria-live="polite"></div>'
      + '<div class="ti-comp">'
      + '<div class="ti-line ti-chatline"><div class="ti-taw"><textarea class="ti-ta" id="tiTa" rows="1" maxlength="' + MAX_LEN + '" placeholder="어떤 점이 궁금하세요?" autocomplete="off"></textarea></div>'
      + '<button class="ti-send off" type="button" aria-label="보내기">' + ICO.up + '</button></div>'
      + '<div class="ti-mailf"><div class="ti-fl f1">문의 내용</div><div class="ti-taw"><textarea class="ti-ta" id="tiTa2" maxlength="' + MAX_LEN + '" placeholder="어떤 점이 궁금하세요?" autocomplete="off"></textarea></div>'
      + '<div class="ti-fl f2">휴대폰 번호</div><input class="ti-inp" id="tiPh2" inputmode="numeric" placeholder="010-0000-0000" autocomplete="off">'
      + '<button class="ti-btn gate" type="button" id="tiMail"><span class="ti-bl">보내기</span></button></div>'
      + '</div>'
      + '<input class="ti-hpx" type="text" name="tf_q_n0" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<div class="ti-toast" role="status"></div>'
      + '<div class="ti-dim"></div>'
      + '<div class="ti-sheet" role="dialog" aria-label="동의">'
      + '<h2>서비스 문의에<br>꼭 필요한 동의만 담았어요</h2>'
      + '<div class="ti-agl"><button type="button" class="ti-agi"><span class="ck">' + ICO.check + '</span><span class="at"><span class="req">필수</span>개인정보 수집 및 이용</span><span class="ch">' + ICO.chev + '</span></button>'
      + '<div class="ti-det"><dl><dt>수집 항목</dt><dd>문의 내용, 휴대폰 번호<span style="white-space:nowrap">(남길 때만)</span></dd><dt>이용 목적</dt><dd>문의 답장</dd><dt>보유 기간</dt><dd>마지막 대화 후 1년</dd>'
      + '<dt>거부 권리</dt><dd>동의하지 않으면 문의 창을 쓸 수 없어요. 전화(' + TEL + ')로 문의할 수 있어요.</dd></dl></div></div>'
      + '<button class="ti-btn" type="button" id="tiAgree"><span class="ti-bl">동의하고 시작하기</span></button>'
      + '<button class="ti-out" type="button" id="tiLater">다음에 하기</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(R);
    P = $('.ti-pane'); TH = HOST = $('.ti-th'); TA = $('#tiTa');
    wire();
  }

  // ── 누름: 솔리드 버튼 물결(§5.3-1, 상담일지 pressRipple) ──
  function ripple(btn) {
    btn.addEventListener('pointerdown', function (e) {
      if (btn.classList.contains('gate')) return;
      var r = btn.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      var sp = document.createElement('span'); sp.className = 'ti-rip'; sp.style.left = x + 'px'; sp.style.top = y + 'px';
      sp.style.setProperty('--rs', Math.ceil(Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) / 15) + 1);
      btn.appendChild(sp); requestAnimationFrame(function () { sp.classList.add('go'); });
      var end = function () { sp.classList.add('fade'); setTimeout(function () { if (sp.parentNode) sp.remove(); }, 340); btn.removeEventListener('pointerup', end); btn.removeEventListener('pointerleave', end); };
      btn.addEventListener('pointerup', end); btn.addEventListener('pointerleave', end);
    });
  }
  function fadeWatch(ta) {   // 넘칠 때만 위아래 초록 그라디언트(§4.13-6)
    var host = ta.parentNode;
    var f = function () { var over = ta.scrollHeight > ta.clientHeight + 1;
      host.classList.toggle('more', over && ta.scrollTop + ta.clientHeight < ta.scrollHeight - 1);
      host.classList.toggle('moreTop', over && ta.scrollTop > 1); };
    ta.addEventListener('scroll', f); ta.addEventListener('input', f); return f;
  }
  function autosize(ta, max) { ta.style.height = 'auto'; ta.style.height = Math.min(max, ta.scrollHeight + 3) + 'px'; }
  var toastT = 0;
  function toast(msg) {
    var t = $('.ti-toast'); t.textContent = msg;
    t.style.bottom = ($('.ti-comp').offsetHeight + 12) + 'px';   // 입력 칸 위 12px(§5.5) — 높이는 자기 것만 잰다
    t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  function wire() {
    [].forEach.call(R.querySelectorAll('.ti-btn'), ripple);
    $('.ti-x').addEventListener('click', function () { if (PAGE) { location.href = '/'; return; } requestClose(); });
    R.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });   // 아이폰 사파리 = touch-action 대신 이것으로 확대 막음
    // 빈 칸을 누르고 있으면 뜨는 안드로이드 글자 돋보기(유성 10-10 「매우 불편함. 없애」) = 빈 칸일 때만 기본 동작을 막고 손을 떼면 직접 포커스.
    // 글이 있는 칸은 그대로 — 커서 옮기기·글자 고르기에 돋보기가 쓰이고, 안드로이드 시스템 기능이라 웹이 따로 끌 수 없다. 빈 칸 길게 눌러 붙여넣기도 같이 막힘(키보드 클립보드 버튼은 됨)
    var tz = null;
    R.addEventListener('touchstart', function (e) {
      var t = e.target; tz = null;
      if (e.touches.length !== 1 || !t || !/^(TEXTAREA|INPUT)$/.test(t.tagName) || t.value) return;
      e.preventDefault(); tz = { el: t, x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });
    R.addEventListener('touchmove', function (e) { if (tz && Math.hypot(e.touches[0].clientX - tz.x, e.touches[0].clientY - tz.y) > 10) tz = null; }, { passive: true });
    R.addEventListener('touchend', function (e) { if (!tz) return; var el = tz.el; tz = null; e.preventDefault(); el.focus(); }, { passive: false });
    var send = $('.ti-send'), fTa = fadeWatch(TA);
    TA.value = ss(K('tf_inq_draft')) || '';
    var sync = function () { send.classList.toggle('off', !TA.value.trim()); autosize(TA, 120); fTa(); ss(K('tf_inq_draft'), TA.value); };
    TA.addEventListener('input', sync);
    TA.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey || coarse) return;   // 폰은 줄바꿈, PC는 Enter = 보내기
      if (e.isComposing || e.keyCode === 229) return;          // 한글 조합 중 Enter는 글자 확정일 뿐
      e.preventDefault(); doSend();
    });
    send.addEventListener('click', function () { if (!TA.value.trim()) { shk(send); return; } doSend(); });
    // 메일 모드 새 문의
    var ta2 = $('#tiTa2'), ph2 = $('#tiPh2'), ms = $('#tiMail'), fTa2 = fadeWatch(ta2);
    var mailOk = function () { return { t: !!ta2.value.trim(), p: ph2.value.replace(/\D/g, '').length === 11 }; };
    var gate = function () { var o = mailOk(); ms.classList.toggle('gate', !(o.t && o.p)); if (o.t) ta2.classList.remove('err'); if (o.p) ph2.classList.remove('err'); };
    ta2.addEventListener('input', function () { gate(); autosize(ta2, 150); fTa2(); });
    [[ta2, '.f1'], [ph2, '.f2']].forEach(function (p) {   // 칸에 들어가면 그 칸 이름이 초록(§4.1)
      var lb = $('.ti-fl' + p[1]);
      p[0].addEventListener('focus', function () { lb.classList.add('on'); });
      p[0].addEventListener('blur', function () { lb.classList.remove('on'); });
    });
    ph2.addEventListener('input', function () { var was = ph2.dataset.full === '1'; ph2.value = fmtPh(ph2.value); gate();
      if (ph2.value.replace(/\D/g, '').length === 11 && !was && !ph2.dataset.fix) ph2.blur(); });   // 11자리 = 키패드 내림(§3.7), 고치러 연 땐 안 내림
    ph2.addEventListener('focus', function () { ph2.dataset.fix = ph2.value.replace(/\D/g, '').length === 11 ? '1' : ''; });
    ms.addEventListener('click', function () {
      var o = mailOk();
      if (!(o.t && o.p)) { shk(ms); if (!o.t) { ta2.classList.add('err'); shk(ta2.parentNode); } if (!o.p) { ph2.classList.add('err'); shk(ph2); } return; }
      sendMail(ta2.value.trim(), ph2.value);
    });
    // 동의 시트
    $('.ti-agi').addEventListener('click', function () { $('.ti-agi').classList.toggle('open'); });
    $('#tiAgree').addEventListener('click', function () {
      ls(K('tf_inq_cs'), JSON.stringify({ ver: CONSENT_VER, at: new Date().toISOString() })); ev('inq_consent');
      closeSheet(); pump();   // 동의 전에 막혀 있던 첫 줄이 있으면 이어서
      if (!coarse) setTimeout(function () { (R.classList.contains('mailnew') ? ta2 : TA).focus(); }, 320);
    });
    $('#tiLater').addEventListener('click', function () { ev('inq_later'); closeSheet(); setTimeout(function () { if (PAGE) location.href = '/'; else requestClose(); }, 180); });
    $('.ti-dim').addEventListener('click', function () { $('#tiLater').click(); });
    (function (sheet) {   // §4.3-5 위쪽(핸들+제목 72px)을 아래로 80px 넘게 끌면 닫힘 = 다음에 하기(태블릿 상담일지 initSheetDrag 그대로)
      var y0 = 0, dy = 0, on = false, GRAB = 72;
      var move = function (e) { if (!on) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = 'translateY(' + dy + 'px) scale(.97)'; };   // 아래로만
      var end = function () {
        if (!on) return; on = false;
        removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
        sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 80) $('#tiLater').click();
      };
      sheet.addEventListener('pointerdown', function (e) {
        if (e.clientY - sheet.getBoundingClientRect().top > GRAB) return;
        on = true; y0 = e.clientY; dy = 0; sheet.style.transition = 'none'; sheet.style.transform = 'scale(.97)';   // 잡았다는 피드백(살짝 작아짐)
        addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);   // window = 손가락이 밖으로 나가도 끝남
      });
    })($('.ti-sheet'));
    // 위로 올리면 이전 대화
    TH.addEventListener('scroll', function () { if (TH.scrollTop < 40 && S.more && !S.loadingMore) loadMore(); });
    // PC 페이지 넘기기(홈·서비스·이야기)가 휠과 방향키를 가져가지 않게 — 창 안에서 생긴 것만 창에서 끊는다
    addEventListener('wheel', function (e) { if (S.open && R.contains(e.target)) e.stopPropagation(); }, { capture: true, passive: true });
    addEventListener('keydown', function (e) {
      if (!S.open) return;
      if (e.key === 'Escape' && !PAGE) { requestClose(); return; }
      if (R.contains(document.activeElement) && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End|\s)$/.test(e.key)) e.stopPropagation();
    }, true);
    // 뒤로 = 창만 닫힘(§4.11 한 단계)
    addEventListener('popstate', function () { if (S.open && !PAGE) doClose(); });
    // 폰 키보드: 보이는 높이에 창을 맞춘다(§4.2-2 — 메인 페이지는 키보드가 화면을 줄이는 설정이 없다)
    if (window.visualViewport) { visualViewport.addEventListener('resize', fitVV); visualViewport.addEventListener('scroll', fitVV); }
    addEventListener('resize', fitVV);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && S.open) { lastChange = Date.now(); hideResume(); poll(); } });
  }

  function fitVV() {
    if (!R || !S.open) return;
    if (!mqPhone.matches && !PAGE) { P.style.height = ''; P.style.top = ''; return; }
    var v = window.visualViewport;
    if (v && v.scale > 1.01) return;   // 확대 중엔 손대지 않음(확대를 키패드로 알고 창을 줄였다 늘였다 = 렉 — 확대는 막았지만 접근성 강제 확대 대비)
    var atEnd = TH.scrollTop + TH.clientHeight >= TH.scrollHeight - 30;
    var kb = !!v && ((screen.height - v.height) / screen.height > 0.25 || (innerHeight - v.height) / innerHeight > 0.15);   // 키패드 = 보이는 높이가 화면의 3/4 아래(레이아웃이 같이 줄어도 잡힘). 비율 = 기기 크기 무관(유성 10-10 「반응형으로 고친 것 맞는지?」 — 옛 200px·60px 고정 숫자)
    R.classList.toggle('kb', kb);
    if (kb) { P.style.height = Math.round(v.height) + 'px'; P.style.top = Math.round(v.offsetTop) + 'px'; }   // 키보드 = 보이는 높이에 맞춤(§4.2-2)
    else { P.style.height = ''; P.style.top = ''; }   // 키보드 없음 = 화면 끝까지(제스처 막대 자리 포함 — 어두운 막이 화면 전체를 덮게, 아래 vpCover)
    if (atEnd) scrollEnd();
    var a = document.activeElement;   // 줄어든 뒤 지금 적는 칸이 보이게(스크롤 위치만 — 치수는 흐름이 정한다)
    if (a && a !== document.body && R.contains(a) && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
  }
  function scrollEnd() { TH.scrollTop = TH.scrollHeight; }
  // 동의 시트가 떠 있는 동안만 viewport-fit=cover(크롬 135+ 안드로이드 edge-to-edge) — 페이지가 화면 맨 아래 제스처 막대 자리까지 그려져
  // 시트의 어두운 막이 그 띠까지 덮는다(유성 10-10 「맨 하단 하얀선」). 시트 버튼은 env(safe-area-inset-bottom)로 막대 위에. 시트가 닫히면 원래대로.
  // 창 내내 켜 두던 것(10-10 12:40)을 좁힘 — 그 뒤 갤럭시에서 키패드 위 입력 줄이 잘리기 시작(13:23 캡처, 첫 시험 11:16엔 지적 없음). 시트엔 입력 칸이 없어 키패드와 안 겹친다
  var VP0 = null;
  function vpCover(on) {
    var m = document.querySelector('meta[name=viewport]'); if (!m || PAGE) return;
    if (on && VP0 === null) { VP0 = m.getAttribute('content') || ''; if (!/viewport-fit/.test(VP0)) m.setAttribute('content', VP0 + ', viewport-fit=cover'); }
    else if (!on && VP0 !== null) { m.setAttribute('content', VP0); VP0 = null; }
  }

  // ── 그리기 ──
  var lastDay = '', HOST = null;   // HOST = 지금 그리는 곳(평소 대화 칸, 이전 줄을 불러올 땐 따로 만든 상자)
  function dayIf(iso) { var k = dayKey(iso); if (k !== lastDay) { lastDay = k; var d = el('<div class="ti-day">' + dayLabel(iso) + '</div>'); d.dataset.k = k; HOST.appendChild(d); } }
  function sideOf(r) { return r && r.classList.contains('me') ? 'me' : r ? 'them' : ''; }
  function rowEl(side, text, at, anim) {
    var prev = HOST.lastElementChild, cont = prev && prev.classList.contains('ti-row') && sideOf(prev) === side;
    if (cont) prev.classList.remove('last');
    var r;
    if (side === 'me') {
      r = el('<div class="ti-row me last' + (cont ? ' cont' : '') + (anim ? ' ti-new' : '') + '"><div class="ti-meta"><span class="rd">읽음</span>' + ICO.clock + '<span class="tm"></span></div><div class="ti-bw"><div class="ti-bub"></div></div></div>');
      r.querySelector('.ti-bub').textContent = text;
    } else {
      r = el('<div class="ti-row them last' + (cont ? ' cont' : '') + (anim ? ' ti-new' : '') + '"><div>' + (cont ? '' : '<div class="ti-who">생각공작소</div>') + '<div class="ti-bub"></div></div><div class="ti-meta"><span class="tm"></span></div></div>');
      linkify(r.querySelector('.ti-bub'), text);
    }
    r.querySelector('.tm').textContent = at ? hm(at) : '';
    HOST.appendChild(r); return r;
  }
  function addMsg(m, anim) {   // 서버 줄 하나
    if (known[m.seq]) return;
    known[m.seq] = 1; S.lastSeq = Math.max(S.lastSeq, m.seq);
    if (m.who === 'v' && bindPending(m)) return;
    dayIf(m.at);
    var r = rowEl(m.who === 'v' ? 'me' : 'them', m.text, m.at, anim);
    r.dataset.seq = m.seq;
    if (m.who !== 'v') lastChange = Date.now();
  }
  function bindPending(m) {   // 보낸 응답보다 묻기가 먼저 온 경우 = 이미 그린 말풍선에 줄 번호만 붙인다
    var rows = TH.querySelectorAll('.ti-row.me:not([data-seq])');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].querySelector('.ti-bub').textContent === m.text) { sentOk(rows[i], m.seq, m.at); return true; }
    }
    return false;
  }
  function sentOk(r, seq, at) {
    r.dataset.seq = seq; known[seq] = 1; r.classList.remove('pend');
    r.querySelector('.tm').textContent = hm(at);
    var n = r.querySelector('.ti-note'); if (n) n.remove();
    markRead();
  }
  function markRead() {
    [].forEach.call(TH.querySelectorAll('.ti-row.me[data-seq]'), function (r) { r.classList.toggle('isread', +r.dataset.seq <= S.read); });
  }
  function sys(text, cls) { var n = el('<div class="ti-sys ti-new' + (cls ? ' ' + cls : '') + '"></div>'); n.textContent = text; TH.appendChild(n); return n; }

  // ── 인사, 번호 카드, 모드 ──
  var GREET = { chat: '안녕하세요, 생각공작소예요.\n궁금한 점을 편하게 남겨 주세요 ☺️', mail: '안녕하세요, 생각공작소예요.\n남겨 주시면 확인하는 대로\n문자 드릴게요 ☺️' };
  function skel() {   // 모드·대화를 아직 모를 때 = 훑는 뼈대(§5.4)
    TH.innerHTML = '<div class="ti-sk" style="width:62%"></div><div class="ti-sk" style="width:48%;align-self:flex-end"></div><div class="ti-sk" style="width:70%"></div>';
    lastDay = ''; R.classList.remove('mailnew');
  }
  function freshView() {
    TH.innerHTML = ''; lastDay = ''; known = {}; S.lastSeq = 0; S.read = 0; S.more = false; S.noteMode = '';
    dayIf(new Date().toISOString());
    var g = rowEl('them', GREET[S.mode === 'chat' ? 'chat' : 'mail'], '', false); g.classList.add('greet');
    S.saidMail = S.mode !== 'chat';   // 메일 인사가 이미 「문자 드릴게요」를 약속함 = 아래 문자 안내 줄 생략(채팅을 거치면 다시 띄움)
    R.classList.toggle('mailnew', S.mode !== 'chat');
    if (S.mode !== 'chat' && TA.value.trim() && !$('#tiTa2').value) { $('#tiTa2').value = TA.value; TA.value = ''; }   // 뼈대 동안 채팅 칸에 쓴 글은 메일 칸으로 옮겨 준다
    if (S.mode === 'chat' && !S.hasPhone && !S.phonePending) numCard();
    if (S.phonePending && S.mode === 'chat') phoneDone(S.phonePending);
  }
  function applyMode(m, noStore) {   // 머리 ON 표시 + 버튼 초록 점 + 3분 기억
    R.classList.toggle('chat', m === 'chat');
    if (!noStore) ss(K('tf_inq_mode'), JSON.stringify({ m: m, at: Date.now() }));
    if (window.tfInqSetLive) window.tfInqSetLive(m);
  }
  function setMode(m) {
    if (!m) return;
    var was = S.mode; S.mode = m; applyMode(m);
    if (m === 'chat') S.saidMail = false;
    if (!S.key && !S.sentFresh) {   // 아직 아무것도 안 보낸 새 문의 = 인사와 입력 칸을 모드에 맞게 다시
      if (was !== m) freshView();
      return;
    }
    R.classList.remove('mailnew');   // 대화가 있으면 입력은 늘 채팅 칸
    noteForMode();
  }
  function noteForMode() {   // 메일 모드로 대화를 이어 가면 한 줄로 알린다(5차에 없던 상태 — 사전 계획 §4 ⑧ ⑨)
    var want = S.mode === 'mail' ? (S.hasPhone ? 'mailphone' : 'mail') : '';
    if (want === S.noteMode) return;
    var old = TH.querySelector('.ti-sys.mode'); if (old) old.remove();
    var oldNc = TH.querySelector('.ti-nc.bymode:not(.done)'); if (oldNc && want !== 'mail') oldNc.remove();
    S.noteMode = want;
    if (want === 'mailphone') { if (!S.saidMail) sys('답은 문자로 보내 드릴게요', 'mode'); }   // 유성 10-10 대안 1. 메일로 처음 보낸 방은 인사와 겹쳐 안 띄움
    // 메일 모드 + 번호 없음 = 번호 카드(이미 떠 있으면 그대로, 이 창에서 한 번만)
    else if (want === 'mail') { sys('지금은 바로 답하기 어려워요', 'mode'); if (!TH.querySelector('.ti-nc') && !S.mailNc) { S.mailNc = true; numCard(true); } }
    scrollEnd();
  }
  function numCard(byMode) {
    var c = el('<div class="ti-nc ti-new' + (byMode ? ' bymode' : '') + '"><div class="t1">창을 닫아도 답을 받을 수 있어요</div><div class="t2">휴대폰 번호를 남기면 문자로도 보내 드려요.</div>'
      + '<div class="ti-line"><input class="ti-inp" inputmode="numeric" placeholder="010-0000-0000" autocomplete="off"><button class="ti-dbtn" type="button">남기기</button></div></div>');
    TH.appendChild(c);
    var ph = c.querySelector('.ti-inp'), ok = c.querySelector('.ti-dbtn');
    ph.addEventListener('focus', function () { ph.dataset.fix = ph.value.replace(/\D/g, '').length === 11 ? '1' : ''; });
    ph.addEventListener('input', function () { ph.value = fmtPh(ph.value); ph.classList.remove('err');
      var full = ph.value.replace(/\D/g, '').length === 11; ok.classList.toggle('ready', full); if (full && !ph.dataset.fix) ph.blur(); });
    ok.addEventListener('click', function () {
      if (!ok.classList.contains('ready')) { shk(ok); ph.classList.add('err'); shk(ph); ph.focus(); return; }
      savePhone(ph.value, c);
    });
    return c;
  }
  function phoneDone(num, card) {
    var d = el('<div class="ti-nc done ti-new">' + ICO.ok + '<span></span></div>');
    d.querySelector('span:last-child').textContent = num + '로도 답을 보내 드릴게요';
    if (card) card.replaceWith(d); else TH.appendChild(d);
  }
  function savePhone(num, card) {
    ev('inq_phone');
    if (!S.key) { S.phonePending = num; phoneDone(num, card); return; }   // 아직 방이 없으면 첫 줄과 같이 보낸다
    var ok = card.querySelector('.ti-dbtn'); ok.disabled = true;
    var go = function (n) {
      return once({ action: 'v_phone', key: S.key, phone: num }).then(function (r) {
        if (r && r.ok) { S.hasPhone = true; phoneDone(r.phone || num, card); noteForMode(); return; }
        ok.disabled = false; if (r && r.code === 'gone') return gone(); toast((r && r.error) || '잠시 후 다시 해 주세요');
      }, function (x) { if (transient(x) && n < 1) return go(n + 1); ok.disabled = false; toast('연결이 잠깐 끊겼어요\n다시 눌러 주세요'); });
    };
    go(0);   // 같은 번호를 다시 써도 결과가 같아서 한 번 더 보내도 안전
  }

  // ── 보내기(채팅 칸) — 한 번에 하나씩, 응답을 못 받으면 결과만 묻는다 ──
  function doSend() {
    var v = TA.value.trim(); if (!v) return;
    if (!S.key && !consentAt()) { openSheet(); return; }
    TA.value = ''; ss(K('tf_inq_draft'), ''); $('.ti-send').classList.add('off'); autosize(TA, 120);
    if (!S.key) { S.sentFresh = true; R.classList.remove('mailnew'); if (TH.querySelector('.ti-sk')) { TH.innerHTML = ''; lastDay = ''; } }
    hideResume(); dayIf(new Date().toISOString());   // 어제 대화에 오늘 보내면 「오늘」 줄부터(번호 카드는 5차처럼 인사 아래 제자리)
    var r = rowEl('me', v, '', true); r.classList.add('pend');
    scrollEnd(); lastChange = Date.now();
    queue.push({ text: v, row: r, cid: cid(), kind: 'chat' }); pump();
    ev('inq_send_chat');
  }
  function sendMail(text, phone) {   // 메일 모드 첫 문의(내용+번호) = 채팅과 똑같이 그 자리 말풍선, 입력은 바로 채팅 칸(유성 10-10 「별 다른 페이지로 이동되지 않게」)
    if (!consentAt()) { openSheet(); return; }
    S.sentFresh = true; S.phonePending = phone;
    var ta2 = $('#tiTa2'); ta2.value = ''; $('#tiPh2').value = ''; $('#tiMail').classList.add('gate'); autosize(ta2, 150);
    R.classList.remove('mailnew');
    hideResume(); dayIf(new Date().toISOString());
    var r = rowEl('me', text, '', true); r.classList.add('pend');
    scrollEnd(); lastChange = Date.now();
    queue.push({ text: text, row: r, cid: cid(), kind: 'chat' }); pump();
    ev('inq_send_mail');
    if (!coarse) setTimeout(function () { TA.focus(); }, 60);
  }
  function pump() {
    if (sending || !queue.length) return;
    if (!S.key && !consentAt()) { openSheet(); return; }   // 동의 없이는 첫 줄을 안 보낸다(동의하면 이어서)
    var job = sending = queue.shift(), done = false, t0 = Date.now(), blank = 0, timer = 0;
    var body = { action: 'v_send', text: job.text, cid: job.cid, src: PAGE ? 'c' : (location.pathname || '/') };
    if (S.key) body.key = S.key;
    else { body.consent = { ver: CONSENT_VER, at: consentAt() }; if (job.phone || S.phonePending) body.phone = job.phone || S.phonePending; }
    var hp = $('.ti-hpx'); if (hp && hp.value) body.hp = hp.value;
    var lim = DEMO ? { blank: 2, total: 20000 } : { blank: 12, total: 240000 };
    function finish(res, unknown) {
      if (done) return; done = true; clearInterval(timer); sending = null;
      if (unknown) {
        if (!S.key) ss(K('tf_inq_pcid'), job.cid + '|' + Date.now());   // 첫 줄이면 다음에 창을 열 때 이 번호로 방을 찾아 본다(10분)
        failed(job, '', true);
      }
      else if (res && res.ok) {
        ss(K('tf_inq_pcid'), null);
        if (res.key && !S.key) setKey(res.key);
        if (body.phone) { S.hasPhone = true; S.phonePending = ''; }
        if (res.mode) setMode(res.mode);
        if (job.row) sentOk(job.row, res.seq, res.at);   // lastSeq는 안 올린다 — 그 사이 온 행정 줄을 묻기가 놓치지 않게(묻기·불러오기만 올림)
      } else {
        if (res && res.code === 'gone') { gone(); return; }
        if (res && res.code === 'consent') ls(K('tf_inq_cs'), null);   // 동의 판이 바뀌었다 = 다시 받는다
        failed(job, (res && res.error) || '', false);
      }
      pump(); schedule(true);
    }
    once(body).then(function (r) { if (r && r.code === 'run') return; finish(r); }, function (x) { if (!transient(x)) finish({ ok: false }); });
    timer = setInterval(function () {
      once({ action: 'v_job', cid: job.cid }).then(function (r) {
        if (done || !r) return;
        if (r.state === 'done') return finish(r.result);
        blank = r.state === 'none' ? blank + 1 : 0;
        if (blank >= lim.blank || Date.now() - t0 > lim.total) finish(null, true);
      }, function () {});
    }, DEMO ? 1500 : 5000);
  }
  // 빨강 없이(§4.5 되돌릴 수 있는 실패). 두 갈래:
  //   unknown = 응답을 못 받음(서버가 받았는지 모름) → 「다시 보내기」는 **같은 작업 번호** = 이미 받았으면 그 결과만 온다(두 번 안 감)
  //   서버가 거절(busy·long·err 등) → 「다시 보내기」는 새 번호(거절 결과가 그 번호에 10분 남아 있어서)
  function failed(job, msg, unknown) {
    var r = job.row; if (!r) return;
    var old = r.querySelector('.ti-note'); if (old) old.remove();
    var n = el('<div class="ti-note"></div>'); n.appendChild(document.createTextNode(unknown ? '결과를 아직 못 받았어요' : '못 보냈어요'));
    var b = document.createElement('button'); b.type = 'button'; b.textContent = '다시 보내기'; n.appendChild(b);
    b.addEventListener('click', function () { n.remove(); queue.push({ text: job.text, row: r, cid: unknown ? job.cid : cid(), kind: 'chat' }); pump(); });
    if (!unknown && msg) toast(msg);
    r.querySelector('.ti-bw').appendChild(n);
  }
  function setKey(k) { S.key = k; S.loaded = k; ls(K('tf_inq_key'), k); }

  // ── 이어보기 · 묻기 ──
  function loadRoom() {
    TH.innerHTML = '<div class="ti-sk" style="width:62%"></div><div class="ti-sk" style="width:48%;align-self:flex-end"></div><div class="ti-sk" style="width:70%"></div>';
    R.classList.remove('mailnew');
    read({ action: 'v_load', key: S.key }).then(function (r) {
      if (!r || !r.ok) { if (r && r.code === 'gone') return gone(); return loadFail(); }
      TH.innerHTML = ''; lastDay = ''; known = {}; S.lastSeq = 0; S.noteMode = ''; S.saidMail = false;   // 이어보기엔 인사가 없음
      S.hasPhone = !!r.hasPhone; S.more = !!r.more; S.read = r.read || 0; S.loaded = S.key;
      (r.msgs || []).forEach(function (m) { addMsg(m, false); });
      markRead(); setMode(r.mode || S.mode || 'mail'); noteForMode(); scrollEnd();
      lastChange = Date.now(); schedule(true);
    }, loadFail);
  }
  function loadFail() {   // §4.5 일시 오류 = 빨강 없음 + 주액션 하나
    TH.innerHTML = '';
    var g = el('<div class="ti-gone"><b>대화를 아직 못 불러왔어요</b><p>인터넷이 느리면 조금 더 걸려요</p><button class="ti-btn" type="button"><span class="ti-bl">다시 불러오기</span></button></div>');
    ripple(g.querySelector('.ti-btn')); g.querySelector('.ti-btn').addEventListener('click', loadRoom); TH.appendChild(g);
  }
  function gone() {
    ls(K('tf_inq_key'), null); S.key = ''; S.loaded = ''; S.sentFresh = false; queue = []; clearTimeout(pollT);
    TH.innerHTML = ''; R.classList.remove('mailnew');
    var g = el('<div class="ti-gone"><b>대화를 찾을 수 없어요</b><p>마지막 대화 뒤 1년이 지나면 지워져요</p><button class="ti-btn" type="button"><span class="ti-bl">' + (PAGE ? '홈페이지로 가기' : '새로 문의하기') + '</span></button></div>');
    ripple(g.querySelector('.ti-btn'));
    g.querySelector('.ti-btn').addEventListener('click', function () { if (PAGE) { location.href = '/'; return; } fresh(); });
    TH.appendChild(g);
  }
  function loadMore() {   // 위로 올리면 이전 50줄 — 따로 그린 뒤 맨 앞에 붙이고, 이음매(같은 날 줄·같은 쪽 묶음)만 고친다
    var first = TH.querySelector('.ti-row[data-seq]'); if (!first) return;
    S.loadingMore = true;
    read({ action: 'v_load', key: S.key, before: +first.dataset.seq }).then(function (r) {
      S.loadingMore = false; if (!r || !r.ok) return;
      S.more = !!r.more;
      var head = TH.firstElementChild, saveDay = lastDay, box = document.createElement('div');
      HOST = box; lastDay = '';
      (r.msgs || []).forEach(function (m) { if (known[m.seq]) return; known[m.seq] = 1; dayIf(m.at); rowEl(m.who === 'v' ? 'me' : 'them', m.text, m.at, false).dataset.seq = m.seq; });
      HOST = TH; var olderDay = lastDay; lastDay = saveDay;
      if (!box.firstChild) return;
      var h0 = TH.scrollHeight, top0 = TH.scrollTop, tail = box.lastElementChild;
      if (head && head.classList.contains('ti-day') && olderDay === dayKeyOfLabel(head)) { var nx = head.nextElementSibling; head.remove(); head = nx; }
      if (head && tail && head.classList.contains('ti-row') && tail.classList.contains('ti-row') && sideOf(head) === sideOf(tail)) {
        tail.classList.remove('last'); head.classList.add('cont'); var w = head.querySelector('.ti-who'); if (w) w.remove();
      }
      while (box.firstChild) TH.insertBefore(box.firstChild, head || null);
      markRead(); TH.scrollTop = top0 + (TH.scrollHeight - h0);
    }, function () { S.loadingMore = false; });
  }
  function dayKeyOfLabel(n) { return n.dataset.k || ''; }
  function schedule(now) {
    clearTimeout(pollT);
    if (!S.open || !S.key || document.hidden) return;
    var idle = Date.now() - lastChange;
    if (idle > STOP_AFTER) { showResume(); return; }
    pollT = setTimeout(poll, now ? 0 : idle > SLOW_AFTER ? T_SLOW : T_LIVE);
  }
  function poll() {
    if (polling || !S.open || !S.key || document.hidden) return;
    polling = true;
    once({ action: 'v_poll', key: S.key, after: S.lastSeq }).then(function (r) {
      if (!r) return;
      if (r.code === 'gone') { gone(); return; }
      if (!r.ok) return;
      if (r.mode && r.mode !== S.mode) setMode(r.mode);
      var atEnd = TH.scrollTop + TH.clientHeight >= TH.scrollHeight - 40;
      if (r.msgs && r.msgs.length) { r.msgs.forEach(function (m) { addMsg(m, true); }); if (atEnd) scrollEnd(); }
      if (typeof r.read === 'number' && r.read !== S.read) { S.read = r.read; markRead(); }
    }, function () {}).then(function () { polling = false; schedule(); });
  }
  var resumeEl = null;
  function showResume() {
    if (resumeEl) return;
    resumeEl = el('<button type="button" class="ti-resume ti-new">새 답장 보기</button>');
    resumeEl.addEventListener('click', function () { lastChange = Date.now(); hideResume(); poll(); });
    TH.appendChild(resumeEl); scrollEnd();
  }
  function hideResume() { if (resumeEl) { resumeEl.remove(); resumeEl = null; } }

  // ── 창 열기·닫기 ──
  function openSheet() { if (mqPhone.matches && !PAGE) vpCover(true); var d = $('.ti-dim'), s = $('.ti-sheet'); d.classList.add('on'); s.classList.remove('on'); void s.offsetWidth; s.classList.add('on'); }
  function closeSheet() { vpCover(false); $('.ti-dim').classList.remove('on'); $('.ti-sheet').classList.remove('on'); }
  function fresh() {
    S.key = ''; S.sentFresh = false; S.hasPhone = false;
    var c = null; try { c = JSON.parse(ss(K('tf_inq_mode')) || 'null'); } catch (e) {}
    if (c && Date.now() - c.at < 180000) { S.mode = c.m; applyMode(c.m, true); freshView(); }
    else {   // 모드를 모르면 뼈대 → 답이 오면 그 모드로 한 번만 그린다(메일 칸이 떴다가 채팅 칸으로 바뀌는 깜빡임 없게). 못 받으면 메일(안전한 쪽)
      S.mode = ''; skel();
      read({ action: 'v_mode' }).then(function (r) { return r && r.mode; }, function () { return ''; }).then(function (m) {
        if (S.key || S.sentFresh || S.mode) return;
        S.mode = m || 'mail'; applyMode(S.mode, !m); freshView();
      });
    }
    if (!consentAt()) setTimeout(openSheet, PAGE ? 0 : 420);
  }
  function recover() {   // 첫 줄을 보냈는데 결과를 못 받고 창을 닫았다 = 그 작업 번호로 방 열쇠를 찾아 본다(서버가 10분 기억)
    var pc = (ss(K('tf_inq_pcid')) || '').split('|');
    if (!pc[0] || !(Date.now() - +pc[1] < 600000)) { ss(K('tf_inq_pcid'), null); return; }
    read({ action: 'v_job', cid: pc[0] }).then(function (r) {
      if (!r || r.state === 'run') return;
      ss(K('tf_inq_pcid'), null);
      var x = r.result; if (r.state !== 'done' || !x || !x.ok || !x.key || S.key) return;
      setKey(x.key); S.loaded = ''; S.sentFresh = true; loadRoom();
    }, function () {});
  }
  function open(opts) {
    opts = opts || {};
    GAS = opts.gas || GAS; DEMO = !!opts.demo; PAGE = !!opts.page;
    if (!R) { build(); if (DEMO) demoPanel(); }
    if (S.open) return;
    originToBtn();
    S.open = true; R.classList.add('on'); R.classList.toggle('page', PAGE);
    document.documentElement.classList.add('tfinq-open'); if (PAGE) document.documentElement.classList.add('tfinq-page');
    if (!PAGE) { try { history.pushState({ tfinq: 1 }, ''); } catch (e) {} }
    ev('inq_open');
    if (opts.key && opts.key !== ls(K('tf_inq_key'))) { ls(K('tf_inq_key'), opts.key); S.loaded = ''; }   // 문자 링크 열쇠가 이 기기 열쇠보다 우선
    S.key = opts.key || ls(K('tf_inq_key')) || S.key || '';   // 저장이 막힌 브라우저(사생활 보호)는 이 창 안에서만 기억
    if (S.key && S.loaded === S.key) { lastChange = Date.now(); schedule(true); }
    else if (S.key) loadRoom();
    else if (!S.sentFresh) { fresh(); recover(); }
    requestAnimationFrame(fitVV);
    autosize(TA, 120); $('.ti-send').classList.toggle('off', !TA.value.trim());
    if (!coarse && consentAt()) setTimeout(function () { if (S.open) (R.classList.contains('mailnew') ? $('#tiTa2') : TA).focus({ preventScroll: true }); }, 380);   // PC = 바로 칠 수 있게(폰은 키보드가 화면을 덮으니 안 함)
  }
  function requestClose() { if (!PAGE && history.state && history.state.tfinq) history.back(); else doClose(); }
  function doClose() {
    if (!S.open) return;
    S.open = false; clearTimeout(pollT); hideResume();
    R.classList.remove('on'); closeSheet();
    document.documentElement.classList.remove('tfinq-open'); vpCover(false);
    P.style.height = ''; P.style.top = ''; R.classList.remove('kb'); originToBtn();
    if (document.activeElement && R.contains(document.activeElement)) document.activeElement.blur();
  }
  function originToBtn() {   // 폰 = 창이 「문의하기」(왼쪽 아래)에서 나오고 그리로 들어감(유성 10-10 「좌하단으로 내려가야해」). PC·문자 링크 페이지는 CSS 값
    if (!P) return;
    var b = document.getElementById('tfInqBtn'), r = b && mqPhone.matches && !PAGE ? b.getBoundingClientRect() : null;
    P.style.transformOrigin = r && r.width ? Math.round(r.left + r.width / 2) + 'px ' + Math.round(r.top + r.height / 2) + 'px' : '';
  }

  // ── 연습 화면(?inq=demo — 서버 없이, 수집 0) ──
  // 서버 규칙을 그대로 흉내: 작업 번호(cid)를 처음 보면 run → 끝나면 결과, 같은 번호가 또 오면 실행 안 하고 run/결과만
  var F = { mode: 'chat', rooms: {}, slow: false, lost: false, fail: false, jobs: {} };
  function fake(b) {
    var wait = function (ms, v) { return new Promise(function (ok) { setTimeout(function () { ok(v); }, ms); }); };
    var broken = function (ms) { return new Promise(function (ok, no) { setTimeout(function () { no(new Error('BAD_REPLY')); }, ms); }); };
    var now = new Date().toISOString(), room = F.rooms[b.key];
    if (b.action === 'v_mode') return wait(500, { ok: true, mode: F.mode });
    if (b.action === 'v_job') { var j = F.jobs[b.cid]; return wait(300, !j ? { ok: true, state: 'none' } : j === 'run' ? { ok: true, state: 'run' } : { ok: true, state: 'done', result: j }); }
    if (b.action === 'v_send') {
      if (F.lost) { F.lost = false; return broken(1500); }   // 요청이 서버에 안 닿음 = 기록 없음 → 화면은 「결과를 아직 못 받았어요」
      if (b.cid && F.jobs[b.cid]) return wait(300, F.jobs[b.cid] === 'run' ? { ok: false, code: 'run' } : F.jobs[b.cid]);
      if (b.cid) F.jobs[b.cid] = 'run';
      var res;
      if (F.fail) { F.fail = false; res = { ok: false, code: 'busy', error: '지금 문의가 많아요. 잠시 후 다시 보내 주세요' }; }
      else if (b.key && !room) res = { ok: false, code: 'gone', error: '대화를 찾을 수 없어요' };
      else {
        if (!room) { var k = 'demo' + Math.random().toString(36).slice(2, 10); room = F.rooms[k] = { key: k, msgs: [], read: 0, phone: b.phone || '' }; }
        var m = { seq: room.msgs.length + 1, at: now, who: 'v', text: b.text }; room.msgs.push(m);
        res = { ok: true, key: room.key, seq: m.seq, at: now, mode: F.mode };
      }
      if (F.slow) { F.slow = false; setTimeout(function () { F.jobs[b.cid] = res; }, 4000); return broken(1500); }   // 서버는 받았는데 응답을 놓침 → 결과 묻기로 늦게 성공
      F.jobs[b.cid] = res; return wait(700, res);
    }
    if (!room) return wait(300, { ok: false, code: 'gone' });
    if (b.action === 'v_phone') { room.phone = b.phone; return wait(500, { ok: true, phone: fmtPh(b.phone) }); }
    if (b.action === 'v_load') return wait(900, { ok: true, msgs: room.msgs.slice(-50), read: room.read, hasPhone: !!room.phone, more: false, mode: F.mode });
    if (b.action === 'v_poll') { var news = room.msgs.filter(function (x) { return x.seq > (b.after || 0); }); return wait(250, news.length ? { ok: true, msgs: news, read: room.read, mode: F.mode } : { ok: true, same: true, read: room.read, mode: F.mode }); }
    return wait(200, { ok: false });
  }
  function demoRoom() { var k = ls(K('tf_inq_key')) || S.key; return k && F.rooms[k]; }
  function demoPanel() {
    var d = el('<div class="ti-demo"><b>연습 화면(서버 없음, 수집 0) 접기</b></div>');
    d.firstChild.addEventListener('click', function () { d.classList.toggle('min'); d.firstChild.textContent = d.classList.contains('min') ? '연습 펴기' : '연습 화면(서버 없음, 수집 0) 접기'; });
    var add = function (label, fn) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', function () { fn(b); }); d.appendChild(b); return b; };
    var mc = add('채팅 모드', function () { F.mode = 'chat'; mc.classList.add('on'); mm.classList.remove('on'); }), mm = add('메일 모드(퇴근)', function () { F.mode = 'mail'; mm.classList.add('on'); mc.classList.remove('on'); });
    mc.classList.add('on');
    add('처음부터', function () {
      ls(K('tf_inq_key'), null); ls(K('tf_inq_cs'), null); ss(K('tf_inq_mode'), null); ss(K('tf_inq_pcid'), null);
      queue = []; S.phonePending = ''; S.mailNc = false; S.loaded = ''; S.hasPhone = false; clearTimeout(pollT); hideResume();
      $('#tiTa2').value = ''; $('#tiPh2').value = ''; $('#tiMail').classList.add('gate'); fresh();
    });
    add('답장 오기', function () { var r = demoRoom(); if (!r) return; r.read = r.msgs.length; r.msgs.push({ seq: r.msgs.length + 1, at: new Date().toISOString(), who: 's', text: r.msgs.length < 3 ? '안녕하세요, 확인했어요.\n신청은 여기서 해 주세요 think-factory.kr/contact' : '네, 확인하고 다시 알려 드릴게요.' }); });
    add('읽음', function () { var r = demoRoom(); if (r) r.read = r.msgs.length; });
    add('다음 보내기 = 응답 놓침(늦게 성공)', function () { F.slow = true; });
    add('다음 보내기 = 안 닿음', function () { F.lost = true; });
    add('다음 보내기 = 거절', function () { F.fail = true; });
    add('대화 지워짐', function () { var k = ls(K('tf_inq_key')) || S.key; if (k) delete F.rooms[k]; });
    add('창 닫고 다시 열기', function () { requestClose(); setTimeout(function () { open({ gas: GAS, demo: true }); }, 500); });
    R.appendChild(d);
  }

  window.tfInqPane = { open: open, close: requestClose, _t: { linkify: linkify, fmtPh: fmtPh, hm: hm, dayLabel: dayLabel, URL_RE: URL_RE } };
})();
