/**
 * operators/OpenMythosOperator.js
 *
 * Domain operator that exposes OpenMythos-backed generation and multi-agent
 * orchestration as a first-class PhantomOperator capability.
 *
 * Usage
 * ─────
 *   const OpenMythosOperator = require('./operators/OpenMythosOperator');
 *   const op = new OpenMythosOperator();
 *
 *   // Single generation
 *   const response = await op.generate('Summarise privacy risks for …');
 *   console.log(OpenMythosOperator.extractText(response));
 *
 *   // Parallel multi-agent sweep
 *   const results = await op.orchestratePrivacyAnalysis('Jane Doe', [
 *     'threat-scan', 'opsec-score', 'breach-check',
 *   ]);
 *
 * Attribution: OpenMythos is developed by @kyegomez.
 * See https://github.com/kyegomez/OpenMythos for details.
 */

'use strict';

const OpenMythosProvider                               = require('../services/OpenMythosProvider');
const { OpenMythosOrchestrator, DEFAULT_TOOL_ALLOWLIST } = require('../services/OpenMythosOrchestrator');

class OpenMythosOperator {
  /**
   * @param {object} [config]
   * @param {object} [config.provider]        - OpenMythosProvider options.
   * @param {object} [config.orchestrator]    - OpenMythosOrchestrator options.
   */
  constructor(config = {}) {
    this.provider     = new OpenMythosProvider(config.provider || {});
    this.orchestrator = new OpenMythosOrchestrator({
      provider: config.provider || {},
      ...(config.orchestrator || {}),
    });
  }

  // ── Provider passthrough ──────────────────────────────────────────────────

  /**
   * Generate a single response from OpenMythos.
   * @param {string} prompt
   * @param {object} [extra]
   * @returns {Promise<object>}
   */
  async generate(prompt, extra = {}) {
    return this.provider.generate(prompt, extra);
  }

  /**
   * Extract the text content from a generate() response.
   * @param {object} response
   * @returns {string}
   */
  static extractText(response) {
    return OpenMythosProvider.extractText(response);
  }

  // ── Orchestration ─────────────────────────────────────────────────────────

  /**
   * Run an array of tasks in parallel via the orchestrator.
   * @param {import('../services/OpenMythosOrchestrator').OrchestratorTask[]} tasks
   * @returns {Promise<import('../services/OpenMythosOrchestrator').TaskResult[]>}
   */
  async runAll(tasks) {
    return this.orchestrator.runAll(tasks);
  }

  /**
   * High-level convenience: analyse an identity across one or more PhantomOperator
   * skill domains in parallel.
   *
   * @param {string}   identity  - Full name or identifier to analyse.
   * @param {string[]} skillIds  - PhantomOperator skill IDs to orchestrate.
   * @returns {Promise<import('../services/OpenMythosOrchestrator').TaskResult[]>}
   */
  async orchestratePrivacyAnalysis(identity, skillIds) {
    return this.orchestrator.orchestratePrivacyAnalysis(identity, skillIds);
  }

  /**
   * Expose the tool allowlist so callers can inspect what is permitted.
   * @returns {Set<string>}
   */
  get allowedTools() {
    return this.orchestrator.toolAllowlist;
  }
}

module.exports = OpenMythosOperator;
