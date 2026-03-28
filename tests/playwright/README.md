# EnPro Playwright Tests

Automated testing suite for EnPro Filtration Mastermind.

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run smoke tests
npm run test:smoke

# Run all tests
npm test

# View interactive report
npm run report
```

## Test Structure

```
specs/
├── smoke-tests.spec.js      # S-01 to S-05 — Basic functionality
├── part-lookup.spec.js      # P-01 to P-08 — Part number searches
├── voice-tests.spec.js      # V-01 to V-06 — Voice input testing
└── edge-cases.spec.js       # E-01 to E-08 — Edge cases & stress tests
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
ENPRO_URL=https://enpro-fm-portal.onrender.com
WILLIS_API_URL=https://willis-portal.onrender.com/api
```

## Test Results

Results are automatically sent to Willis Portal bug tracking if `WILLIS_API_URL` is set.

Local results saved to:
- `results/test-results.json` — Raw test data
- `results/test-run-data.json` — Formatted results
- `playwright-report/` — HTML report
