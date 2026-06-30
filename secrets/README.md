# Secret Sharing

Do not share `.env` files in chat or commit real secrets.

For production secrets, use SOPS with age and commit only encrypted files:

```bash
cd secrets
sops --encrypt runtime.secrets.yaml > runtime.secrets.enc.yaml
```

Decrypt only on a trusted local machine:

```bash
sops --decrypt secrets/runtime.secrets.enc.yaml \
  | kubectl --context kind-management apply -f -
```

Local development does not require provider credentials. User login uses internal
email/password with Redis-backed session cookies. External provider credentials
should be introduced later as integration `credential_ref` records, not as login
tokens or event payload fields.
