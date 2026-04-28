// Simple wrapper — delegates to PhantomOperatorCore.
const PhantomOperatorCore = require('../PhantomOperatorCore');

class OrchestratorOperator {
  constructor(config = {}) {
    this.core = new PhantomOperatorCore(config);
  }

  /**
   * Full privacy sweep: threat scan → automated removal → optional Superfluid stream.
   * @param {{ fullName: string, walletAddress?: string, flowRate?: string }} params
   * @returns {Promise<{ threatsFound: number, removalAttempts: number, flowTxHash: string|null }>}
   */
  async startDataRemovalTask(params) {
    return this.core.startDataRemovalTask(params);
  }

  // Later: add high-level orchestration methods here, e.g.:
  // async runFullPrivacySweep(identity) { ... }
}

module.exports = OrchestratorOperator;
