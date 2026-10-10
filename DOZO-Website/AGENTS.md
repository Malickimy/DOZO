# DOZO Website project guide

Read the root [`AGENTS.md`](../AGENTS.md) and
[`delivery-workflow.md`](../.opencode/docs/delivery-workflow.md) before editing.

## Ownership

This project owns the public DOZO marketing site under `DOZO-Website/`. It is a separate
build/deployment artifact from the React dashboard and shared backend. There is no Website
HTTP contract yet. If a proposed change adds a shared interface, stop and route the
contract decision through root planning before implementing consumers.

## Product priorities

- Keep the site clear, responsive, and consistent with the approved DOZO theme.
- Support Polish and English across pages, navigation, and user-facing errors.
- Explain the service and link into the protected merchant/operator portals.
- Keep authenticated product behavior in the dashboard/backend. Subscription and payment
  packaging are out of scope until approved in an issue.
- Preserve a separate build and deployment path.

The implementation stack and deploy provider remain undecided. The first Website
implementation task must settle them in its issue before adding application code.
