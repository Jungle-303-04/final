# 프론트엔드 스모크 테스트

`VITE_API_MODE=mock` 빌드본에 대한 Playwright 화면 접속 스모크.
17개 시나리오(로그인·히트맵 드릴다운·클러스터 탭·승인·워크플로우 그래프·
AI 채팅 왕복·액션 선택·메트릭 비동기 쿼리·조직 생성·멤버 승인·클러스터 등록 위저드·로그아웃)
+ 콘솔 pageerror 0건을 검증한다.

```bash
npm run build && npm run preview &   # 4173
python3 tests/smoke.py               # playwright 필요
```
