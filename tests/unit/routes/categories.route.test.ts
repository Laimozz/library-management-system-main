import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const seed = {
    categories: [
      {
        id: 1,
        name: 'Software',
        description: 'Software books',
        isDeleted: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 2,
        name: 'Deleted Category',
        description: null,
        isDeleted: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    nextId: 3,
  };

  return {
    seed,
    db: structuredClone(seed),
  };
});

const mocks = vi.hoisted(() => ({
  successResponse: vi.fn((data: unknown, message?: string, status = 200) => ({
    success: true,
    data,
    message,
    status,
  })),
  handleRouteError: vi.fn((error: unknown) => ({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  })),
  parsePaginationParams: vi.fn((searchParams: URLSearchParams) => ({
    page: Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10)),
    limit: Math.max(1, Number.parseInt(searchParams.get('limit') || '10', 10)),
    search: searchParams.get('search') || '',
  })),
  parseIntParam: vi.fn((param: string | null, defaultValue = 0) => {
    if (!param) return defaultValue;
    const parsed = Number.parseInt(param, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }),
  sanitizeString: vi.fn((input: string) => input.trim().replace(/[<>]/g, '')),
  validateRequiredFields: vi.fn((data: Record<string, unknown>, required: string[]) => {
    for (const field of required) {
      if (!data[field] || (typeof data[field] === 'string' && data[field]!.toString().trim() === '')) {
        return `Missing required field: ${field}`;
      }
    }
    return null;
  }),
}));

const prismaMock = vi.hoisted(() => ({
  category: {
    findMany: vi.fn(async (args: any) => {
      const where = args?.where || {};
      const rows = testState.db.categories.filter(category => {
        if (typeof where.isDeleted === 'boolean' && category.isDeleted !== where.isDeleted) {
          return false;
        }
        if (where.OR && Array.isArray(where.OR)) {
          const nameContains = where.OR[0]?.name?.contains || '';
          const descContains = where.OR[1]?.description?.contains || '';
          return (
            category.name.includes(nameContains) ||
            (category.description || '').includes(descContains)
          );
        }
        return true;
      });

      const skip = args?.skip || 0;
      const take = args?.take || rows.length;
      return rows.slice(skip, skip + take);
    }),
    count: vi.fn(async (args: any) => {
      const where = args?.where || {};
      return testState.db.categories.filter(category => {
        if (typeof where.isDeleted === 'boolean') {
          return category.isDeleted === where.isDeleted;
        }
        return true;
      }).length;
    }),
    create: vi.fn(async ({ data }: any) => {
      const now = new Date();
      const created = {
        id: testState.db.nextId++,
        name: data.name,
        description: data.description ?? null,
        isDeleted: Boolean(data.isDeleted),
        createdAt: now,
        updatedAt: now,
      };
      testState.db.categories.push(created);
      return created;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        testState.db.categories.find(category => {
          if (where?.id !== undefined && category.id !== where.id) return false;
          if (where?.isDeleted !== undefined && category.isDeleted !== where.isDeleted) return false;
          return true;
        }) || null
      );
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.categories.findIndex(category => category.id === where.id);
      if (index < 0) {
        throw new Error('Category not found');
      }
      testState.db.categories[index] = {
        ...testState.db.categories[index],
        ...data,
        updatedAt: new Date(),
      };
      return testState.db.categories[index];
    }),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/utils', () => ({
  handleRouteError: mocks.handleRouteError,
  parsePaginationParams: mocks.parsePaginationParams,
  parseIntParam: mocks.parseIntParam,
  sanitizeString: mocks.sanitizeString,
  successResponse: mocks.successResponse,
  validateRequiredFields: mocks.validateRequiredFields,
}));

vi.mock('@/middleware/auth.middleware', () => ({
  requireLibrarian: (handler: unknown) => handler,
}));

import {
    DELETE as deleteCategory,
    GET as getCategoryById,
    PUT as updateCategory,
} from '@/app/api/categories/[id]/route';
import { POST as createCategory, GET as getCategories } from '@/app/api/categories/route';

async function runWithRollback<T>(action: () => Promise<T>): Promise<T> {
  const snapshot = structuredClone(testState.db);
  try {
    return await action();
  } finally {
    testState.db = snapshot;
  }
}

describe('Categories backend CRUD with CheckDB and Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.db = structuredClone(testState.seed);
  });

  // Test Case ID: TC_UT_BE_CATEGORY_001
  it('reads categories list with filter parameters', async () => {
    const response = await getCategories({
      url: 'http://localhost/api/categories?page=1&limit=10&search=Software&isDeleted=false',
    } as any);

    expect(prismaMock.category.findMany).toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.data.pagination.limit).toBe(10);
  });

  // Test Case ID: TC_UT_BE_CATEGORY_002
  it('creates category and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    const response = await runWithRollback(async () => {
      const created = await createCategory({
        json: async () => ({
          name: 'Architecture',
          description: 'Architecture books',
        }),
      } as any);

      expect(testState.db.categories.some(category => category.name === 'Architecture')).toBe(true); // CheckDB
      return created;
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_CATEGORY_003
  it('gets category by id', async () => {
    const response = await getCategoryById({} as any, {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.success).toBe(true);
    expect(response.data.id).toBe(1);
  });

  // Test Case ID: TC_UT_BE_CATEGORY_004
  it('updates category and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    await runWithRollback(async () => {
      await updateCategory(
        {
          json: async () => ({
            description: 'Updated category',
          }),
        } as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      expect(testState.db.categories.find(category => category.id === 1)?.description).toBe(
        'Updated category'
      ); // CheckDB
    });

    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_CATEGORY_005
  it('soft deletes category and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    await runWithRollback(async () => {
      await deleteCategory({} as any, { params: Promise.resolve({ id: '1' }) } as any);

      expect(testState.db.categories.find(category => category.id === 1)?.isDeleted).toBe(true); // CheckDB
    });

    expect(testState.db).toEqual(before); // Rollback
  });
});
