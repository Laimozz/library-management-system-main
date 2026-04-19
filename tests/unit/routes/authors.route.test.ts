import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const seed = {
    authors: [
      {
        id: 1,
        fullName: 'Author One',
        bio: 'Bio one',
        birthDate: null,
        nationality: 'VN',
        isDeleted: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 2,
        fullName: 'Deleted Author',
        bio: null,
        birthDate: null,
        nationality: 'US',
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
  author: {
    findMany: vi.fn(async (args: any) => {
      const where = args?.where || {};
      const rows = testState.db.authors.filter(author => {
        if (typeof where.isDeleted === 'boolean' && author.isDeleted !== where.isDeleted) {
          return false;
        }
        if (where.OR && Array.isArray(where.OR)) {
          const fullNameContains = where.OR[0]?.fullName?.contains || '';
          const nationalityContains = where.OR[1]?.nationality?.contains || '';
          return (
            author.fullName.includes(fullNameContains) ||
            (author.nationality || '').includes(nationalityContains)
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
      return testState.db.authors.filter(author => {
        if (typeof where.isDeleted === 'boolean') {
          return author.isDeleted === where.isDeleted;
        }
        return true;
      }).length;
    }),
    create: vi.fn(async ({ data }: any) => {
      const now = new Date();
      const created = {
        id: testState.db.nextId++,
        fullName: data.fullName,
        bio: data.bio ?? null,
        birthDate: data.birthDate ?? null,
        nationality: data.nationality ?? null,
        isDeleted: Boolean(data.isDeleted),
        createdAt: now,
        updatedAt: now,
      };
      testState.db.authors.push(created);
      return created;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        testState.db.authors.find(author => {
          if (where?.id !== undefined && author.id !== where.id) return false;
          if (where?.isDeleted !== undefined && author.isDeleted !== where.isDeleted) return false;
          return true;
        }) || null
      );
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.authors.findIndex(author => author.id === where.id);
      if (index < 0) {
        throw new Error('Author not found');
      }
      testState.db.authors[index] = {
        ...testState.db.authors[index],
        ...data,
        updatedAt: new Date(),
      };
      return testState.db.authors[index];
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
    DELETE as deleteAuthor,
    GET as getAuthorById,
    PUT as updateAuthor,
} from '@/app/api/authors/[id]/route';
import { POST as createAuthor, GET as getAuthors } from '@/app/api/authors/route';

async function runWithRollback<T>(action: () => Promise<T>): Promise<T> {
  const snapshot = structuredClone(testState.db);
  try {
    return await action();
  } finally {
    testState.db = snapshot;
  }
}

describe('Authors backend CRUD with CheckDB and Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.db = structuredClone(testState.seed);
  });

  // Test Case ID: TC_UT_BE_AUTHOR_001
  it('reads authors list with filter parameters', async () => {
    const response = await getAuthors({
      url: 'http://localhost/api/authors?page=1&limit=5&search=Author&isDeleted=false',
    } as any);

    expect(prismaMock.author.findMany).toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.data.pagination.page).toBe(1);
  });

  // Test Case ID: TC_UT_BE_AUTHOR_002
  it('creates author and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    const response = await runWithRollback(async () => {
      const created = await createAuthor({
        json: async () => ({
          fullName: 'New Author',
          bio: 'New bio',
          nationality: 'JP',
        }),
      } as any);

      const exists = testState.db.authors.some(author => author.fullName === 'New Author');
      expect(exists).toBe(true); // CheckDB
      return created;
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_AUTHOR_003
  it('gets author by id', async () => {
    const response = await getAuthorById({} as any, {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.success).toBe(true);
    expect(response.data.id).toBe(1);
  });

  // Test Case ID: TC_UT_BE_AUTHOR_004
  it('updates author and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    await runWithRollback(async () => {
      await updateAuthor(
        {
          json: async () => ({
            fullName: 'Updated Author Name',
          }),
        } as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      expect(testState.db.authors.find(author => author.id === 1)?.fullName).toBe(
        'Updated Author Name'
      ); // CheckDB
    });

    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_AUTHOR_005
  it('soft deletes author and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    await runWithRollback(async () => {
      await deleteAuthor({} as any, { params: Promise.resolve({ id: '1' }) } as any);

      expect(testState.db.authors.find(author => author.id === 1)?.isDeleted).toBe(true); // CheckDB
    });

    expect(testState.db).toEqual(before); // Rollback
  });
});
