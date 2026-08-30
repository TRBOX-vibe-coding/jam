# 홀릭잼 2.0 — 시연 주소 (임시 배포)

| 대상 | 주소 |
|---|---|
| 📱 유저 앱 (폰/PC 브라우저) | https://jam-5dw.pages.dev |
| 🖥 관리자 웹 | https://holicgem-admin.vercel.app |
| ⚙️ API 서버 | https://passengers-pearl-kenny-unsubscribe.trycloudflare.com |

## 계정 (프로덕션에서도 임시계정 사용 가능 — 데모 기간 한정)
- 관리자: admin@holicgem.com / admin1234
- 앱 손님: MY 탭 → "카카오로 시작" 등 아무 소셜 버튼 → 즉시 임시계정 로그인 (앱키 불필요)
- 앱 점주: MY 로그인 화면 하단 "[시연용] 승인된 점주 화면 체험 (서프홀릭)" → 가맹점 모드까지 체험
- API 직접 테스트: `POST /auth/social` body `{"provider":"KAKAO","providerId":"아무값"}` → 토큰 발급 (인증키 불필요)

## 주의
- 앱·API 주소는 **개발 컴퓨터가 켜져 있어야** 동작한다(터널 방식). 관리자 웹 화면 자체는 항상 뜨지만 데이터는 API가 살아있어야 나온다.
- 컴퓨터를 재부팅하면 터널 주소가 바뀐다 → 시연 전 "시연 주소 확인해줘" 한마디로 재발급/재검증.
- 완전 클라우드(컴퓨터 무관)로 올리려면 Vercel↔GitHub 연동 승인 1회 + 클라우드 DB가 필요.
