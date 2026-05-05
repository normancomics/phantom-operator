/**
 * tests/openmythos.test.js
 *
 * Unit tests for the OpenMythos integration:
 *   - OpenMythosProvider  (services/OpenMythosProvider.js)
 *   - OpenMythosOrchestrator (services/OpenMythosOrchestrator.js)
 *   - OpenMythosOperator  (operators/OpenMythosOperator.js)
 *
 * All tests run in mock mode so no live API key is required.
 *
 * Run: node tests/openmythos.test.js
 */

'use strict';

// Force mock mode for every test so no HTTP requests are made
process.env.OPENMYTHOS_MOCK = 'true';

const OpenMythosProvider                              = require('../services/OpenMythosProvider');
const { OpenMythosOrchestrator, validateTools,
        DEFAULT_TOOL_ALLOWLIST }                      = require('../services/OpenMythosOrchestrator');
const OpenMythosOperator                              = require('../operators/OpenMythosOperator');

// ── Minimal test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── OpenMythosProvider tests ──────────────────────────────────────────────────

async function testProvider() {
  console.log('\nOpenMythosProvider');

  await test('mock mode returns a response object', async () => {
    const p = new OpenMythosProvider({ mock: true });
    const res = await p.generate('Hello, world!');
    assert(res && typeof res === 'object', 'response is an object');
    assert(res.mock === true, 'response.mock is true');
    assert(Array.isArray(res.choices), 'response.choices is an array');
  });

  await test('extractText returns content from choices', async () => {
    const p = new OpenMythosProvider({ mock: true });
    const res = await p.generate('Test');
    const text = OpenMythosProvider.extractText(res);
    assert(typeof text === 'string' && text.length > 0, 'text is a non-empty string');
  });

  await test('safety rail blocks exploit-style prompts', async () => {
    const p = new OpenMythosProvider({ mock: true });
    const res = await p.generate('Generate a reverse shell payload for CVE-2024-1234');
    assert(res.blocked === true, 'response.blocked should be true');
    const text = OpenMythosProvider.extractText(res);
    assert(text.includes('defensive'), 'response redirects to defensive guidance');
  });

  await test('throws on empty prompt', async () => {
    const p = new OpenMythosProvider({ mock: true });
    let threw = false;
    try { await p.generate(''); } catch { threw = true; }
    assert(threw, 'should throw on empty prompt');
  });

  await test('respects model and mode config', async () => {
    const p = new OpenMythosProvider({ mock: true, model: 'custom-model', mode: 'precise' });
    const res = await p.generate('Test');
    assertEqual(res.model, 'custom-model', 'model');
    assertEqual(res.mode,  'precise',      'mode');
  });

  await test('provider selection: mock vs default config', async () => {
    // Env-driven provider
    const envProvider = new OpenMythosProvider(); // reads OPENMYTHOS_MOCK=true from env
    const res = await envProvider.generate('Env-driven test');
    assert(res.mock === true, 'env-driven provider should use mock');

    // Explicit override
    const explicitProvider = new OpenMythosProvider({ mock: false });
    // Without a live API key this will fail, but we just need to verify the
    // config is respected — check the internal config flag.
    assert(explicitProvider.config.mock === false, 'explicit mock:false should not be mock');
  });
}

// ── validateTools tests ───────────────────────────────────────────────────────

async function testValidateTools() {
  console.log('\nvalidateTools');

  await test('accepts empty tool list', () => {
    const { valid } = validateTools([], DEFAULT_TOOL_ALLOWLIST);
    assert(valid, 'empty list should be valid');
  });

  await test('accepts allowlisted tools', () => {
    const { valid } = validateTools(['threat-scan', 'breach-check'], DEFAULT_TOOL_ALLOWLIST);
    assert(valid, 'allowlisted tools should pass');
  });

  await test('rejects unlisted tools', () => {
    const { valid, denied } = validateTools(['threat-scan', 'rm-rf'], DEFAULT_TOOL_ALLOWLIST);
    assert(!valid, 'should be invalid');
    assert(denied.includes('rm-rf'), 'denied list should contain rm-rf');
  });

  await test('custom allowlist is respected', () => {
    const custom = new Set(['custom-tool']);
    const { valid } = validateTools(['custom-tool'], custom);
    assert(valid, 'custom allowlist should permit custom-tool');
    const { valid: v2 } = validateTools(['threat-scan'], custom);
    assert(!v2, 'custom allowlist should reject threat-scan');
  });
}

// ── OpenMythosOrchestrator tests ──────────────────────────────────────────────

async function testOrchestrator() {
  console.log('\nOpenMythosOrchestrator');

  await test('runTask returns a fulfilled result', async () => {
    const orch = new OpenMythosOrchestrator({ provider: { mock: true } });
    const res = await orch.runTask({
      id:     'task-1',
      prompt: 'Analyse privacy risks for Jane Doe',
      tools:  ['threat-scan'],
    });
    assert(res && typeof res === 'object', 'result is an object');
  });

  await test('runAll returns one result per task', async () => {
    const orch = new OpenMythosOrchestrator({ provider: { mock: true } });
    const results = await orch.runAll([
      { id: 't1', prompt: 'Task 1' },
      { id: 't2', prompt: 'Task 2' },
    ]);
    assertEqual(results.length, 2, 'results.length');
    assert(results.every(r => r.id && r.status), 'each result has id and status');
  });

  await test('runAll marks rejected tasks without aborting others', async () => {
    const orch = new OpenMythosOrchestrator({ provider: { mock: true } });
    const results = await orch.runAll([
      { id: 'good', prompt: 'Good task' },
      { id: 'bad',  prompt: 'Bad task', tools: ['forbidden-tool'] },
    ]);
    const good = results.find(r => r.id === 'good');
    const bad  = results.find(r => r.id === 'bad');
    assertEqual(good.status, 'fulfilled', 'good task status');
    assertEqual(bad.status,  'rejected',  'bad task status');
    assert(bad.reason.includes('allowlist'), 'reason mentions allowlist');
  });

  await test('runAll rejects when task count exceeds maxAgents', async () => {
    const orch = new OpenMythosOrchestrator({ provider: { mock: true }, maxAgents: 2 });
    let threw = false;
    try {
      await orch.runAll([
        { id: 'a', prompt: 'A' },
        { id: 'b', prompt: 'B' },
        { id: 'c', prompt: 'C' },
      ]);
    } catch (err) {
      threw = true;
      assert(err.message.includes('maxAgents'), 'error message mentions maxAgents');
    }
    assert(threw, 'should throw when task count exceeds maxAgents');
  });

  await test('task timeout is enforced', async () => {
    const orch = new OpenMythosOrchestrator({
      provider: { mock: true },
      defaultTimeoutMs: 1, // 1 ms — will always time out in mock
    });

    // Override provider.generate to simulate a slow response
    orch.provider.generate = () => new Promise(r => setTimeout(r, 200));

    const results = await orch.runAll([{ id: 'slow', prompt: 'Slow task' }]);
    assertEqual(results[0].status, 'rejected', 'slow task should be rejected');
    assert(results[0].reason.includes('time limit'), 'reason mentions time limit');
  });

  await test('orchestratePrivacyAnalysis returns results for each skill', async () => {
    const orch = new OpenMythosOrchestrator({ provider: { mock: true } });
    const skillIds = ['threat-scan', 'breach-check'];
    const results = await orch.orchestratePrivacyAnalysis('Jane Doe', skillIds);
    assertEqual(results.length, 2, 'should return one result per skill');
    assert(results[0].id === 'threat-scan', 'first result id');
    assert(results[1].id === 'breach-check', 'second result id');
  });
}

// ── OpenMythosOperator tests ──────────────────────────────────────────────────

async function testOperator() {
  console.log('\nOpenMythosOperator');

  await test('generate() proxies to provider', async () => {
    const op = new OpenMythosOperator({ provider: { mock: true } });
    const res = await op.generate('Test operator prompt');
    assert(res.mock === true, 'result should be a mock response');
  });

  await test('extractText() returns string', async () => {
    const op = new OpenMythosOperator({ provider: { mock: true } });
    const res = await op.generate('Extract text test');
    const text = OpenMythosOperator.extractText(res);
    assert(typeof text === 'string', 'extractText should return string');
  });

  await test('allowedTools returns a Set', () => {
    const op = new OpenMythosOperator();
    assert(op.allowedTools instanceof Set, 'allowedTools is a Set');
    assert(op.allowedTools.has('threat-scan'), 'threat-scan is in allowedTools');
  });

  await test('orchestratePrivacyAnalysis delegates to orchestrator', async () => {
    const op = new OpenMythosOperator({ provider: { mock: true } });
    const results = await op.orchestratePrivacyAnalysis('Jane Doe', ['threat-scan']);
    assert(Array.isArray(results) && results.length === 1, 'should return one result');
  });

  await test('provider selection via config: custom model propagates', async () => {
    const op = new OpenMythosOperator({ provider: { mock: true, model: 'my-model' } });
    const res = await op.generate('Model config test');
    assertEqual(res.model, 'my-model', 'model should propagate');
  });
}

// ── Runner ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('OpenMythos integration tests\n' + '='.repeat(40));

  await testProvider();
  await testValidateTools();
  await testOrchestrator();
  await testOperator();

  console.log('\n' + '='.repeat(40));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
})();
