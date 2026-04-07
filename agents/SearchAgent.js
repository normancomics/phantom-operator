class SearchAgent {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Demo implementation: in the future this will actually search brokers/aggregators.
   * For now, it returns a single example exposure so the pipeline is testable.
   */
  async scan(user) {
    const { email, name, country } = user;

    return {
      exposures: [
        {
          source: 'ExampleBroker',
          risk: 'high',
          details: `Demo exposure for ${email || name || 'user'} in ${country || 'unknown region'}`,
          status: 'UNREMEDIATED',
        },
      ],
    };
  }
}

module.exports = SearchAgent;
