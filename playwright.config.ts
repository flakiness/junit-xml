import { defineConfig } from '@playwright/test';

// Note: intentionally NOT using the @flakiness/playwright reporter here.
// Once @flakiness/junit-xml has a published version, CI will dogfood it by
// converting the JUnit XML emitted below into a Flakiness report.
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  reporter: [
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
});
