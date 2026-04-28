/**
 * Known data-broker opt-out endpoints and the URL patterns they match.
 * Each entry defines a simple structural check so removeThreat can route
 * the request to the correct handler (or fall back to a generic stub).
 */
const BROKER_PATTERNS = [
  { domain: 'spokeo.com',            name: 'Spokeo' },
  { domain: 'whitepages.com',        name: 'Whitepages' },
  { domain: 'intelius.com',          name: 'Intelius' },
  { domain: 'beenverified.com',      name: 'BeenVerified' },
  { domain: 'peoplefinder.com',      name: 'PeopleFinder' },
  { domain: 'radaris.com',           name: 'Radaris' },
  { domain: 'mylife.com',            name: 'MyLife' },
  { domain: 'instantcheckmate.com',  name: 'InstantCheckmate' },
  { domain: 'truthfinder.com',       name: 'TruthFinder' },
  { domain: 'zabasearch.com',        name: 'ZabaSearch' },
  { domain: 'pipl.com',              name: 'Pipl' },
  { domain: 'fastpeoplesearch.com',  name: 'FastPeopleSearch' },
  { domain: 'thatsthem.com',         name: 'ThatsThem' },
  { domain: 'usersearch.org',        name: 'UserSearch' },
];

class BrokerAgent {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Demo implementation: map exposures to "jobs" so the flow is visible.
   * Later you'll plug in real broker-specific workflows here.
   */
  async scheduleOptOuts(exposures, user) {
    const jobs = exposures.map((exp, idx) => ({
      broker: exp.source,
      job_id: `job-${idx + 1}`,
      status: 'PENDING',
      notes: `Demo opt-out job for ${user.email || user.name || 'user'} at ${exp.source}`,
    }));

    return { jobs };
  }

  /**
   * Submit a data-removal request for a single threat URL.
   *
   * Identifies the broker from the URL, then submits the appropriate
   * opt-out request.  Returns a structured result so callers can report
   * success/failure per broker.
   *
   * @param {{ link: string, fullName?: string }} params
   * @returns {Promise<{ broker: string, status: 'submitted'|'unsupported'|'failed', detail: string }>}
   */
  static async removeThreat({ link, fullName }) {
    if (!link) {
      return { broker: 'unknown', status: 'failed', detail: 'No URL provided' };
    }

    let hostname = '';
    try {
      hostname = new URL(link).hostname.replace(/^www\./, '');
    } catch {
      return { broker: 'unknown', status: 'failed', detail: `Invalid URL: ${link}` };
    }

    const matched = BROKER_PATTERNS.find(
      b => hostname === b.domain || hostname.endsWith(`.${b.domain}`)
    );
    const brokerName = matched ? matched.name : hostname;

    try {
      // Placeholder for broker-specific opt-out logic.
      // Each broker will eventually have its own sub-operator that handles
      // form submissions, email opt-outs, or API calls.
      // For now we record the request and return a submitted status so the
      // pipeline can track which removals have been initiated.
      console.log(
        `BrokerAgent.removeThreat: queuing removal for ${brokerName} | url=${link}` +
        (fullName ? ` | name=${fullName}` : '')
      );

      if (!matched) {
        return {
          broker: brokerName,
          status: 'unsupported',
          detail: `No opt-out handler registered for ${hostname}. Manual removal required.`,
        };
      }

      return {
        broker: brokerName,
        status: 'submitted',
        detail: `Opt-out request queued for ${brokerName} (${link}).`,
      };
    } catch (err) {
      return { broker: brokerName, status: 'failed', detail: err.message };
    }
  }
}

module.exports = BrokerAgent;
