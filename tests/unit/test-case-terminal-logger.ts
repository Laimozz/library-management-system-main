import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect } from 'vitest';

type CaseMap = Map<string, string>;

const caseMapByFile: Map<string, CaseMap> = new Map();

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/').toLowerCase();
}

function parseCaseMap(filePath: string): CaseMap {
  const normalized = normalizeFilePath(filePath);
  const cached = caseMapByFile.get(normalized);
  if (cached) return cached;

  const map: CaseMap = new Map();

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const idMatch = lines[i].match(/Test Case ID:\s*(TC_[A-Z0-9_]+)/);
      if (!idMatch) continue;

      const testCaseId = idMatch[1];

      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const titleMatch = lines[j].match(/it\('([^']+)'/);
        if (titleMatch) {
          map.set(titleMatch[1], testCaseId);
          break;
        }
      }
    }
  } catch {
    // If source read fails, fallback logging still works with UNKNOWN_TC.
  }

  caseMapByFile.set(normalized, map);
  return map;
}

function getCurrentTestInfo() {
  const state = expect.getState() as any;
  const task = state?.currentTestName ? state?.currentTask : null;

  const fullName = String(state?.currentTestName || '');
  const testName = fullName.includes(' > ') ? fullName.split(' > ').pop() || fullName : fullName;
  const filePath = String(task?.file?.name || state?.testPath || '');

  const caseMap = filePath ? parseCaseMap(filePath) : new Map<string, string>();
  const testCaseId = caseMap.get(testName) || 'UNKNOWN_TC';

  return { filePath, fullName, testName, testCaseId };
}

beforeEach(() => {
  const info = getCurrentTestInfo();
  console.log(`[${info.testCaseId}] Dang chay: ${info.testName}`);
});

afterEach((ctx: any) => {
  const info = getCurrentTestInfo();
  const state = String(ctx?.task?.result?.state || 'unknown');
  const errors = Array.isArray(ctx?.task?.result?.errors) ? ctx.task.result.errors : [];

  if (state === 'pass') {
    console.log(`[${info.testCaseId}] Thanh cong: ${info.testName}`);
    return;
  }

  const reason = errors.length > 0 ? String(errors[0]?.message || errors[0]) : 'Khong xac dinh duoc nguyen nhan';
  console.error(`[${info.testCaseId}] Loi: ${reason}`);
});
