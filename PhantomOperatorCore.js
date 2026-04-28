const SearchAgent = require('./agents/SearchAgent');
const BrokerAgent = require('./agents/BrokerAgent');
const { startSuperfluidFlow, stopSuperfluidFlow } = require('./services/SuperfluidService');

class PhantomOperatorCore {
  constructor(config = {}) {
    this.searchAgent = new SearchAgent(config.search || {});
    this.brokerAgent = new BrokerAgent(config.broker || {});
    this.superfluidConfig = config.superfluid || {};
  }

  /**
   * Scan for threats / exposures related to a user.
   * @param {Object} user - { email, name, country?, ... }
   * @returns {Promise<{ exposures: Array }>}
   */
  async scanExposures(user) {
    return this.searchAgent.scan(user);
  }

  /**
   * Schedule / execute opt-outs for a list of exposures.
   * @param {Array} exposures - output from scanExposures().exposures
   * @param {Object} user - same user object used for scanExposures
   * @returns {Promise<{ jobs: Array }>}
   */
  async scheduleOptOuts(exposures, user) {
    return this.brokerAgent.scheduleOptOuts(exposures, user);
  }

  /**
   * Open a Superfluid reward stream from configured wallet to a receiver.
   * @param {string} to - receiver address
   * @param {string} flowRate - flow rate per second (string)
   * @returns {Promise<string>} txHash
   */
  async openRewardStream(to, flowRate) {
    const txHash = await startSuperfluidFlow(to, flowRate);
    return txHash;
  }

  /**
   * Stop a Superfluid reward stream from configured wallet to a receiver.
   * @param {string} to - receiver address
   * @returns {Promise<string>} txHash
   */
  async stopRewardStream(to) {
    const txHash = await stopSuperfluidFlow(to);
    return txHash;
  }

  /**
   * End-to-end “run privacy workflow”:
   *  - scan exposures
   *  - schedule opt-outs
   */
  async runPrivacyWorkflow(user) {
    const { exposures } = await this.scanExposures(user);
    const { jobs } = await this.scheduleOptOuts(exposures, user);

    return {
      user,
      exposures,
      jobs,
    };
  }

  /**
   * Full privacy sweep used by the paid full-privacy-sweep skill.
   *  1. Runs a real DuckDuckGo threat scan via SearchAgent.run.
   *  2. Submits removal requests for every high/critical threat.
   *  3. Optionally opens a Superfluid payment stream for the duration.
   *
   * @param {{ fullName: string, walletAddress?: string, flowRate?: string }} params
   *   fullName     - Full name to scan and remediate (required).
   *   walletAddress - Wallet that will stream payment; omit to skip Superfluid.
   *   flowRate     - Superfluid flow rate in wei/second (string, e.g. "385802469135802"
   *                  ≈ $1/day in USDCx). Required when walletAddress is provided;
   *                  ignored otherwise.
   * @returns {Promise<{ threatsFound: number, removalAttempts: number, flowTxHash: string|null }>}
   */
  async startDataRemovalTask({ fullName, walletAddress, flowRate }) {
    // 1. Threat scan
    const threats = await SearchAgent.run({ fullName });
    const actionable = threats.filter(
      t => t.threatLevel === 'critical' || t.threatLevel === 'high'
    );

    // 2. Removal requests for actionable threats
    const removalResults = await Promise.allSettled(
      actionable.map(t => BrokerAgent.removeThreat({ link: t.link, fullName }))
    );
    const removalAttempts = removalResults.length;

    // 3. Optionally open a Superfluid stream
    let flowTxHash = null;
    if (walletAddress && flowRate) {
      try {
        flowTxHash = await startSuperfluidFlow(walletAddress, flowRate);
      } catch (err) {
        console.warn('PhantomOperatorCore: Superfluid stream failed (non-fatal):', err.message);
      }
    }

    return {
      threatsFound:    threats.length,
      removalAttempts,
      flowTxHash,
    };
  }
}

module.exports = PhantomOperatorCore;
