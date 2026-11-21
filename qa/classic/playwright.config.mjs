// Classic checks require an explicitly selected archive or historical deployment.
import { defineConfig } from '@playwright/test';
import current from '../playwright.config.mjs';

if (!process.env.CHECK_URL) {
  throw new Error('Set CHECK_URL to a Classic archive server. The current site runs the sheet map; use npm run check for it.');
}

export default defineConfig({ ...current, testDir: 'checks', outputDir: 'checks/out' });
