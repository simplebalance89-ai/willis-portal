/**
 * Test Result Logger — Sends results to Willis Portal Bug Tracking API
 */

const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.join(__dirname, '../results/test-run-data.json');
const WILLIS_API = process.env.WILLIS_API_URL || 'https://willis-portal.onrender.com/api';

// Ensure results directory exists
const resultsDir = path.dirname(RESULTS_FILE);
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

/**
 * Log a test result locally and optionally to Willis Portal
 */
async function logResult(testId, testName, result, responseTimeMs = null, notes = '') {
  const entry = {
    test_id: testId,
    test_name: testName,
    result: result, // PASS, FAIL, PARTIAL, BLOCKED, SKIP
    timestamp: new Date().toISOString(),
    response_time_ms: responseTimeMs,
    notes: notes,
    method: 'automated',
  };

  // Save locally
  let results = [];
  if (fs.existsSync(RESULTS_FILE)) {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  }
  results.push(entry);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

  // Try to send to Willis Portal if we have an active test run
  const testRunId = process.env.TEST_RUN_ID;
  if (testRunId) {
    try {
      await fetch(`${WILLIS_API}/test-runs/${testRunId}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (err) {
      // Silent fail - local log is primary
      console.log(`Note: Could not send to Willis API: ${err.message}`);
    }
  }

  // Console output
  const icon = result === 'PASS' ? '✅' : result === 'FAIL' ? '❌' : result === 'PARTIAL' ? '⚠️' : '⏭️';
  console.log(`${icon} ${testId}: ${result} — ${testName}${notes ? ` (${notes})` : ''}`);

  return entry;
}

/**
 * Start a new test run and return the ID
 */
async function startTestRun(testerName = 'Playwright Automation', testSuite = 'Full Suite') {
  const runData = {
    tester_name: testerName,
    test_suite: testSuite,
    enpro_version: process.env.ENPRO_VERSION || 'unknown',
    started: new Date().toISOString(),
  };

  // Save locally
  const runFile = path.join(__dirname, '../results/current-run.json');
  fs.writeFileSync(runFile, JSON.stringify(runData, null, 2));

  // Try to create via API
  try {
    const res = await fetch(`${WILLIS_API}/test-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runData),
    });
    
    if (res.ok) {
      const data = await res.json();
      process.env.TEST_RUN_ID = data.id;
      return data.id;
    }
  } catch (err) {
    console.log(`Note: Could not create test run in Willis: ${err.message}`);
  }

  // Generate local ID if API fails
  const localId = 'local-' + Date.now();
  process.env.TEST_RUN_ID = localId;
  return localId;
}

/**
 * Finish the current test run
 */
async function finishTestRun() {
  const testRunId = process.env.TEST_RUN_ID;
  if (!testRunId || testRunId.startsWith('local-')) return;

  try {
    await fetch(`${WILLIS_API}/test-runs/${testRunId}/finish`, {
      method: 'POST',
    });
  } catch (err) {
    console.log(`Note: Could not finish test run: ${err.message}`);
  }
}

module.exports = {
  logResult,
  startTestRun,
  finishTestRun,
};
