// 카톡 인앱 브라우저 = 상단 주소바+하단 네비바가 화면(제출 버튼 등)을 잠식 →
// 진입 즉시 기본 브라우저로 자동 전환 (docs/1 §3.7, 유성 2026-07-04 ex49).
// 검증=실기기 카톡 전용(헤드리스·PC 재현 불가). 스킴이 실패해도 페이지는 그대로 동작(무해).
(function () {
  if (/KAKAOTALK/i.test(navigator.userAgent)) {
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
  }
})();
