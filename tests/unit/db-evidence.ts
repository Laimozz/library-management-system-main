import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';

const DB_EVIDENCE_DIR = join(process.cwd(), 'test-evi');
const TEST_CASE_ID_PATTERN = /\bTC_[A-Z0-9_]+_\d+\b/;

function resolveTestCaseId(testCaseId?: string) {
  if (testCaseId) return testCaseId;

  const currentTestName = expect.getState().currentTestName || 'unknown-test-case';
  return currentTestName.match(TEST_CASE_ID_PATTERN)?.[0] || currentTestName.replace(/[^\w.-]+/g, '_');
}

function writeDbEvidence(testCaseId: string, dbBefore: unknown, dbAfterRun: unknown, dbAfterRollback: unknown) {
  mkdirSync(DB_EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(DB_EVIDENCE_DIR, `${testCaseId}.json`),
    JSON.stringify(
      {
        testCaseId,
        generatedAt: new Date().toISOString(),
        snapshots: {
          dbTruocKhiChay: dbBefore,
          dbSauKhiChay: dbAfterRun,
          dbSauKhiRollback: dbAfterRollback,
        },
      },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2
    )
  );
}

export async function runMockDbWithRollback<T, DbState>({
  action,
  getDb,
  setDb,
  testCaseId,
}: {
  action: () => Promise<T>;
  getDb: () => DbState;
  setDb: (db: DbState) => void;
  testCaseId?: string;
}) {
  const resolvedTestCaseId = resolveTestCaseId(testCaseId);
  const dbBefore = structuredClone(getDb());
  let dbAfterRun = structuredClone(getDb());

  try {
    const result = await action();
    dbAfterRun = structuredClone(getDb());
    return result;
  } catch (error) {
    dbAfterRun = structuredClone(getDb());
    throw error;
  } finally {
    const dbAfterRollback = structuredClone(dbBefore);
    setDb(dbAfterRollback);
    writeDbEvidence(resolvedTestCaseId, dbBefore, dbAfterRun, getDb());
  }
}
