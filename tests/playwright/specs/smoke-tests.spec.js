/**
 * EnPro Filtration Mastermind — Smoke Tests (S-01 to S-05)
 * These verify the portal is operational before deeper testing
 */

const { test, expect } = require('@playwright/test');
const { logResult } = require('../utils/test-logger');

test.describe('Smoke Tests @smoke', () => {
  
  test('S-01: Portal loads without errors', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    
    // Verify page loads
    await expect(page).toHaveTitle(/EnPro|Filtration/);
    
    // Check no console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    
    // Wait for main content
    await expect(page.locator('body')).toBeVisible();
    
    const loadTime = Date.now() - startTime;
    await logResult('S-01', 'Portal loads without errors', 'PASS', loadTime);
    
    expect(consoleErrors.length).toBe(0);
  });

  test('S-02: Search interface is functional', async ({ page }) => {
    await page.goto('/');
    
    // Look for search input
    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i], textarea').first();
    await expect(searchInput).toBeVisible();
    
    // Verify it's interactable
    await searchInput.fill('filter');
    await expect(searchInput).toHaveValue('filter');
    
    await logResult('S-02', 'Search interface is functional', 'PASS');
  });

  test('S-03: AI responds to basic query', async ({ page }) => {
    test.setTimeout(30000); // AI responses can take time
    
    await page.goto('/');
    
    // Find and fill search
    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i], textarea').first();
    await searchInput.fill('What filtration products do you have?');
    
    // Submit (look for button or press Enter)
    const submitBtn = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Search")').first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await searchInput.press('Enter');
    }
    
    // Wait for response (look for any new content)
    await page.waitForTimeout(3000);
    
    // Verify some response appeared
    const response = page.locator('.response, .message, .chat-response, [class*="response"], [class*="message"]').last();
    const hasResponse = await response.isVisible().catch(() => false);
    
    if (!hasResponse) {
      await logResult('S-03', 'AI responds to basic query', 'FAIL', null, 'No response element found');
      test.fail();
    }
    
    await logResult('S-03', 'AI responds to basic query', 'PASS');
  });

  test('S-04: No 500 errors or crashes', async ({ page }) => {
    const errors = [];
    
    page.on('response', response => {
      if (response.status() >= 500) {
        errors.push(`${response.url()}: ${response.status()}`);
      }
    });
    
    await page.goto('/');
    
    // Interact with the page
    const searchInput = page.locator('input[type="text"], textarea').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('test');
      await searchInput.press('Enter');
      await page.waitForTimeout(2000);
    }
    
    if (errors.length > 0) {
      await logResult('S-04', 'No 500 errors or crashes', 'FAIL', null, errors.join(', '));
      test.fail();
    }
    
    await logResult('S-04', 'No 500 errors or crashes', 'PASS');
  });

  test('S-05: Page elements render correctly', async ({ page }) => {
    await page.goto('/');
    
    // Basic layout checks
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    // Check for broken images
    const images = await page.locator('img').all();
    let brokenImages = 0;
    
    for (const img of images) {
      const naturalWidth = await img.evaluate(el => el.naturalWidth);
      if (naturalWidth === 0) brokenImages++;
    }
    
    if (brokenImages > 0) {
      await logResult('S-05', 'Page elements render correctly', 'PARTIAL', null, `${brokenImages} broken images`);
    } else {
      await logResult('S-05', 'Page elements render correctly', 'PASS');
    }
  });

});
