import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const seed = {
    books: [
      {
        id: 1,
        authorId: 1,
        title: 'Initial Book',
        isbn: '9780000000001',
        publishYear: 2024,
        publisher: 'PTIT Press',
        pageCount: 200,
        price: 10,
        edition: '1st',
        description: 'Initial description',
        coverImageUrl: null,
        language: 'en',
        subtitle: null,
        isDeleted: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    authors: [{ id: 1, fullName: 'Author One' }],
    categoriesByBookId: new Map<number, number[]>([[1, [10]]]),
    categoryNamesById: new Map<number, string>([[10, 'Software']]),
    bookItemsByBookId: new Map<number, number>([[1, 2]]),
    bookEditionsByBookId: new Map<number, Array<{ id: number; format: 'EBOOK' | 'AUDIO' }>>([
      [1, [{ id: 11, format: 'EBOOK' }]],
    ]),
    nextId: 2,
  };

  return {
    seed,
    db: {
      books: structuredClone(seed.books),
      authors: structuredClone(seed.authors),
      categoriesByBookId: new Map(seed.categoriesByBookId),
      categoryNamesById: new Map(seed.categoryNamesById),
      bookItemsByBookId: new Map(seed.bookItemsByBookId),
      bookEditionsByBookId: new Map(seed.bookEditionsByBookId),
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
    create: vi.fn(async ({ data }: any) => {
      const now = new Date();
      const created = {
        id: testState.db.nextId++,
        authorId: data.authorId,
        title: data.title,
        isbn: data.isbn ?? null,
        publishYear: data.publishYear ?? null,
        publisher: data.publisher ?? null,
        pageCount: data.pageCount ?? null,
        price: data.price ?? null,
        edition: data.edition ?? null,
        description: data.description ?? null,
        coverImageUrl: data.coverImageUrl ?? null,
        language: data.language ?? null,
        subtitle: null,
        isDeleted: Boolean(data.isDeleted),
        createdAt: now,
        updatedAt: now,
      };
      testState.db.books.push(created);
      if (data.bookCategories?.create) {
        const categoryIds = data.bookCategories.create.map((x: any) => x.categoryId);
        testState.db.categoriesByBookId.set(created.id, categoryIds);
      }
      return created;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      const book = testState.db.books.find(item => item.id === where.id);
      if (!book) return null;
      return {
        id: book.id,
        description: book.description,
        language: book.language,
        subtitle: book.subtitle,
        createdAt: book.createdAt,
        author: {
          fullName: testState.db.authors.find(author => author.id === book.authorId)?.fullName || '',
        },
        bookCategories: (testState.db.categoriesByBookId.get(book.id) || []).map(categoryId => ({
          category: {
            name: testState.db.categoryNamesById.get(categoryId) || 'Unknown',
          },
        })),
      };
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      const book =
        testState.db.books.find(item => {
          if (where?.id !== undefined && item.id !== where.id) return false;
          if (where?.isDeleted !== undefined && item.isDeleted !== where.isDeleted) return false;
          return true;
        }) || null;

      if (!book) return null;

      return {
        ...book,
        author: {
          id: book.authorId,
          fullName: testState.db.authors.find(author => author.id === book.authorId)?.fullName || '',
        },
        bookItems: Array.from({ length: testState.db.bookItemsByBookId.get(book.id) || 0 }).map(
          (_, index) => ({
            id: index + 1,
            code: `CP-${index + 1}`,
            condition: 'GOOD',
            status: 'AVAILABLE',
            acquisitionDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            isDeleted: false,
          })
        ),
        bookCategories: (testState.db.categoriesByBookId.get(book.id) || []).map(categoryId => ({
          categoryId,
          category: {
            name: testState.db.categoryNamesById.get(categoryId) || 'Unknown',
          },
        })),
        bookEditions: testState.db.bookEditionsByBookId.get(book.id) || [],
      };
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.books.findIndex(book => book.id === where.id);
      if (index < 0) throw new Error('Book not found');

      testState.db.books[index] = {
        ...testState.db.books[index],
        ...data,
        updatedAt: new Date(),
      };
      return testState.db.books[index];
    }),
  },
  bookCategory: {
    deleteMany: vi.fn(async ({ where }: any) => {
      testState.db.categoriesByBookId.delete(where.bookId);
      return { count: 1 };
    }),
  },
}));

const gorseMock = vi.hoisted(() => ({
  createItemPayload: vi.fn(() => ({ ItemId: 'book_1' })),
  insertItem: vi.fn(async () => undefined),
  createFeedback: vi.fn(() => ({})),
  insertFeedback: vi.fn(async () => undefined),
}));

const qdrantMock = vi.hoisted(() => ({
  syncBookToQdrantNonBlocking: vi.fn(),
  removeBookFromQdrantNonBlocking: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/utils', () => ({
  handleRouteError: mocks.handleRouteError,
  parseIntParam: mocks.parseIntParam,
  sanitizeString: mocks.sanitizeString,
  successResponse: mocks.successResponse,
  validateRequiredFields: mocks.validateRequiredFields,
  parsePaginationParams: vi.fn(),
}));

vi.mock('@/middleware/auth.middleware', () => ({
  requireLibrarian: (handler: unknown) => handler,
  optionalAuth: (handler: unknown) => handler,
}));

vi.mock('@/services/book.service', () => ({
  listBooks: vi.fn(),
  transformBookData: vi.fn((books: unknown) => books),
}));

vi.mock('@/services/gorse.service', () => ({
  GorseService: gorseMock,
}));

vi.mock('@/services/qdrant.service', () => ({
  qdrantService: qdrantMock,
}));

vi.mock('@/lib/server-utils', () => ({
  FileUtils: {
    writeFileToSystem: vi.fn(async () => ({ success: true })),
    deleteFileFromSystem: vi.fn(async () => ({ success: true })),
  },
}));

import { DELETE as deleteBook, GET as getBookById, PUT as updateBook } from '@/app/api/books/[id]/route';
import { POST as createBook } from '@/app/api/books/route';

function resetBookState() {
  testState.db = {
    books: structuredClone(testState.seed.books),
    authors: structuredClone(testState.seed.authors),
    categoriesByBookId: new Map(testState.seed.categoriesByBookId),
    categoryNamesById: new Map(testState.seed.categoryNamesById),
    bookItemsByBookId: new Map(testState.seed.bookItemsByBookId),
    bookEditionsByBookId: new Map(testState.seed.bookEditionsByBookId),
    nextId: testState.seed.nextId,
  };
}

async function runWithRollback<T>(action: () => Promise<T>): Promise<T> {
  const snapshot = {
    books: structuredClone(testState.db.books),
    authors: structuredClone(testState.db.authors),
    categoriesByBookId: new Map(testState.db.categoriesByBookId),
    categoryNamesById: new Map(testState.db.categoryNamesById),
    bookItemsByBookId: new Map(testState.db.bookItemsByBookId),
    bookEditionsByBookId: new Map(testState.db.bookEditionsByBookId),
    nextId: testState.db.nextId,
  };

  try {
    return await action();
  } finally {
    testState.db = snapshot;
  }
}

describe('Books backend CRUD with CheckDB and Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBookState();
  });

  // Test Case ID: TC_UT_BE_BOOK_001
  it('creates book from JSON request and rolls back DB state', async () => {
    const before = structuredClone(testState.db.books);

    const response = await runWithRollback(async () => {
      const created = await createBook({
        headers: { get: () => 'application/json' },
        json: async () => ({
          authorId: 1,
          title: 'New Created Book',
          isbn: '9781234567890',
          categories: [10],
        }),
      } as any);

      expect(testState.db.books.some(book => book.title === 'New Created Book')).toBe(true); // CheckDB
      return created;
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(testState.db.books).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_BOOK_002
  it('reads book detail by id', async () => {
    const response = await getBookById({ user: undefined } as any, {
      params: Promise.resolve({ id: '1' }),
    } as any);

    expect(response.success).toBe(true);
    expect(response.data.id).toBe(1);
    expect(response.data.bookEbookCount).toBeGreaterThanOrEqual(0);
  });

  // Test Case ID: TC_UT_BE_BOOK_003
  it('updates book and rolls back DB state', async () => {
    const before = structuredClone(testState.db.books);

    await runWithRollback(async () => {
      await updateBook(
        {
          headers: { get: () => 'application/json' },
          json: async () => ({ title: 'Updated Backend Book' }),
        } as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      expect(testState.db.books.find(book => book.id === 1)?.title).toBe('Updated Backend Book'); // CheckDB
    });

    expect(testState.db.books).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_BOOK_004
  it('soft deletes book and rolls back DB state', async () => {
    const before = structuredClone(testState.db.books);

    await runWithRollback(async () => {
      await deleteBook({} as any, { params: Promise.resolve({ id: '1' }) } as any);

      expect(testState.db.books.find(book => book.id === 1)?.isDeleted).toBe(true); // CheckDB
      expect(qdrantMock.removeBookFromQdrantNonBlocking).toHaveBeenCalledWith(1);
    });

    expect(testState.db.books).toEqual(before); // Rollback
  });
});
