# OpenMythos Integration — Examples & Workflows

PhantomOperator integrates **[OpenMythos](https://github.com/kyegomez/OpenMythos)**
(by [@kyegomez](https://github.com/kyegomez)) as a runtime AI provider for
response generation and multi-agent orchestration.

---

## Quick start

### 1. Configure your environment

```bash
cp .env.example .env
# Fill in OPENMYTHOS_API_KEY, OPENMYTHOS_MODEL, and OPENMYTHOS_MODE
```

For offline / local-dev work set:

```env
OPENMYTHOS_MOCK=true
```

No API key is required in mock mode.

### 2. Run the unit tests

```bash
node tests/openmythos.test.js
# or
npm run test:openmythos
```

---

## JS API reference

### Single generation — `OpenMythosProvider`

```js
const OpenMythosProvider = require('./services/OpenMythosProvider');

const provider = new OpenMythosProvider({
  model: 'openmythos-base',
  mode:  'precise',
  mock:  false, // set true for offline use
});

const response = await provider.generate(
  'Summarise the main privacy risks of having your home address listed on Spokeo.'
);

console.log(OpenMythosProvider.extractText(response));
```

### Parallel multi-agent orchestration — `OpenMythosOrchestrator`

```js
const OpenMythosProvider                              = require('./services/OpenMythosProvider');
const { OpenMythosOrchestrator }                      = require('./services/OpenMythosOrchestrator');

const orchestrator = new OpenMythosOrchestrator({
  provider:         { model: 'openmythos-base', mock: false },
  defaultTimeoutMs: 20_000,
  maxAgents:        5,
});

const results = await orchestrator.runAll([
  {
    id:     'threat-analysis',
    prompt: 'What are the top 3 data brokers likely to have Jane Doe\'s information?',
    tools:  ['threat-scan'],
  },
  {
    id:     'breach-guidance',
    prompt: 'Provide defensive guidance for someone whose email appeared in the RockYou2024 breach.',
    tools:  ['breach-check'],
  },
  {
    id:     'opsec-recommendations',
    prompt: 'List 5 immediate OPSEC hardening steps for a remote worker.',
    tools:  ['opsec-score'],
  },
]);

for (const result of results) {
  if (result.status === 'fulfilled') {
    const text = OpenMythosProvider.extractText(result.value);
    console.log(`[${result.id}]`, text);
  } else {
    console.error(`[${result.id}] failed:`, result.reason);
  }
}
```

### High-level privacy analysis — `OpenMythosOperator`

```js
const OpenMythosOperator = require('./operators/OpenMythosOperator');

const operator = new OpenMythosOperator({
  provider:     { model: 'openmythos-base', mock: false },
  orchestrator: { defaultTimeoutMs: 25_000 },
});

// Inspect the tool allowlist
console.log([...operator.allowedTools]);
// → ['threat-scan', 'data-removal', 'opsec-score', 'breach-check', ...]

// Run a parallel privacy sweep for an identity
const results = await operator.orchestratePrivacyAnalysis('Jane Doe', [
  'threat-scan',
  'opsec-score',
  'breach-check',
]);

for (const r of results) {
  const text = OpenMythosOperator.extractText(r.value ?? {});
  console.log(`\n=== ${r.id} ===\n${text}`);
}
```

---

## Example prompts

### Threat scan guidance

```
You are a defensive security advisor. Analyse the privacy risk surface for
identity "Jane Doe" using the "threat-scan" capability. Provide concise,
actionable defensive recommendations only. Do not produce exploit instructions.
```

### Data-broker opt-out planning

```
Given that Jane Doe's home address appears on Spokeo and Whitepages, outline
the step-by-step opt-out process for each broker, including form URLs,
required PII inputs, and expected turnaround times.
```

### OPSEC hardening for remote workers

```
List the top 5 OPSEC hardening steps for a remote software engineer who works
from home. Focus on network security, device hygiene, and minimal PII exposure.
Do not suggest offensive techniques.
```

### Breach response workflow

```
An email address associated with Jane Doe appeared in a recent credential
breach. Provide a defensive incident-response checklist: which passwords to
rotate first, how to enable MFA, and how to monitor for further misuse.
```

### Metadata audit interpretation

```
A metadata audit of https://example.com returned the following findings:
[paste findings JSON here]

Interpret these findings, prioritise by risk level, and suggest concrete
remediation steps for each category.
```

---

## Sandbox and tool allowlist

Every task sent to `OpenMythosOrchestrator` is validated against a tool allowlist
before execution. By default the allowlist contains:

| Tool ID              | Description                          |
|----------------------|--------------------------------------|
| `threat-scan`        | OSINT / PII threat discovery         |
| `data-removal`       | Data broker opt-out requests         |
| `opsec-score`        | Multi-vector OPSEC exposure scoring  |
| `breach-check`       | k-anonymity breach lookup            |
| `metadata-audit`     | HTTP/HTML metadata privacy audit     |
| `full-privacy-sweep` | End-to-end sweep + removal           |
| `rag-retrieve`       | RAG passage retrieval                |
| `web-search`         | DuckDuckGo search                    |

To add custom tools, pass a custom `toolAllowlist` when constructing the orchestrator:

```js
const { OpenMythosOrchestrator, DEFAULT_TOOL_ALLOWLIST } =
  require('./services/OpenMythosOrchestrator');

const myAllowlist = new Set([...DEFAULT_TOOL_ALLOWLIST, 'my-custom-tool']);

const orchestrator = new OpenMythosOrchestrator({
  toolAllowlist: myAllowlist,
});
```

---

## Safety and compliance rails

PhantomOperator's OpenMythos integration enforces two layers of safety controls:

### 1. Exploit-instruction guard (provider level)

Prompts matching known exploit patterns (reverse shells, SQLi vectors, ransomware, etc.)
are intercepted **before** the API call. The response is replaced with defensive
security guidance automatically.

### 2. Secret redaction (logging)

All log output passes through a redactor that strips:

- Known API keys / private keys from the current environment
- Long alphanumeric token strings
- `Bearer <token>` patterns

Secrets are replaced with `[REDACTED]` so they never appear in logs or error messages.

---

## Attribution

OpenMythos is created and maintained by **[@kyegomez](https://github.com/kyegomez)**.

- Repository: <https://github.com/kyegomez/OpenMythos>

PhantomOperator uses OpenMythos as a runtime AI provider for response generation
and multi-agent orchestration. We gratefully acknowledge the work of @kyegomez
and the OpenMythos project.
