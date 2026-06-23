// Global setup — runs once before all test suites.
// Nothing to do in unit test mode (no real DB), but this hook exists
// so integration tests can extend it without touching every suite file.
module.exports = async () => {};
