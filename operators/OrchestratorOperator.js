// Simple wrapper for now – you can refactor logic into here over time.
const SovereignAgent = require('../SovereignAgent');

class OrchestratorOperator {
  constructor(config = {}) {
    this.core = new SovereignAgent(config);
  }

  // Example method mirroring old behavior
  async startDataRemovalTask(params) {
    // Delegates to the existing SovereignAgent logic
    return this.core.startDataRemovalTask(params);
  }

  // Later: add high-level orchestration methods here, e.g.:
  // async runFullPrivacySweep(identity) { ... }
}

module.exports = OrchestratorOperator;
