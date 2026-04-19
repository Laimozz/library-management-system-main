import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const seed = {
    books: [
      {
        id: 101,
        title: 'Clean Code',
        isbn: '9780132350884',
        publishYear: 2008,
        publisher: 'Prentice Hall',
        pageCount: 464,
        price: 200000,
        edition: '1st',
        description: 'A handbook of agile software craftsmanship',
        coverImageUrl: null,
        language: 'en',
        isDeleted: false,
        author: {
          id: 1,
          fullName: 'Robert C. Martin',
        },
        bookEditions: [
          { id: 1, format: 'EBOOK' },
          { id: 2, format: 'AUDIO' },
        ],
        _count: {
          bookItems: 3,
        },
        bookCategories: [
          { category: { name: 'Software' } },
          { category: { name: 'Programming' } },
        ],
        reviews: [{ rating: 4 }, { rating: 5 }],
      },
      {
        id: 102,
        title: 'Refactoring',
        isbn: '9780134757599',
        publishYear: 2018,
        publisher: 'Addison-Wesley',
        pageCount: 448,
        price: 250000,
        edition: '2nd',
        description: 'Improving the design of existing code',
        coverImageUrl: null,
        language: 'en',
        isDeleted: false,
        author: {
          id: 2,
          fullName: 'Martin Fowler',
        },
        bookEditions: [{ id: 3, format: 'EBOOK' }],
        _count: {
          bookItems: 2,
        },
        bookCategories: [{ category: { name: 'Software' } }],
        reviews: [{ rating: 5 }],
      },
    ],
    favorites: [
      {
        userId: 1,
        bookId: 101,
        isDeleted: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
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
  parseIntParam: vi.fn((param: string | null, defaultValue = 0) => {
    if (!param) return defaultValue;
    const parsed = Number.parseInt(param, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }),
  parsePaginationParams: vi.fn((searchParams: URLSearchParams) => ({
    page: Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10)),
    limit: Math.max(1, Number.parseInt(searchParams.get('limit') || '10', 10)),
    search: searchParams.get('search') || '',
  })),
  validateRequiredFields: vi.fn((data: Record<string, unknown>, required: string[]) => {
    for (const field of required) {
      if (!data[field] || (typeof data[field] === 'string' && data[field]!.toString().trim() === '')) {
        return `Missing required field: ${field}`;
      }
    }
    return null;
  }),
}));

const gorseMock = vi.hoisted(() => ({
  createFeedback: vi.fn((userId: number, itemId: number, feedbackType: string, payload: any) => ({
    userId,
    itemId,
    feedbackType,
    payload,
  })),
  insertFeedback: vi.fn(async () => undefined),
}));

function filterFavorites(where: any) {
  const rows = testState.db.favorites.filter(favorite => {
    if (where?.userId !== undefined && favorite.userId !== where.userId) return false;
    if (where?.isDeleted !== undefined && favorite.isDeleted !== where.isDeleted) return false;

    const book = testState.db.books.find(item => item.id === favorite.bookId);
    if (!book) return false;

    if (where?.book?.isDeleted !== undefined && book.isDeleted !== where.book.isDeleted) {
      return false;
    }

    const searchConditions = where?.book?.OR;
    if (Array.isArray(searchConditions) && searchConditions.length > 0) {
      const titleContains = searchConditions[0]?.title?.contains || '';
      const isbnContains = searchConditions[1]?.isbn?.contains || '';
      const authorContains = searchConditions[2]?.author?.fullName?.contains || '';
      const matched =
        book.title.includes(titleContains) ||
        (book.isbn || '').includes(isbnContains) ||
        (book.author.fullName || '').includes(authorContains);

      if (!matched) return false;
    }

    return true;
  });

  return rows.map(favorite => ({
    ...favorite,
    book: testState.db.books.find(book => book.id === favorite.bookId)!,
  }));
}

function sortFavorites(rows: any[], orderBy: any) {
  if (!orderBy?.book && !orderBy?.createdAt) {
    return rows;
  }

  const sorted = [...rows];
  const getDirection = (direction: string) => (direction === 'asc' ? 1 : -1);

  sorted.sort((a, b) => {
    if (orderBy?.createdAt) {
      const direction = getDirection(orderBy.createdAt);
      return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
    }

    if (orderBy?.book?.title) {
      const direction = getDirection(orderBy.book.title);
      return a.book.title.localeCompare(b.book.title) * direction;
    }

    if (orderBy?.book?.publishYear) {
      const direction = getDirection(orderBy.book.publishYear);
      return ((a.book.publishYear || 0) - (b.book.publishYear || 0)) * direction;
    }

    if (orderBy?.book?.author?.fullName) {
      const direction = getDirection(orderBy.book.author.fullName);
      return a.book.author.fullName.localeCompare(b.book.author.fullName) * direction;
    }

    return 0;
  });

  return sorted;
}

const prismaMock = vi.hoisted(() => ({
  book: {
    findUnique: vi.fn(async ({ where }: any) => {
      return (
        testState.db.books.find(book => {
          if (where?.id !== undefined && book.id !== where.id) return false;
          if (where?.isDeleted !== undefined && book.isDeleted !== where.isDeleted) return false;
          return true;
        }) || null
      );
    }),
  },
  userFavoriteBook: {
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where?.userId_bookId;
      if (!key) return null;
      return (
        testState.db.favorites.find(
          favorite => favorite.userId === key.userId && favorite.bookId === key.bookId
        ) || null
      );
    }),
    findMany: vi.fn(async ({ where, skip = 0, take, orderBy }: any) => {
      const rows = sortFavorites(filterFavorites(where), orderBy);
      const size = take ?? rows.length;
      return rows.slice(skip, skip + size);
    }),
    count: vi.fn(async ({ where }: any) => {
      return filterFavorites(where).length;
    }),
    create: vi.fn(async ({ data }: any) => {
      const now = new Date();
      const created = {
        userId: data.userId,
        bookId: data.bookId,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      testState.db.favorites.push(created);
      return created;
    }),
    delete: vi.fn(async ({ where }: any) => {
      const key = where.userId_bookId;
      const index = testState.db.favorites.findIndex(
        favorite => favorite.userId === key.userId && favorite.bookId === key.bookId
      );
      if (index < 0) {
        throw new Error('Favorite not found');
      }
      const [deleted] = testState.db.favorites.splice(index, 1);
      return deleted;
    }),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/utils', () => ({
  handleRouteError: mocks.handleRouteError,
  parseIntParam: mocks.parseIntParam,
  parsePaginationParams: mocks.parsePaginationParams,
  successResponse: mocks.successResponse,
  validateRequiredFields: mocks.validateRequiredFields,
}));

vi.mock('@/middleware/auth.middleware', () => ({
  requireAuth: (handler: unknown) => handler,
}));

vi.mock('@/services/gorse.service', () => ({
  GorseService: gorseMock,
}));

import { DELETE as deleteFavoriteBook, GET as getFavoriteBooks, POST as createFavoriteBook } from '@/app/api/favorite-books/route';

async function runWithRollback<T>(action: () => Promise<T>): Promise<T> {
  const snapshot = structuredClone(testState.db);
  try {
    return await action();
  } finally {
    testState.db = snapshot;
  }
}

describe('Favorite books backend CRUD with CheckDB and Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.db = structuredClone(testState.seed);
  });

  // Test Case ID: TC_UT_BE_FAVORITE_001
  it('reads favorite books list with filters and transformed fields', async () => {
    const response = await getFavoriteBooks({
      url: 'http://localhost/api/favorite-books?page=1&limit=10&search=Clean',
      user: { id: 1 },
    } as any);

    expect(prismaMock.userFavoriteBook.findMany).toHaveBeenCalled();
    expect(response.success).toBe(true);
    expect(response.data.favoriteBooks.length).toBe(1);
    expect(response.data.favoriteBooks[0].book.averageRating).toBe(4.5);
    expect(response.data.favoriteBooks[0].book.categories).toContain('Software');
    expect(response.data.pagination.total).toBe(1);
  });

  // Test Case ID: TC_UT_BE_FAVORITE_002
  it('checks favorite status by bookId', async () => {
    const response = await getFavoriteBooks({
      url: 'http://localhost/api/favorite-books?bookId=101',
      user: { id: 1 },
    } as any);

    expect(response.success).toBe(true);
    expect(response.data.isFavorite).toBe(true);
  });

  // Test Case ID: TC_UT_BE_FAVORITE_003
  it('creates favorite book and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    const response = await runWithRollback(async () => {
      const created = await createFavoriteBook({
        json: async () => ({ bookId: 102 }),
        user: { id: 1 },
      } as any);

      const exists = testState.db.favorites.some(
        favorite => favorite.userId === 1 && favorite.bookId === 102
      );
      expect(exists).toBe(true); // CheckDB
      return created;
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(gorseMock.insertFeedback).toHaveBeenCalled();
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_FAVORITE_004
  it('deletes favorite book and rolls back DB state after test', async () => {
    const before = structuredClone(testState.db);

    const response = await runWithRollback(async () => {
      const deleted = await deleteFavoriteBook({
        json: async () => ({ bookId: 101 }),
        user: { id: 1 },
      } as any);

      const exists = testState.db.favorites.some(
        favorite => favorite.userId === 1 && favorite.bookId === 101
      );
      expect(exists).toBe(false); // CheckDB
      return deleted;
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe(200);
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_BE_FAVORITE_005
  it('returns handled error when bookId is invalid in status check', async () => {
    const response = await getFavoriteBooks({
      url: 'http://localhost/api/favorite-books?bookId=invalid',
      user: { id: 1 },
    } as any);

    expect(mocks.handleRouteError).toHaveBeenCalled();
    expect(response.success).toBe(false);
  });
});
