import { afterEach, beforeEach, expect } from 'vitest';

let currentTestName = '';

beforeEach(context => {
  currentTestName = context.task.name;
});

afterEach(context => {
  const status = context.task.result?.state === 'pass' ? 'PASS' : 'FAIL';
  const testIdMatch = currentTestName.match(/TC_[A-Z0-9_]+/);
  const testId = testIdMatch?.[0] ?? 'NO_TEST_CASE_ID';

  // Log toi gian de khi chay terminal co the chup bang chung theo Test Case ID.
  // Khong ghi file log trong setup nay de unit test khong phu thuoc filesystem.
  console.info(`[${status}] ${testId} - ${currentTestName}`);
});

expect.extend({});
