class MockClient {
  constructor() {
    this.connectCalled = false;
  }

  // Simulate a connect that never resolves so tests can exercise abort/cancel logic
  async connect() {
    this.connectCalled = true;
    return new Promise(() => {});
  }

  async end() {
    // no-op
    return;
  }

  on() {
    // no-op event registration placeholder
  }
}

module.exports = { Client: MockClient };
