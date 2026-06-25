# Secret Sharing

Do not share `.env` files in chat or commit real secrets.

For real OAuth providers, use SOPS with age and commit only encrypted files:

```bash
cd secrets
sops --encrypt oauth.secrets.yaml > oauth.secrets.enc.yaml
```

Decrypt only on a trusted local machine:

```bash
sops --decrypt secrets/oauth.secrets.enc.yaml \
  | kubectl --context kind-management apply -f -
```

Local development does not require real OAuth secrets. It uses a fake OAuth token exchange adapter by default so the full cycle remains runnable for every teammate.
