/**
 * services/OpenMythosOrchestrator.js
 *
 * Multi-agent / sub-agent orchestration layer backed by OpenMythos.
 *
 * Design goals
 * ────────────
 * 1. Run sub-agents in parallel (Promise.allSettled) inside a lightweight
 *    sandbox abstraction.
 * 2. Enforce time limits and a tool allowlist per task.
 * 3. Provide clear boundaries: each task receives only the tools it needs.
 * 4. Remain simple — no external queue or database required.
 *
 * Attribution: OpenMythos is developed by @kyegomez.
 * See https://github.com/kyegomez/OpenMythos for details.
 */

'use strict';

const OpenMythosProvider = require('./OpenMythosProvider');

// ── Allowlist ─────────────────────────────────────────────────────────────────

/**
 * The canonical set of tools a sub-agent is permitted to request.
 * Any tool name not in this set is rejected before the task runs.
 *
 * Extend this list when you add new operator capabilities.
 */
const DEFAULT_TOOL_ALLOWLIST = new Set([
  'threat-scan',
  'data-removal',
  'opsec-score',
  'breach-check',
  'metadata-audit',
  'full-privacy-sweep',
  'rag-retrieve',
  'web-search',
]);

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_TASK_TIMEOUT_MS = Number(
  process.env.OPENMYTHOS_TASK_TIMEOUT_MS || 30_000
);
const DEFAULT_MAX_AGENTS = Number(
  process.env.OPENMYTHOS_MAX_AGENTS || 10
);

// ── Sandbox abstraction ───────────────────────────────────────────────────────

/**
 * Wrap a task function with a wall-clock timeout.
 *
 * @param {() => Promise<T>} fn       - Async function to sandbox.
 * @param {number}           ms       - Timeout in milliseconds.
 * @param {string}           taskId   - Used in the timeout error message.
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(fn, ms, taskId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Task "${taskId}" exceeded ${ms}ms time limit`)),
      ms,
    );
    fn()
      .then(v => { clearTimeout(timer); resolve(v); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Validate that all tools requested by a task are on the allowlist.
 *
 * @param {string[]} tools     - Requested tool names.
 * @param {Set<string>} allowlist
 * @returns {{ valid: boolean, denied: string[] }}
 */
function validateTools(tools, allowlist) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return { valid: true, denied: [] };
  }
  const denied = tools.filter(t => !allowlist.has(t));
  return { valid: denied.length === 0, denied };
}

// ── Task schema ───────────────────────────────────────────────────────────────

/**
 * @typedef {object} OrchestratorTask
 * @property {string}   id           - Unique task identifier (caller-supplied).
 * @property {string}   prompt       - Prompt to send to OpenMythos.
 * @property {string[]} [tools]      - Tools the sub-agent may use (must be in allowlist).
 * @property {object}   [context]    - Arbitrary context merged into the prompt.
 * @property {number}   [timeoutMs]  - Per-task timeout override (ms).
 * @property {object}   [extra]      - Extra parameters forwarded to OpenMythosProvider.generate().
 */

/**
 * @typedef {object} TaskResult
 * @property {string}  id
 * @property {'fulfilled'|'rejected'} status
 * @property {object|undefined} value   - Set when status === 'fulfilled'.
 * @property {string|undefined} reason  - Set when status === 'rejected'.
 */

// ── Orchestrator ──────────────────────────────────────────────────────────────

class OpenMythosOrchestrator {
  /**
   * @param {object} [options]
   * @param {object} [options.provider]      - Options forwarded to OpenMythosProvider.
   * @param {Set<string>}  [options.toolAllowlist]  - Override default tool allowlist.
   * @param {number} [options.maxAgents]     - Max concurrent sub-agents.
   * @param {number} [options.defaultTimeoutMs]
   */
  constructor(options = {}) {
    this.provider = new OpenMythosProvider(options.provider || {});
    this.toolAllowlist   = options.toolAllowlist    ?? DEFAULT_TOOL_ALLOWLIST;
    this.maxAgents       = options.maxAgents        ?? DEFAULT_MAX_AGENTS;
    this.defaultTimeout  = options.defaultTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
  }

  /**
   * Run a single task inside the sandbox.
   *
   * @param {OrchestratorTask} task
   * @returns {Promise<object>}
   */
  async runTask(task) {
    const { id, prompt, tools = [], context = {}, timeoutMs, extra = {} } = task;

    if (!id)     throw new Error('OpenMythosOrchestrator.runTask: task.id is required');
    if (!prompt) throw new Error('OpenMythosOrchestrator.runTask: task.prompt is required');

    // Tool allowlist check
    const { valid, denied } = validateTools(tools, this.toolAllowlist);
    if (!valid) {
      throw new Error(
        `Task "${id}": tool(s) not on allowlist — ${denied.join(', ')}`
      );
    }

    // Build the sandboxed prompt — inject context if provided
    const contextStr = Object.keys(context).length
      ? `\n\nContext:\n${JSON.stringify(context, null, 2)}`
      : '';
    const sandboxedPrompt = `${prompt}${contextStr}`;

    const ms = timeoutMs ?? this.defaultTimeout;

    return withTimeout(
      () => this.provider.generate(sandboxedPrompt, extra),
      ms,
      id,
    );
  }

  /**
   * Run multiple tasks in parallel (up to this.maxAgents at a time).
   * Returns one TaskResult per input task regardless of success/failure.
   *
   * @param {OrchestratorTask[]} tasks
   * @returns {Promise<TaskResult[]>}
   */
  async runAll(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return [];

    if (tasks.length > this.maxAgents) {
      throw new Error(
        `OpenMythosOrchestrator: ${tasks.length} tasks exceed maxAgents limit (${this.maxAgents})`
      );
    }

    const settled = await Promise.allSettled(
      tasks.map(task => this.runTask(task))
    );

    return settled.map((outcome, i) => {
      const task = tasks[i];
      if (outcome.status === 'fulfilled') {
        return { id: task.id, status: 'fulfilled', value: outcome.value };
      }
      return {
        id:     task.id,
        status: 'rejected',
        reason: outcome.reason?.message ?? String(outcome.reason),
      };
    });
  }

  /**
   * Convenience method: orchestrate a set of PhantomOperator privacy tasks
   * using OpenMythos to generate analysis / guidance for each.
   *
   * @param {string}   identity   - Name / handle being analysed.
   * @param {string[]} skillIds   - Skill IDs to generate guidance for.
   * @returns {Promise<TaskResult[]>}
   */
  async orchestratePrivacyAnalysis(identity, skillIds) {
    const tasks = skillIds.map(skillId => ({
      id:    skillId,
      tools: [skillId],
      prompt:
        `You are a defensive security advisor. ` +
        `Analyse the privacy risk surface for identity "${identity}" ` +
        `using the "${skillId}" capability. ` +
        `Provide concise, actionable defensive recommendations only. ` +
        `Do not produce exploit instructions.`,
    }));

    return this.runAll(tasks);
  }
}

module.exports = { OpenMythosOrchestrator, validateTools, DEFAULT_TOOL_ALLOWLIST };
