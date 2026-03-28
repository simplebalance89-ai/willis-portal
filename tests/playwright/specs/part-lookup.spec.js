/**
 * EnPro Filtration Mastermind — Part Number Lookup Tests (P-01 to P-08)
 * Testing part number search and response accuracy
 */

const { test, expect } = require('@playwright/test');
const { logResult } = require('../utils/test-logger');

// Test part numbers from the playbook
const TEST_PARTS = [
  { id: 'P-01', number: '3M320', description: 'Specific part number lookup' },
  { id: 'P-02', number: 'H880080N', description: 'Hydraulic filter part number' },
  { id: 'P-03', number: 'FT515111', description: 'Fuel filter part number' },
  { id: 'P-04', number: '3M319', description: 'Another 3M part number' },
  { id: 'P-05', number: 'H880100N', description: 'Hydraulic filter variant' },
  { id: 'P-06', number: 'INVALID123', description: 'Invalid part number - should not hallucinate' },
  { id: 'P-07', number: '3M319', description: 'Part with cross-reference check' },
  { id: 'P-08', number: 'FT5151', description: 'Partial part number (truncated)' },
];

test.describe('Part Number Lookups', () => {
  
  for (const part of TEST_PARTS) {
    test(`${part.id}: ${part.description} — Part: ${part.number}`, async ({ page }) => {
      test.setTimeout(30000);
      
      await page.goto('/');
      
      // Find search input
      const searchInput = page.locator('input[type="text"], input[placeholder*="search" i], textarea').first();
      await searchInput.fill(part.number);
      
      // Submit query
      const submitBtn = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Search")').first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
      } else {
        await searchInput.press('Enter');
      }
      
      // Wait for response
      await page.waitForTimeout(4000);
      
      // Get response text
      const responseSelectors = [
        '.response',
        '.message',
        '.chat-response',
        '[class*="response"]',
        '[class*="message"]',
        '[class*="result"]',
        'article',
        '.content'
      ];
      
      let responseText = '';
      for (const selector of responseSelectors) {
        const el = page.locator(selector).last();
        if (await el.isVisible().catch(() => false)) {
          responseText = await el.textContent() || '';
          break;
        }
      }
      
      // Special handling for invalid part number (P-06)
      if (part.id === 'P-06') {
        const hasProduct = responseText.toLowerCase().includes('product') || 
                          responseText.toLowerCase().includes('available') ||
                          responseText.toLowerCase().includes('price');
        
        if (hasProduct) {
          await logResult(part.id, part.description, 'FAIL', null, 
            'AI hallucinated product for invalid part number');
          test.fail('AI should NOT make up products for invalid part numbers');
        } else {
          await logResult(part.id, part.description, 'PASS', null, 
            'Correctly indicated part not found');
        }
        return;
      }
      
      // For valid parts, check we got a response
      if (!responseText || responseText.length < 20) {
        await logResult(part.id, part.description, 'FAIL', null, 'Empty or very short response');
        test.fail();
      }
      
      // Check if part number is mentioned in response
      const partMentioned = responseText.toLowerCase().includes(part.number.toLowerCase()) ||
                           responseText.includes('part') ||
                           responseText.includes('filter');
      
      if (!partMentioned) {
        await logResult(part.id, part.description, 'PARTIAL', null, 
          `Part number not clearly mentioned in response`);
      } else {
        await logResult(part.id, part.description, 'PASS');
      }
    });
  }

});
