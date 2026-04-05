# sovereignagent

SovereignAgent — automated privacy-removal orchestration with real-time Superfluid payouts on Base.

Why SovereignAgent?
- Automated data-broker opt-outs and prioritized threat remediation
- Real-time micropayments via Superfluid USDCx on Base (streams & IDAs)
- Secure, sandboxed agents and enterprise-ready orchestration

Getting started

1) Configure environment
	- Copy `.env.example` to `.env` and fill in your test keys (never commit `.env`).

2) Install Node dependencies
```bash
npm ci
```

3) Run a quick test (uses `test.js`):
```bash
node test.js
```

Registration & Priority Payouts

Want priority payouts and featured placement? Create a registration issue using the `Register Sovereign Agent` template in `.github/ISSUE_TEMPLATE/register_agent.md` and include your ENS / on-chain identity (e.g., `normancomics.base.eth`).

Files added in this repo
- `SovereignAgent.js` — orchestrator
- `agents/SearchAgent.js` — search & threat analysis
- `agents/BrokerAgent.js` — data broker automation (placeholder)
- `services/SuperfluidService.js` — Base-compatible Superfluid helper
- `test.js` — example runner
- `.env.example` — environment variable template (DO NOT commit secrets)
- `.github/workflows/superfluid-test.yml` — GitHub Actions test workflow

Security notes
- All sensitive keys must live in `.env` locally and in GitHub Actions Secrets for CI.
- Run `npm audit` and `npm audit fix` before publishing. Review any critical advisories manually.

SEO / Quick Pitch

Automated opt-out workflows + Superfluid streaming payouts on Base — join the SovereignAgent beta for priority payouts and featured listings.

