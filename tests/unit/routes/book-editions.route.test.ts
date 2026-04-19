import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const seed = {
    books: [{ id: 1, isDeleted: false, title: 'Book One' }],
    editions: [
      {
        id: 1,
        bookId: 1,
        format: 'EBOOK',
        isbn13: '9780000000001',
        fileFormat: 'EPUB',
        fileSizeBytes: BigInt(1024),
        checksumSha256: 'abc123',
        storageUrl: '/api/files/uploads/ebooks/seed.epub',
        drmType: 'NONE',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        isDeleted: false,
      },
    ],
    nextId: 2,
  };

  return {
    seed,
    db: {
      books: structuredClone(seed.books),
      editions: structuredClone(seed.editions),
      nextId: seed.nextId,
    },
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
  parseIntParam: vi.fn((param: string | null, defaultValue = 0) => {
    if (!param) return defaultValue;
    const parsed = Number.parseInt(param, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }),
  sanitizeString: vi.fn((input: string) => input.trim().replace(/[<>]/g, '')),
  parsePaginationParams: vi.fn(() => ({ page: 1, limit: 10, search: '' })),
  validateRequiredFields: vi.fn((data: Record<string, unknown>, required: string[]) => {
    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        return `Missing required field: ${field}`;
      }
    }
    return null;
  }),
}));

const prismaMock = vi.hoisted(() => ({
  book: {
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        testState.db.books.find(book => {
          if (where?.id !== undefined && book.id !== where.id) return false;
          if (where?.isDeleted !== undefined && book.isDeleted !== where.isDeleted) return false;
          return true;
        }) || null
      );
    }),
  },
  bookEdition: {
    findMany: vi.fn(async ({ where }: any) => {
      const ids = where?.id?.in as number[] | undefined;
      const rows = testState.db.editions.filter(edition => {
        if (where?.isDeleted !== undefined && edition.isDeleted !== where.isDeleted) return false;
        if (ids && !ids.includes(edition.id)) return false;
        return true;
      });
      return rows.map(edition => ({
        ...edition,
        book: { id: edition.bookId, title: `Book ${edition.bookId}` },
      }));
    }),
    count: vi.fn(async ({ where }: any) => {
      return testState.db.editions.filter(edition => {
        if (where?.isDeleted !== undefined && edition.isDeleted !== where.isDeleted) return false;
        return true;
      }).length;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        testState.db.editions.find(edition => {
          if (where?.id !== undefined && edition.id !== where.id) return false;
          if (where?.isDeleted !== undefined && edition.isDeleted !== where.isDeleted) return false;
          return true;
        }) || null
      );
    }),
    create: vi.fn(async ({ data }: any) => {
      const now = new Date();
      const created = {
        id: testState.db.nextId++,
        bookId: data.bookId,
        format: data.format,
        isbn13: data.isbn13,
        fileFormat: data.fileFormat,
        fileSizeBytes: data.fileSizeBytes,
        checksumSha256: data.checksumSha256,
        storageUrl: data.storageUrl,
        drmType: data.drmType,
        status: data.status,
        createdAt: now,
        updatedAt: now,
        isDeleted: Boolean(data.isDeleted),
      };
      testState.db.editions.push(created);
      return created;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.editions.findIndex(edition => edition.id === where.id);
      if (index < 0) throw new Error('Edition not found');
      testState.db.editions[index] = {
        ...testState.db.editions[index],
        ...data,
        updatedAt: new Date(),
      };
      return testState.db.editions[index];
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const ids = where?.id?.in as number[];
      let count = 0;
      testState.db.editions = testState.db.editions.map(edition => {
        if (!ids.includes(edition.id)) return edition;
        count += 1;
        return { ...edition, ...data, updatedAt: new Date() };
      });
      return { count };
    }),
  },
}));

const fileUtilsMock = vi.hoisted(() => ({
  writeFileToSystem: vi.fn(async () => ({ success: true, message: 'ok' })),
  deleteFileFromSystem: vi.fn(async () => ({ success: true, message: 'deleted' })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/server-utils', () => ({
  FileUtils: fileUtilsMock,
}));

vi.mock('@/lib/utils', () => ({
  handleRouteError: mocks.handleRouteError,
  parseIntParam: mocks.parseIntParam,
  parsePaginationParams: mocks.parsePaginationParams,
  sanitizeString: mocks.sanitizeString,
  successResponse: mocks.successResponse,
  validateRequiredFields: mocks.validateRequiredFields,
}));

vi.mock('@/middleware/auth.middleware', () => ({
  requireLibrarian: (handler: unknown) => handler,
  requireAdmin: (handler: unknown) => handler,
}));

import { GET as getEditionById, PATCH as updateEdition } from '@/app/api/book-editions/[id]/route';
import { DELETE as bulkDeleteEditions } from '@/app/api/book-editions/bulk-delete/route';
import { POST as createEdition, GET as listEditions } from '@/app/api/book-editions/route';

function resetEditionState() {
  testState.db = {
    books: structuredClone(testState.seed.books),
    editions: structuredClone(testState.seed.editions),
    nextId: testState.seed.nextId,
  };
}

async function runWithRollback<T>(action: () => Promise<T>): Promise<T> {
  const snapshot = {
    books: structuredClone(testState.db.books),
    editions: structuredClone(testState.db.editions),
    nextId: testState.db.nextId,
  };

  try {
    return await action();
  } finally {
    testState.db = snapshot;
  }
}

function buildFormData(values: Record<string, unknown>) {
  return {
    get: (key: string) => (key in values ? (values[key] as any) : null),
  };
}

function buildFakeFile(name: string, content: string) {
  return {
    name,
    size: Buffer.byteLength(content),
    arrayBuffer: async () => {
      const bytes = new TextEncoder().encode(content);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

describe('Book editions backend CRUD with CheckDB and Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEditionState();
  });

  // Test Case ID: TC_UT_BE_EBOOK_001
  it('creates edition and rolls back DB state', async () => {
    const before = structuredClone(testState.db.editions);

    const response = await runWithRollback(async () => {
      const created = await createEdition({
        headers: { get: () => 'multipart/form-data; boundary=test' },
        formData: async () =>
          buildFormData({
            bookId: '1',
            format: 'EBOOK',
            isbn13: '9781111111111',
            fileFormat: 'EPUB',
            drmType: 'NONE',
            status: 'ACTIVE',
            file: buildFakeFile('sample.epub', 'ebook-content'),
          }),
      } as any);

      expect(testState.db.editions.some(edition => edition.isbn13 === '9781111111111')).toBe(true); // CheckDB
      return created;
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(testState.db.editions).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_EBOOK_002
  it('reads edition by id', async () => {
    const response = await getEditionById({} as any, {
      params: Promise.resolve({ id: '1' }),
    } as any);

    expect(response.success).toBe(true);
    expect(response.data.id).toBe(1);
    expect(response.data.fileSizeBytes).toBe('1024');
  });

  // Test Case ID: TC_UT_BE_EBOOK_003
  it('updates edition and rolls back DB state', async () => {
    const before = structuredClone(testState.db.editions);

    await runWithRollback(async () => {
      await updateEdition(
        {
          headers: { get: () => 'multipart/form-data; boundary=test' },
          formData: async () =>
            buildFormData({
              status: 'INACTIVE',
              isbn13: '9782222222222',
            }),
        } as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      const updated = testState.db.editions.find(edition => edition.id === 1);
      expect(updated?.status).toBe('INACTIVE'); // CheckDB
      expect(updated?.isbn13).toBe('9782222222222'); // CheckDB
    });

    expect(testState.db.editions).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_EBOOK_004
  it('bulk soft deletes editions and rolls back DB state', async () => {
    const before = structuredClone(testState.db.editions);

    await runWithRollback(async () => {
      const response = await bulkDeleteEditions({
        json: async () => ({ ids: [1] }),
      } as any);

      expect(response.success).toBe(true);
      expect(testState.db.editions.find(edition => edition.id === 1)?.isDeleted).toBe(true); // CheckDB
      expect(fileUtilsMock.deleteFileFromSystem).toHaveBeenCalled();
    });

    expect(testState.db.editions).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_EBOOK_005
  it('lists editions with pagination response structure', async () => {
    const response = await listEditions({
      url: 'http://localhost/api/book-editions?page=1&limit=10',
    } as any);

    expect(response.success).toBe(true);
    expect(Array.isArray(response.data.editions)).toBe(true);
    expect(response.data.pagination.total).toBeGreaterThanOrEqual(1);
  });
});
