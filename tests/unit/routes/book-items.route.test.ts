import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const seed = {
    books: [
      {
        id: 10,
        title: 'Book A',
        isbn: '111',
        coverImageUrl: null,
        author: { id: 1, fullName: 'Author A' },
      },
    ],
    bookItems: [
      {
        id: 1,
        bookId: 10,
        code: 'CP-001',
        condition: 'GOOD',
        status: 'AVAILABLE',
        acquisitionDate: null,
        isDeleted: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    nextId: 2,
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
  book: {
    findUnique: vi.fn(async ({ where }: any) => {
      return testState.db.books.find(book => book.id === where.id) || null;
    }),
  },
  bookItem: {
    findMany: vi.fn(async (args: any) => {
      const where = args?.where || {};
      let rows = testState.db.bookItems.filter(item => {
        if (where?.isDeleted !== undefined && item.isDeleted !== where.isDeleted) return false;
        if (where?.bookId?.in && !where.bookId.in.includes(item.bookId)) return false;
        if (where?.status?.in && !where.status.in.includes(item.status)) return false;
        if (where?.code?.contains && !item.code.includes(where.code.contains)) return false;
        return true;
      });

      rows = rows.map(item => ({
        ...item,
        book: testState.db.books.find(book => book.id === item.bookId),
      }));

      const skip = args?.skip || 0;
      const take = args?.take || rows.length;
      return rows.slice(skip, skip + take);
    }),
    count: vi.fn(async (args: any) => {
      const where = args?.where || {};
      return testState.db.bookItems.filter(item => {
        if (where?.isDeleted !== undefined && item.isDeleted !== where.isDeleted) return false;
        return true;
      }).length;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      return testState.db.bookItems.find(item => item.code === where.code) || null;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        testState.db.bookItems.find(item => {
          if (where?.id !== undefined && item.id !== where.id) return false;
          if (where?.isDeleted !== undefined && item.isDeleted !== where.isDeleted) return false;
          if (where?.code !== undefined && item.code !== where.code) return false;
          if (where?.id?.not !== undefined && item.id === where.id.not) return false;
          return true;
        }) || null
      );
    }),
    create: vi.fn(async ({ data }: any) => {
      const now = new Date();
      const created = {
        id: testState.db.nextId++,
        bookId: data.bookId,
        code: data.code,
        condition: data.condition,
        status: data.status,
        acquisitionDate: data.acquisitionDate ?? null,
        isDeleted: Boolean(data.isDeleted),
        createdAt: now,
        updatedAt: now,
      };
      testState.db.bookItems.push(created);
      return created;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.bookItems.findIndex(item => item.id === where.id);
      if (index < 0) {
        throw new Error('Book item not found');
      }
      testState.db.bookItems[index] = {
        ...testState.db.bookItems[index],
        ...data,
        updatedAt: new Date(),
      };
      return testState.db.bookItems[index];
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
    DELETE as deleteBookItem,
    GET as getBookItemById,
    PUT as updateBookItem,
} from '@/app/api/book-items/[id]/route';
import { POST as createBookItem, GET as getBookItems } from '@/app/api/book-items/route';

async function runWithRollback<T>(action: () => Promise<T>): Promise<T> {
  const snapshot = structuredClone(testState.db);
  try {
    return await action();
  } finally {
    testState.db = snapshot;
  }
}

describe('Book Copy backend CRUD with CheckDB and Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.db = structuredClone(testState.seed);
  });

  // Test Case ID: TC_UT_BE_BOOKCOPY_001
  it('reads book copies list with filters', async () => {
    const response = await getBookItems({
      url: 'http://localhost/api/book-items?page=1&limit=10&search=CP&bookIds=10&statuses=AVAILABLE',
    } as any);

    expect(prismaMock.bookItem.findMany).toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.data.pagination.total).toBeGreaterThan(0);
  });

  // Test Case ID: TC_UT_BE_BOOKCOPY_002
  it('creates book copy and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    const response = await runWithRollback(async () => {
      const created = await createBookItem({
        json: async () => ({
          bookId: 10,
          code: 'CP-NEW',
          condition: 'GOOD',
          status: 'AVAILABLE',
        }),
      } as any);

      expect(testState.db.bookItems.some(item => item.code === 'CP-NEW')).toBe(true); // CheckDB
      return created;
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_BOOKCOPY_003
  it('gets book copy by id', async () => {
    const response = await getBookItemById({} as any, {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.success).toBe(true);
    expect(response.data.id).toBe(1);
  });

  // Test Case ID: TC_UT_BE_BOOKCOPY_004
  it('updates book copy and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    await runWithRollback(async () => {
      await updateBookItem(
        {
          json: async () => ({ status: 'MAINTENANCE' }),
        } as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      expect(testState.db.bookItems.find(item => item.id === 1)?.status).toBe('MAINTENANCE'); // CheckDB
    });

    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_BOOKCOPY_005
  it('soft deletes book copy and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    await runWithRollback(async () => {
      await deleteBookItem({} as any, { params: Promise.resolve({ id: '1' }) } as any);

      expect(testState.db.bookItems.find(item => item.id === 1)?.isDeleted).toBe(true); // CheckDB
    });

    expect(testState.db).toEqual(before); // Rollback
  });
});
