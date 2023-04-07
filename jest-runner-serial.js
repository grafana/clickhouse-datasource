const JestRunner = require('jest-runner');

class SerialJestRunner extends JestRunner {
  constructor(...args) {
    super(...args);
    this.isSerial = true;
    // this.maxConcurrency = 1
  }
}

module.exports = SerialJestRunner;
