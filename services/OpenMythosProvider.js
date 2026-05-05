/**
 * services/OpenMythosProvider.js
 *
 * Provider wrapper for @kyegomez/OpenMythos runtime.
 *
 * Responsibilities:
 *  - Read configuration from environment variables (model, seed, mode, mock).
 *  - Apply safety / compliance rails before forwarding prompts.
 *  - Redact secrets from log output.
 *  - Delegate to the real OpenMythos HTTP endpoint (or return a mock response
 *    when OPENMYTHOS_MOCK=true).
 *
 * Attribution: OpenMythos is developed by @kyegomez.
 * See https://github.com/kyegomez/OpenMythos for details.
 */

'use strict';

const https = require('https');
const http  = require('http');

// ── Configuration ─────────────────────────────────────────────────────────────

const DEFAULTS = {
  baseUrl:     process.env.OPENMYTHOS_BASE_URL  || 'https://api.openmythos.ai',
  model:       process.env.OPENMYTHOS_MODEL      || 'openmythos-base',
  seed:        process.env.OPENMYTHOS_SEED       != null
                 ? Number(process.env.OPENMYTHOS_SEED)
                 : undefined,
  mode:        process.env.OPENMYTHOS_MODE       || 'standard',
  mock:        process.env.OPENMYTHOS_MOCK       === 'true',
  timeoutMs:   Number(process.env.OPENMYTHOS_TIMEOUT_MS  || 30_000),
  apiKey:      process.env.OPENMYTHOS_API_KEY    || '',
};

// ── Safety rail — exploit guard ───────────────────────────────────────────────

/**
 * Patterns that suggest a request is seeking actionable exploit instructions.
 * Matching prompts are rejected with a defensive-security redirect.
 */
const EXPLOIT_PATTERNS = [
  /\b(exploit|payload|shellcode|reverse[ _-]?shell|bind[ _-]?shell|metasploit|meterpreter)\b/i,
  /\b(sql[ _-]?inject|xss[ _-]?vector|buffer[ _-]?overflow|rop[ _-]?chain|heap[ _-]?spray)\b/i,
  /\b(keylog|ransomware|malware|rootkit|trojan|worm|botnet|c2[ _-]?server)\b/i,
  /\b(crack[ _-]?(password|hash)|brute[ _-]?force[ _-]?(login|ssh|ftp))\b/i,
];

/**
 * Returns true if the prompt matches an exploit-instruction pattern.
 * @param {string} prompt
 * @returns {boolean}
 */
function isExploitRequest(prompt) {
  return EXPLOIT_PATTERNS.some(re => re.test(prompt));
}

const EXPLOIT_REDIRECT_MESSAGE =
  'PhantomOperator does not produce actionable exploit instructions. ' +
  'This response has been replaced with defensive security guidance:\n\n' +
  'Focus on: patch management, principle of least privilege, network segmentation, ' +
  'secure coding practices, dependency audits, and responsible disclosure.';

// ── Secret redactor ───────────────────────────────────────────────────────────

/**
 * High-confidence secret patterns applied after env-var scrubbing.
 * Kept narrow to avoid false-positives on normal log content.
 */
const SECRET_PATTERNS = [
  // Raw 64-char hex private keys (e.g. Ethereum)
  { re: /\b[0-9a-fA-F]{64}\b/g,  mask: '[REDACTED-KEY]' },
  // Bearer tokens in Authorization headers
  { re: /Bearer\s+\S+/gi,         mask: 'Bearer [REDACTED]' },
];

/**
 * Redact potential secrets from a string before logging.
 *
 * Two layers:
 *  1. Strip known sensitive env-var values by exact match.
 *  2. Apply narrow regex patterns for hex keys and bearer tokens.
 *
 * @param {string} text
 * @returns {string}
 */
function redactSecrets(text) {
  if (typeof text !== 'string') return String(text);
  let out = text;

  // Layer 1 — known env-var secrets (exact match)
  const sensitiveEnvKeys = [
    'OPENMYTHOS_API_KEY', 'PRIVATE_KEY', 'HIBP_API_KEY',
    'CDP_API_KEY_PRIVATE_KEY', 'CRYPTOSKILL_API_KEY',
  ];
  for (const key of sensitiveEnvKeys) {
    const val = process.env[key];
    if (val && val.length > 4) {
      out = out.split(val).join('[REDACTED]');
    }
  }

  // Layer 2 — structural patterns
  for (const { re, mask } of SECRET_PATTERNS) {
    out = out.replace(re, mask);
  }

  return out;
}

/**
 * Safe logger — redacts secrets before writing to stdout/stderr.
 */
const log = {
  info:  (...args) => console.log('[OpenMythosProvider]',  ...args.map(a => redactSecrets(String(a)))),
  warn:  (...args) => console.warn('[OpenMythosProvider]', ...args.map(a => redactSecrets(String(a)))),
  error: (...args) => console.error('[OpenMythosProvider]',...args.map(a => redactSecrets(String(a)))),
};

// ── HTTP helper ───────────────────────────────────────────────────────────────

/**
 * Minimal JSON POST over HTTPS/HTTP with a configurable timeout.
 * Uses only Node.js built-ins so there is no extra npm dependency.
 *
 * @param {string} baseUrl
 * @param {string} path
 * @param {object} body
 * @param {string} apiKey
 * @param {number} timeoutMs
 * @returns {Promise<object>}
 */
function jsonPost(baseUrl, path, body, apiKey, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(path, baseUrl);
    const payload = JSON.stringify(body);

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    };

    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error(`OpenMythos: non-JSON response (status ${res.statusCode})`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`OpenMythos: request timed out after ${timeoutMs}ms`));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Mock response ─────────────────────────────────────────────────────────────

/**
 * Return a deterministic mock response for offline / test use.
 * @param {string} prompt
 * @param {object} config
 * @returns {object}
 */
function buildMockResponse(prompt, config) {
  return {
    id:      `mock-${Date.now()}`,
    model:   config.model,
    mode:    config.mode,
    mock:    true,
    choices: [
      {
        message: {
          role:    'assistant',
          content: `[MOCK] OpenMythos response for prompt: "${prompt.slice(0, 80)}…"`,
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

class OpenMythosProvider {
  /**
   * @param {object} [options]
   * @param {string} [options.baseUrl]
   * @param {string} [options.model]
   * @param {number} [options.seed]
   * @param {string} [options.mode]   - 'standard' | 'creative' | 'precise'
   * @param {boolean}[options.mock]
   * @param {number} [options.timeoutMs]
   * @param {string} [options.apiKey]
   */
  constructor(options = {}) {
    this.config = {
      baseUrl:   options.baseUrl   ?? DEFAULTS.baseUrl,
      model:     options.model     ?? DEFAULTS.model,
      seed:      options.seed      ?? DEFAULTS.seed,
      mode:      options.mode      ?? DEFAULTS.mode,
      mock:      options.mock      ?? DEFAULTS.mock,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      apiKey:    options.apiKey    ?? DEFAULTS.apiKey,
    };
  }

  /**
   * Generate a response from OpenMythos.
   *
   * @param {string} prompt        - The user / system prompt to send.
   * @param {object} [extra]       - Additional parameters merged into the API body.
   * @returns {Promise<object>}    - Raw API response object.
   */
  async generate(prompt, extra = {}) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('OpenMythosProvider.generate: prompt must be a non-empty string');
    }

    // Safety rail — block actionable exploit instructions
    if (isExploitRequest(prompt)) {
      log.warn('Safety rail triggered — exploit-style prompt blocked.');
      return {
        id:      `safety-${Date.now()}`,
        model:   this.config.model,
        blocked: true,
        choices: [
          {
            message: { role: 'assistant', content: EXPLOIT_REDIRECT_MESSAGE },
            finish_reason: 'safety',
          },
        ],
      };
    }

    const body = {
      model:    this.config.model,
      mode:     this.config.mode,
      messages: [{ role: 'user', content: prompt }],
      ...(this.config.seed != null ? { seed: this.config.seed } : {}),
      ...extra,
    };

    // Offline / mock mode — no network call
    if (this.config.mock) {
      log.info('Mock mode active — returning synthetic response.');
      return buildMockResponse(prompt, this.config);
    }

    log.info(`Calling OpenMythos model=${this.config.model} mode=${this.config.mode}`);

    try {
      const result = await jsonPost(
        this.config.baseUrl,
        '/v1/chat/completions',
        body,
        this.config.apiKey,
        this.config.timeoutMs,
      );
      return result;
    } catch (err) {
      log.error(`API call failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Extract the text content from a generate() response.
   * @param {object} response - result of generate()
   * @returns {string}
   */
  static extractText(response) {
    return response?.choices?.[0]?.message?.content ?? '';
  }
}

module.exports = OpenMythosProvider;
