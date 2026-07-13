# Cloudflare dev Tunnel 및 mTLS 자동화

`.github/workflows/cloudflare-dev-mtls.yml`은 기존 원격 관리 cloudflared Tunnel에
`dev-k8s.woonyong.org` ingress를 보존 추가하고 다음 리소스를 멱등 구성한다.

- Tunnel ingress: 기본 origin은 `http://console-dev.management.svc.cluster.local:80`
- DNS: proxied CNAME `dev-k8s.woonyong.org -> <tunnel-id>.cfargotunnel.com`
- Client Certificates: Cloudflare-managed CA와 hostname association
- WAF: 해당 hostname에서 `cf.tls_client_auth.cert_verified`가 false인 요청 차단
- 인증서 발급: 외부에서 만든 CSR 다섯 개를 서명하고 공개 인증서만 artifact로 반환

## GitHub Environment

Environment는 권한 상승 선택을 막기 위해 `development`로 고정되어 있다. 아래 secret 네 개를
등록한다.

| Secret | 값 | 최소 Cloudflare API token 권한 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 제한된 API token 원문 | 아래 권한 전체 |
| `CLOUDFLARE_ACCOUNT_ID` | Tunnel 소유 account ID | Cloudflare Tunnel Read/Write |
| `CLOUDFLARE_ZONE_ID` | 선택값. 비우면 account와 zone 이름으로 조회 | Zone Read, DNS Read/Write, SSL and Certificates Read/Write, WAF Read/Write |
| `CLOUDFLARE_TUNNEL_ID` | 기존 원격 관리 Tunnel UUID | Cloudflare Tunnel Read/Write |

토큰은 `woonyong.org` zone과 해당 account에만 scope를 제한한다. 스크립트는 먼저
`/accounts/{account_id}/tokens/verify`, zone, Tunnel, Tunnel configuration, DNS, hostname association,
Rulesets, client certificate 읽기를 수행한다. Cloudflare는 token verify 응답에 permission
목록을 반환하지 않으므로 dry-run은 읽기 scope와 리소스 일치를 검증하고, 실제 write
capability는 apply 중 각 제한된 endpoint가 fail-closed 방식으로 검증한다.

Tunnel은 `config_src=cloudflare`인 원격 관리 Tunnel이어야 한다. 로컬 YAML 관리 Tunnel은
전체 configuration을 API로 교체하지 않도록 preflight에서 거부한다.

## CSR 입력

`csr_batch_b64`는 다음 JSON 배열을 UTF-8 base64 한 단일 행 문자열이다. 정확히 다섯 개이며
각 `name`은 artifact PEM 파일명이 된다.

```json
[
  {"name": "operator-01", "csr": "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----"},
  {"name": "operator-02", "csr": "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----"},
  {"name": "operator-03", "csr": "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----"},
  {"name": "operator-04", "csr": "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----"},
  {"name": "operator-05", "csr": "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----"}
]
```

CSR와 키 쌍은 workflow 밖의 승인된 보안 장치에서 만든다. 이 저장소와 GitHub Actions는
private key를 생성, 수신, 업로드하거나 보관하지 않는다. 입력 객체에 `name`, `csr` 이외의
필드가 있거나 PEM에 private-key marker가 있으면 실행을 중단한다.

macOS에서 공개 CSR JSON만 인코딩하는 예:

```bash
base64 < csr-batch.json | tr -d '\n'
```

## 실행과 결과

1. Actions에서 **Cloudflare Dev Tunnel and mTLS**를 선택한다.
2. base64 CSR 입력을 넣고 `dry_run=true`로 실행해 계획을 검토한다.
3. 같은 입력으로 `dry_run=false`를 실행한다.

동시 실행은 workflow concurrency로 직렬화된다. Tunnel의 기존 rule과 catch-all은 유지하며
새 hostname rule은 catch-all 바로 앞에 넣는다. DNS, hostname association, WAF rule은 기존
상태와 비교해 필요한 변경만 수행한다. mTLS block rule은 기존 skip rule보다 먼저 평가되도록
custom ruleset의 첫 번째 위치를 유지한다. 동일 CSR와 validity로 재실행하면 활성 인증서를
재사용하므로 중복 발급하지 않는다.

apply 성공 시 artifact에는 `operator-*.pem` 다섯 개와 공개 인증서 메타데이터만 담은
`manifest.json`만 포함된다. CSR, API 원문 응답, token, private key는 포함하지 않는다.
artifact 보존 기간은 7일이다. dry-run에서는 artifact를 만들거나 업로드하지 않는다.

## Chrome 설치 파일

서명된 PEM을 받은 장치에서 CSR과 짝인 개인키로 암호화된 PKCS#12 파일을 만든다.

```bash
openssl pkcs12 -export \
  -inkey dev-console-01.key \
  -in dev-console-01.pem \
  -out dev-console-01.p12 \
  -name dev-console-01
```

각 인증서는 서로 다른 암호를 사용한다. `.key`, `.password`, `.p12`는 Git과 GitHub artifact에
올리지 않는다. macOS는 `.p12`를 더블클릭해 Keychain에 설치하고 Chrome을 재시작한다.
Windows는 `.p12`를 더블클릭해 **현재 사용자 → 개인용** 인증서 저장소에 가져온 뒤 Chrome을
재시작한다. 두 운영체제 모두 `https://dev-k8s.woonyong.org` 최초 접속에서 사용할 인증서를
선택하면 로그인 세션 없이 콘솔이 열린다. 인증서를 분실한 사용자는 해당 Cloudflare client
certificate만 revoke하고 새 키/CSR로 다시 발급한다.

Bruno 3.5.1 CLI/앱은 일부 PKCS#12 암호화 형식을 읽지 못할 수 있으므로 Client Certificates에는
같은 인증서의 `.pem`과 `.key`를 Certificate 형식으로 등록한다. Domain은
`dev-k8s.woonyong.org`로 고정하며 개인키와 인증서는 팀원별로 섞어 쓰지 않는다.

`dev.k8s.woonyong.org`처럼 두 단계인 하위 도메인은 Cloudflare Universal SSL의
`*.woonyong.org` 범위 밖이다. 별도 유료 edge 인증서에 의존하지 않도록 개발 콘솔의 canonical
hostname은 `dev-k8s.woonyong.org`로 고정한다.

## 공식 API 근거

- [Cloudflare Tunnel configuration](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/subresources/configurations/methods/update/)
- [DNS record create](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)
- [Client certificate create](https://developers.cloudflare.com/api/resources/client_certificates/methods/create/)
- [mTLS hostname associations](https://developers.cloudflare.com/api/resources/certificate_authorities/subresources/hostname_associations/)
- [WAF custom rules API](https://developers.cloudflare.com/waf/custom-rules/create-api/)
- [Enable mTLS](https://developers.cloudflare.com/ssl/client-certificates/enable-mtls/)
