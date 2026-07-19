# Deploy surface · demo-freeze-v3 parity evidence

Reference: `demo-freeze-v3`, `devpreview-unified.html?polish=1`, 1440 px.
Candidate: local product `/deploy`, working tree based on `5252a85ec`.

## Side-by-side captures

- GitOps: `deploy-gitops-demo-v3-vs-product-1440.png`
- Workflows: `deploy-workflows-demo-v3-vs-product-1440.png`
- Helm releases: `deploy-helm-demo-v3-vs-product-1440.png`

## Numeric cross-check

The reference uses its frozen sample inventory; the product renders only observed API data. Equality below means every product element that describes the same quantity agrees with the other product elements, not that live inventory must equal the demo fixture.

| Surface | Demo fixture | Product observation | Internal cross-check |
|---|---:|---:|---|
| Deploy applications | 9 | 2 | summary chip = application inventory IDs = 2 |
| Synced applications | 4 | 0 | no application has a complete observed `Synced` target set; row is `unknown`, so the chip does not overstate it |
| OutOfSync applications | 5 | 0 | no observed out-of-sync/failed target; row and chip agree |
| Git repositories | 2 | 1 | repository chip = grouped repository rows = 1 |
| Applications in the repository row | 9 across 2 rows | 2 in 1 row | row count = the two application IDs bound to the observed sync target |
| Workflow plans | 1 | 1 | one API-backed plan card, one repository identity |
| Helm releases | 3 | 0 observed | fail-closed empty/partial state; no demo fixture values are presented as live data |

## Click-path and failure-state check

- GitOps repository details expand inline and show application, scope, full revision, status, and observation time.
- `저장소 연결` opens the single real connection dialog. Its probe → branches → manifests → validation → connection → reflected-list stages are wired to the GitOps port.
- A workflow card opens the real editor. Source, pre-flight, application, and verification nodes open their settings; add/remove/save and target registration are real controller actions.
- Helm release rows now keep detail identity under `/deploy?section=helm&helm.release.*`; the legacy `/helm/detail/*` redirect no longer swallows the click. `릴리스 목록으로` clears only the detail identity and returns to `/deploy?section=helm`.
- GitOps, workflows, and Helm produced no page exceptions or console errors on ordinary load and interaction.
- Widths 1280, 1440, and 1920: `documentElement.scrollWidth === innerWidth` for all three tabs; initial `scrollY === 0`.

## Zombie removal evidence

The former second GitOps/workflow UI stack and redirect-only detail pages were removed. Runtime imports and migration-ledger destinations are zero for the deleted paths listed below; this evidence inventory is the only intentional textual mention:

`PlanEditor`, `PlanStepEditor`, `PlanWizard*`, `WorkflowOverview`, `WorkflowPlanPicker`, `WorkflowGraph`, `WorkflowNodeCard`, `WorkflowViewSettings`, `useWorkflowLayout`, `workflowGraphModel`, `workflowGraphTypes`, `GitOpsSyncTargetsTable`, `GitOpsSyncTargetDetails`, `GitOpsApplicationDetailPage`, `GitOpsResourceDetailPage`, and `gitOpsDetailPresentation`.

API detail schemas/adapters remain because the compact repository workspace consumes them. Application evidence, resource inventory and insights, selective actions, and RCA are now owned by `GitOpsApplicationWorkspace`, `GitOpsResourceWorkspace`, and `GitOpsResourceActionDialog`; the obsolete feature-only route helper pairs were removed.
