# 최신 기준 재기준화 기록

## 확정된 사실

- 제품에서 격리한 원본 스냅샷은 `cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc`의
  원격 Git archive와 1,664개 파일, 각 파일의 SHA-256, 크기까지 일치한다.
- 기존 `reference-feature-inventory.md`의 관찰 근거는
  `3ff2b1095151c690bf536e8e6ca685c2703fcd70`이다. 이는 최신 고정 revision과
  동일하지 않다.
- 두 revision의 tree 차이는 523개 파일이며, 화면·settings·timeline·workload·
  connection·event source·navigation과 공용 style을 포함한다. 따라서 기존 240개
  feature 행은 최신 원본의 완전한 동등성 증거로 판정할 수 없다.

## 상태 규칙

원본 파일 ledger의 동결 상태와 기능 ledger의 이식 상태는 별개다. 전자는 검증됐지만,
후자는 아래 재기준화가 끝날 때까지 **latest-source verified가 아니다**. 이 사실을
deliveryStatus를 임의로 `implemented`로 바꾸거나, inventory frontmatter의 revision만
바꿔 숨기지 않는다.

## 재기준화 작업 단위

1. 두 tree를 path·symbol·API route·UI event·asset·motion token별로 비교해 delta
   ledger를 만든다. 삭제/이동/신규 파일도 각각 명시한다.
2. 기존 240개 행에는 최신 원본 path, SHA-256, symbol, interaction을 행별 source
   proof로 추가한다. 의미가 바뀐 행은 새 contract ID로 분리하고 기존 ID의 근거를
   바꾸지 않는다.
3. 최신 tree에만 있는 화면, endpoint, keyboard binding, descriptor, animation,
   desktop bridge는 누락 없이 새 행을 추가한다. 행 수가 늘어나는 것은 정상이며,
   기존 240이라는 숫자를 목표로 유지하지 않는다.
4. 각 행을 Python contract, React consumer, desktop bridge, realtime 정책, 자동
   검증 locator에 연결한다. source proof와 제품 proof가 모두 있어야만 해당 행을
   `implemented`로 바꾼다.
5. 이후 `reference-feature-ledger --check --require-complete`와 원본 hash 검증,
   contract/E2E/visual/stream 검증을 함께 통과시켜야 기준 동등성 단계를 종료한다.

## 감독관 차단 조건

이 재기준화가 끝나기 전에는 최신 원본 전체를 이식했다거나 기능/UI event가 100%
동일하다고 보고하지 않는다. 다만 이미 확인된 수직 경계(권한, command, event, shell)는
계속 계약과 품질 기준에 맞게 보완할 수 있다. 제품 고유 widget, replay, RCA, AI 확장은
최신 기준 행이 출하 가능해진 뒤에만 시작한다.
