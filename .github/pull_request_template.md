## Summary

- 

## Owner Lane

- [ ] Platform/Integration
- [ ] Gateway/Auth
- [ ] Workflow/RCA
- [ ] Target/Telemetry
- [ ] Dashboard/Docs

## Change Type

- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] docs
- [ ] test
- [ ] ci
- [ ] chore

## Test Evidence

- [ ] `make check`
- [ ] `uv run pytest -q`
- [ ] `python -m compileall -q services packages`
- [ ] `make smoke` if runtime/deploy/event flow changed
- [ ] WIKI `make check` if WIKI changed

## Contract Checklist

- [ ] New/changed event subjects are in `EventSubject` and `docs/events.md`
- [ ] New/changed API fields are in Pydantic schemas
- [ ] Worker code uses `EventClient` and `EventHandlerSpec`
- [ ] Target write remains limited to `sandbox`
- [ ] No secrets, tokens, kubeconfig, or `.env` values included
- [ ] WIKI/docs updated when architecture, API, workflow, or schedule changed

## Risk / Rollback

- Risk:
- Rollback:

