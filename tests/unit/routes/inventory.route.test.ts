import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMockDbWithRollback } from '../db-evidence';

type BookRow = {
  id: number;
  authorId: number;
  title: string;
  isbn: string | null;
  publishYear: number | null;
  publisher: string | null;
  pageCount: number | null;
  price: number | null;
  edition: string | null;
  description: string | null;
  coverImageUrl: string | null;
  language: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
};

type BookItemRow = {
  id: number;
  bookId: number;
  code: string;
  condition: string;
  status: string;
  acquisitionDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
};

type BookEditionRow = {
  id: number;
  bookId: number;
  format: string;
  isbn13: string | null;
  fileFormat: string;
  fileSizeBytes: bigint | null;
  checksumSha256: string | null;
  storageUrl: string;
  drmType: string;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
};

const testState = vi.hoisted(() => {
  const now = new Date('2026-05-09T00:00:00.000Z');
  const seed = {
    authors: [{ id: 1, fullName: 'Author One' }],
    categories: [
      { id: 1, name: 'Software' },
      { id: 2, name: 'Architecture' },
      { id: 3, name: 'Testing' },
    ],
    books: [
      {
        id: 10,
        authorId: 1,
        title: 'Clean Code',
        isbn: '9780132350884',
        publishYear: 2008,
        publisher: 'Prentice Hall',
        pageCount: 464,
        price: 25,
        edition: '1',
        description: 'Software craftsmanship',
        coverImageUrl: null,
        language: 'en',
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      },
      {
        id: 11,
        authorId: 1,
        title: 'Deleted Book',
        isbn: null,
        publishYear: null,
        publisher: null,
        pageCount: null,
        price: null,
        edition: null,
        description: null,
        coverImageUrl: null,
        language: null,
        createdAt: now,
        updatedAt: now,
        isDeleted: true,
      },
    ] as BookRow[],
    bookCategories: [
      { bookId: 10, categoryId: 1, isDeleted: false },
      { bookId: 10, categoryId: 2, isDeleted: false },
    ],
    bookItems: [
      {
        id: 1,
        bookId: 10,
        code: 'CP-001',
        condition: 'GOOD',
        status: 'AVAILABLE',
        acquisitionDate: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      },
      {
        id: 2,
        bookId: 10,
        code: 'CP-002',
        condition: 'GOOD',
        status: 'AVAILABLE',
        acquisitionDate: new Date('2026-01-02T00:00:00.000Z'),
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      },
      {
        id: 3,
        bookId: 10,
        code: 'CP-003',
        condition: 'WORN',
        status: 'ON_BORROW',
        acquisitionDate: new Date('2026-01-03T00:00:00.000Z'),
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      },
    ] as BookItemRow[],
    bookEditions: [
      {
        id: 1,
        bookId: 10,
        format: 'EBOOK',
        isbn13: '9780000000001',
        fileFormat: 'PDF',
        fileSizeBytes: BigInt(1024),
        checksumSha256: 'old-checksum',
        storageUrl: '/api/files/uploads/ebooks/old.pdf',
        drmType: 'NONE',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      },
    ] as BookEditionRow[],
    borrowRequestItems: [{ bookId: 10, quantity: 1, borrowRequest: { status: 'APPROVED', isDeleted: false } }],
    nextBookId: 12,
    nextBookItemId: 4,
    nextEditionId: 2,
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
    limit: Math.max(1, Math.min(100, Number.parseInt(searchParams.get('limit') || '10', 10))),
    search: searchParams.get('search') || '',
    skip: Math.max(0, (Number.parseInt(searchParams.get('page') || '1', 10) - 1) * Number.parseInt(searchParams.get('limit') || '10', 10)),
  })),
  parseIntParam: vi.fn((param: string | null, defaultValue = 0) => {
    if (!param) return defaultValue;
    const parsed = Number.parseInt(param, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }),
  sanitizeString: vi.fn((input: string) => input.trim().replace(/[<>]/g, '')),
  validateRequiredFields: vi.fn((data: Record<string, unknown>, required: string[]) => {
    for (const field of required) {
      const value = data[field];
      if (!value || (typeof value === 'string' && value.trim() === '')) return `Missing required field: ${field}`;
    }
    return null;
  }),
}));

function getBookDetail(book: BookRow) {
  return {
    ...book,
    author: testState.db.authors.find(author => author.id === book.authorId),
    bookItems: testState.db.bookItems.filter(item => item.bookId === book.id && !item.isDeleted),
    bookCategories: testState.db.bookCategories
      .filter(link => link.bookId === book.id && !link.isDeleted)
      .map(link => ({ categoryId: link.categoryId, category: testState.db.categories.find(category => category.id === link.categoryId) })),
    bookEditions: testState.db.bookEditions.filter(edition => edition.bookId === book.id && !edition.isDeleted),
    reviews: [],
    _count: { bookItems: testState.db.bookItems.filter(item => item.bookId === book.id && !item.isDeleted).length },
  };
}

function filterBooks(where: any = {}) {
  return testState.db.books.filter(book => {
    if (typeof where.id === 'number' && book.id !== where.id) return false;
    if (typeof where.isDeleted === 'boolean' && book.isDeleted !== where.isDeleted) return false;
    if (where.authorId?.in && !where.authorId.in.includes(book.authorId)) return false;
    if (where.language?.in && !where.language.in.includes(book.language)) return false;
    if (where.publishYear?.gte && (!book.publishYear || book.publishYear < where.publishYear.gte)) return false;
    if (where.publishYear?.lte && (!book.publishYear || book.publishYear > where.publishYear.lte)) return false;
    if (where.bookCategories?.some?.categoryId?.in) {
      const ids = where.bookCategories.some.categoryId.in;
      if (!testState.db.bookCategories.some(link => link.bookId === book.id && ids.includes(link.categoryId))) return false;
    }
    if (where.bookItems?.some?.status === 'AVAILABLE') {
      if (!testState.db.bookItems.some(item => item.bookId === book.id && item.status === 'AVAILABLE' && !item.isDeleted)) return false;
    }
    if (where.bookEditions?.some?.format === 'EBOOK') {
      if (!testState.db.bookEditions.some(edition => edition.bookId === book.id && edition.format === 'EBOOK' && !edition.isDeleted)) return false;
    }
    return true;
  });
}

const prismaMock = vi.hoisted(() => ({
  book: {
    findMany: vi.fn(async (args: any = {}) => {
      const rows = filterBooks(args.where).map(getBookDetail);
      return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length));
    }),
    count: vi.fn(async (args: any = {}) => filterBooks(args.where).length),
    findFirst: vi.fn(async ({ where }: any) => filterBooks(where)[0] || null),
    findUnique: vi.fn(async ({ where }: any) => {
      const book = testState.db.books.find(row => row.id === where.id);
      return book ? getBookDetail(book) : null;
    }),
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: testState.db.nextBookId++,
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
        isDeleted: Boolean(data.isDeleted),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      testState.db.books.push(created);
      for (const link of data.bookCategories?.create || []) {
        testState.db.bookCategories.push({ bookId: created.id, categoryId: link.categoryId, isDeleted: false });
      }
      return created;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.books.findIndex(book => book.id === where.id);
      if (index < 0) throw new Error('Book not found');
      testState.db.books[index] = {
        ...testState.db.books[index],
        ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'bookCategories')),
        updatedAt: new Date(),
      };
      if (data.bookCategories?.create) {
        for (const link of data.bookCategories.create) {
          testState.db.bookCategories.push({ bookId: where.id, categoryId: link.categoryId, isDeleted: false });
        }
      }
      return testState.db.books[index];
    }),
  },
  bookCategory: {
    deleteMany: vi.fn(async ({ where }: any) => {
      const before = testState.db.bookCategories.length;
      testState.db.bookCategories = testState.db.bookCategories.filter(link => link.bookId !== where.bookId);
      return { count: before - testState.db.bookCategories.length };
    }),
  },
  bookItem: {
    findMany: vi.fn(async (args: any = {}) => {
      const where = args.where || {};
      let rows = testState.db.bookItems.filter(item => {
        if (where.isDeleted !== undefined && item.isDeleted !== where.isDeleted) return false;
        if (where.bookId?.in && !where.bookId.in.includes(item.bookId)) return false;
        if (where.condition?.in && !where.condition.in.includes(item.condition)) return false;
        if (where.status?.in && !where.status.in.includes(item.status)) return false;
        if (where.code?.contains && !item.code.includes(where.code.contains)) return false;
        return true;
      });
      rows = rows.map(item => ({ ...item, book: getBookDetail(testState.db.books.find(book => book.id === item.bookId)!) }));
      return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length));
    }),
    count: vi.fn(async (args: any = {}) => {
      const where = args.where || {};
      return testState.db.bookItems.filter(item => {
        if (where.bookId !== undefined && item.bookId !== where.bookId) return false;
        if (where.status !== undefined && item.status !== where.status) return false;
        if (where.isDeleted !== undefined && item.isDeleted !== where.isDeleted) return false;
        return true;
      }).length;
    }),
    findUnique: vi.fn(async ({ where }: any) => testState.db.bookItems.find(item => item.code === where.code || item.id === where.id) || null),
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        testState.db.bookItems.find(item => {
          if (where.id?.not !== undefined && item.id === where.id.not) return false;
          if (typeof where.id === 'number' && item.id !== where.id) return false;
          if (where.isDeleted !== undefined && item.isDeleted !== where.isDeleted) return false;
          if (where.code !== undefined && item.code !== where.code) return false;
          return true;
        }) || null
      );
    }),
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: testState.db.nextBookItemId++,
        bookId: data.bookId,
        code: data.code,
        condition: data.condition,
        status: data.status,
        acquisitionDate: data.acquisitionDate ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: Boolean(data.isDeleted),
      };
      testState.db.bookItems.push(created);
      return created;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.bookItems.findIndex(item => item.id === where.id);
      if (index < 0) throw new Error('Book item not found');
      testState.db.bookItems[index] = { ...testState.db.bookItems[index], ...data, updatedAt: new Date() };
      return testState.db.bookItems[index];
    }),
  },
  bookEdition: {
    findMany: vi.fn(async (args: any = {}) => {
      const where = args.where || {};
      let rows = testState.db.bookEditions.filter(edition => {
        if (where.isDeleted !== undefined && edition.isDeleted !== where.isDeleted) return false;
        if (where.id?.in && !where.id.in.includes(edition.id)) return false;
        if (where.bookId?.in && !where.bookId.in.includes(edition.bookId)) return false;
        if (where.format && edition.format !== where.format) return false;
        if (where.fileFormat && edition.fileFormat !== where.fileFormat) return false;
        if (where.drmType && edition.drmType !== where.drmType) return false;
        if (where.status?.contains && !(edition.status || '').includes(where.status.contains)) return false;
        return true;
      });
      rows = rows.map(edition => ({ ...edition, book: { id: edition.bookId, title: `Book ${edition.bookId}` } }));
      return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length));
    }),
    count: vi.fn(async (args: any = {}) => {
      const rows = await prismaMock.bookEdition.findMany(args);
      return rows.length;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        testState.db.bookEditions.find(edition => {
          if (where.id !== undefined && edition.id !== where.id) return false;
          if (where.isDeleted !== undefined && edition.isDeleted !== where.isDeleted) return false;
          return true;
        }) || null
      );
    }),
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: testState.db.nextEditionId++,
        bookId: data.bookId,
        format: data.format,
        isbn13: data.isbn13 ?? null,
        fileFormat: data.fileFormat,
        fileSizeBytes: data.fileSizeBytes,
        checksumSha256: data.checksumSha256,
        storageUrl: data.storageUrl,
        drmType: data.drmType,
        status: data.status,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: Boolean(data.isDeleted),
      };
      testState.db.bookEditions.push(created);
      return created;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.bookEditions.findIndex(edition => edition.id === where.id);
      if (index < 0) throw new Error('Book edition not found');
      testState.db.bookEditions[index] = { ...testState.db.bookEditions[index], ...data, updatedAt: new Date() };
      return testState.db.bookEditions[index];
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0;
      testState.db.bookEditions = testState.db.bookEditions.map(edition => {
        if (!where.id.in.includes(edition.id)) return edition;
        count += 1;
        return { ...edition, ...data, updatedAt: new Date() };
      });
      return { count };
    }),
  },
  borrowRequestItem: {
    aggregate: vi.fn(async ({ where }: any) => {
      const quantity = testState.db.borrowRequestItems
        .filter(item => item.bookId === where.bookId && item.borrowRequest.status === 'APPROVED' && !item.borrowRequest.isDeleted)
        .reduce((sum, item) => sum + item.quantity, 0);
      return { _sum: { quantity } };
    }),
  },
}));

const fileUtilsMock = vi.hoisted(() => ({
  writeFileToSystem: vi.fn(async () => ({ success: true, message: 'ok' })),
  deleteFileFromSystem: vi.fn(async () => ({ success: true, message: 'deleted' })),
}));

const gorseMock = vi.hoisted(() => ({
  createItemPayload: vi.fn(data => ({ itemId: String(data.id) })),
  insertItem: vi.fn(async () => undefined),
}));

const qdrantMock = vi.hoisted(() => ({
  syncBookToQdrantNonBlocking: vi.fn(),
  removeBookFromQdrantNonBlocking: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/server-utils', () => ({ FileUtils: fileUtilsMock }));
vi.mock('@/lib/utils', () => mocks);
vi.mock('@/middleware/auth.middleware', () => ({
  requireLibrarian: (handler: unknown) => handler,
  requireAdmin: (handler: unknown) => handler,
  optionalAuth: (handler: unknown) => handler,
}));
vi.mock('@/services/gorse.service', () => ({ GorseService: gorseMock }));
vi.mock('@/services/qdrant.service', () => ({ qdrantService: qdrantMock }));

import { GET as getEditionById, PATCH as updateEdition } from '@/app/api/book-editions/[id]/route';
import { DELETE as bulkDeleteEditions } from '@/app/api/book-editions/bulk-delete/route';
import { POST as createEdition, GET as listEditions } from '@/app/api/book-editions/route';
import {
  DELETE as deleteBookItem,
  PUT as updateBookItem
} from '@/app/api/book-items/[id]/route';
import { POST as createBookItem, GET as listBookItems } from '@/app/api/book-items/route';
import { GET as getAvailableCount } from '@/app/api/books/[id]/available-count/route';
import { DELETE as deleteBook, PUT as updateBook } from '@/app/api/books/[id]/route';
import { POST as createBook } from '@/app/api/books/route';

async function runWithRollback<T>(testCaseId: string, action: () => Promise<T>): Promise<T> {
  // Dùng helper chung để chụp DB trước/sau khi chạy, rollback mock DB và ghi file JSON evidence.
  return runMockDbWithRollback({
    testCaseId,
    getDb: () => testState.db,
    setDb: db => {
      testState.db = db;
    },
    action,
  });
}

function buildFormData(values: Record<string, unknown>) {
  // Giả lập API FormData.get() để route multipart đọc field giống request thật.
  return {
    get: (key: string) => (key in values ? values[key] : null),
  };
}

function buildFakeFile(name: string, content: string, size?: number) {
  // Tạo file giả có name, size và arrayBuffer() để test upload ebook mà không cần file vật lý.
  const actualSize = size ?? Buffer.byteLength(content);
  return {
    name,
    size: actualSize,
    arrayBuffer: async () => {
      const bytes = new TextEncoder().encode(content);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function multipartRequest(formValues: Record<string, unknown>) {
  // Giả lập request multipart/form-data; route sẽ gọi headers.get() và formData().
  return {
    headers: { get: () => 'multipart/form-data; boundary=test' },
    formData: async () => buildFormData(formValues),
  };
}

describe('Route quản lý kho sách với CheckDB/Rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.db = structuredClone(testState.seed);
  });

  // Test Case ID: TC_UT_KHOSACH_001
  it('TC_UT_KHOSACH_001 - tạo sách với category và rollback trạng thái DB', async () => {
    // Arrange: lưu snapshot DB ảo để cuối test chứng minh rollback khôi phục đúng trạng thái ban đầu.
    const before = structuredClone(testState.db);

    // Act: runWithRollback chạy route POST /api/books, tự ghi evidence JSON và rollback sau khi callback kết thúc.
    const response = await runWithRollback('TC_UT_KHOSACH_001', async () => {
      // createBook nhận request giả có headers/json giống NextRequest; route sẽ validate, sanitize và ghi vào prismaMock.book.create.
      const created = await createBook({
        headers: { get: () => 'application/json' },
        json: async () => ({ authorId: 1, title: ' New Book <x> ', isbn: 'ISBN-NEW', categories: [1, 2], price: '10' }),
      } as any);

      // Lấy id do mock DB tự tăng để kiểm tra đúng bản ghi vừa được tạo.
      const bookId = created.data.id;

      // Assert CheckDB: sách mới phải xuất hiện trong DB ảo và title đã được sanitize bỏ dấu < >.
      expect(testState.db.books.some(book => book.id === bookId && book.title === 'New Book x')).toBe(true); // CheckDB
      // Assert CheckDB: route phải tạo đủ 2 liên kết category cho sách mới.
      expect(testState.db.bookCategories.filter(link => link.bookId === bookId)).toHaveLength(2);
      return created;
    });

    // Assert response: route trả success và HTTP status 201 cho thao tác tạo mới.
    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    // Assert rollback: sau khi helper chạy finally, DB ảo phải giống snapshot ban đầu.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_002
  it('TC_UT_KHOSACH_002 - từ chối tạo sách khi thiếu tiêu đề hoặc authorId không hợp lệ', async () => {
    // Act: gửi request thiếu title để kiểm tra validateRequiredFields trong route.
    const missingTitle = await createBook({ headers: { get: () => 'application/json' }, json: async () => ({ authorId: 1, title: '' }) } as any);
    // Act: gửi authorId không hợp lệ để route dừng trước khi ghi DB.
    const invalidAuthor = await createBook({ headers: { get: () => 'application/json' }, json: async () => ({ authorId: '0', title: 'Book' }) } as any);

    // Assert: mỗi nhánh lỗi phải trả đúng message nghiệp vụ.
    expect(missingTitle.error).toBe('Missing required field: title');
    expect(invalidAuthor.error).toBe('Invalid authorId');
  });

  // Test Case ID: TC_UT_KHOSACH_003
  it('TC_UT_KHOSACH_003 - cập nhật sách, thay thế category và rollback dữ liệu', async () => {
    // Arrange: snapshot dùng để đối chiếu sau rollback.
    const before = structuredClone(testState.db);

    // Act: chạy PUT /api/books/[id] trong rollback scope để DB ảo không bị ảnh hưởng sang test khác.
    await runWithRollback('TC_UT_KHOSACH_003', async () => {
      const response = await updateBook(
        { headers: { get: () => 'application/json' }, json: async () => ({ title: 'Updated Book', categories: [3] }) } as any,
        { params: Promise.resolve({ id: '10' }) } as any
      );

      // Assert response: cập nhật hợp lệ phải thành công.
      expect(response.success).toBe(true);
      // Assert CheckDB: title của book id 10 đã đổi trong mock DB.
      expect(testState.db.books.find(book => book.id === 10)?.title).toBe('Updated Book'); // CheckDB
      // Assert CheckDB: category cũ bị xóa và chỉ còn category mới id 3.
      expect(testState.db.bookCategories.filter(link => link.bookId === 10).map(link => link.categoryId)).toEqual([3]);
      // Assert side effect: route gọi đồng bộ lại Qdrant sau khi metadata sách đổi.
      expect(qdrantMock.syncBookToQdrantNonBlocking).toHaveBeenCalledWith(10);
    });
    // Assert rollback: dữ liệu sau test bằng trạng thái trước test.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_004
  it('TC_UT_KHOSACH_004 - xóa mềm sách và rollback dữ liệu', async () => {
    // Arrange: snapshot DB ảo trước khi xóa mềm.
    const before = structuredClone(testState.db);

    // Act: gọi DELETE /api/books/[id] bên trong helper rollback/evidence.
    await runWithRollback('TC_UT_KHOSACH_004', async () => {
      const response = await deleteBook({} as any, { params: Promise.resolve({ id: '10' }) } as any);

      // Assert response: route xóa mềm trả success.
      expect(response.success).toBe(true);
      // Assert CheckDB: bản ghi không bị remove khỏi mảng mà được đánh dấu isDeleted=true.
      expect(testState.db.books.find(book => book.id === 10)?.isDeleted).toBe(true); // CheckDB
      // Assert side effect: sách bị xóa phải được yêu cầu gỡ khỏi Qdrant.
      expect(qdrantMock.removeBookFromQdrantNonBlocking).toHaveBeenCalledWith(10);
    });
    // Assert rollback: cờ isDeleted được khôi phục về false như seed ban đầu.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_005
  it('TC_UT_KHOSACH_005 - tính số lượng sách khả dụng bằng tổng bản còn trừ đặt chỗ đã duyệt', async () => {
    // Act: gọi route đếm bản khả dụng cho sách tồn tại.
    const response = await getAvailableCount({} as any, { params: Promise.resolve({ id: '10' }) } as any);
    // Act: gọi cùng route với id không tồn tại để kiểm tra nhánh lỗi.
    const missing = await getAvailableCount({} as any, { params: Promise.resolve({ id: '999' }) } as any);

    // Assert: sách id 10 có 2 bản AVAILABLE trừ 1 đặt chỗ APPROVED nên còn 1.
    expect(response.success).toBe(true);
    expect(response.data.availableCount).toBe(1);
    // Assert: id không tồn tại phải trả lỗi Book not found.
    expect(missing.error).toBe('Book not found');
  });

  // Test Case ID: TC_UT_KHOSACH_006
  it('TC_UT_KHOSACH_006 - liệt kê bản sao sách khi tìm kiếm theo mã', async () => {
    // Act: truyền query searchByCodeOnly để route build where.code.contains.
    const response = await listBookItems({
      url: 'http://localhost/api/book-items?page=1&limit=10&search=CP-001&searchByCodeOnly=true',
    } as any);

    // Assert response: route danh sách trả success.
    expect(response.success).toBe(true);
    // Assert query: prismaMock phải được gọi với điều kiện contains đúng mã bản sao.
    expect(prismaMock.bookItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ code: { contains: 'CP-001' } }) }));
  });

  // Test Case ID: TC_UT_KHOSACH_007
  it('TC_UT_KHOSACH_007 - liệt kê bản sao sách theo bộ lọc kho', async () => {
    // Act: gửi nhiều filter qua URL để kiểm tra route parse query và map sang Prisma where/orderBy.
    const response = await listBookItems({
      url: 'http://localhost/api/book-items?bookIds=10&conditions=GOOD&statuses=AVAILABLE&acquisitionDateFrom=2026-01-01&sortBy=code&sortOrder=asc',
    } as any);

    // Assert response: filter hợp lệ phải trả success.
    expect(response.success).toBe(true);
    // Assert query: bookIds, conditions, statuses và sort phải được chuyển đúng vào findMany.
    expect(prismaMock.bookItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ bookId: { in: [10] }, condition: { in: ['GOOD'] }, status: { in: ['AVAILABLE'] } }),
        orderBy: { code: 'asc' },
      })
    );
  });

  // Test Case ID: TC_UT_KHOSACH_008
  it('TC_UT_KHOSACH_008 - tạo bản sao sách với trạng thái mặc định AVAILABLE và rollback', async () => {
    // Arrange: snapshot DB ảo trước khi thêm bản sao sách.
    const before = structuredClone(testState.db);

    // Act: gọi POST /api/book-items trong rollback scope để sinh evidence 3 trạng thái DB.
    const response = await runWithRollback('TC_UT_KHOSACH_008', async () => {
      // createBookItem nhận body JSON tối thiểu; route sẽ tự gán status mặc định AVAILABLE.
      const created = await createBookItem({ json: async () => ({ bookId: 10, code: 'CP-NEW', condition: 'GOOD' }) } as any);
      // Assert CheckDB: bản sao mới xuất hiện trong DB ảo với status mặc định.
      expect(testState.db.bookItems.some(item => item.code === 'CP-NEW' && item.status === 'AVAILABLE')).toBe(true); // CheckDB
      return created;
    });

    // Assert response: tạo bản sao thành công trả status 201.
    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    // Assert rollback: bản sao CP-NEW không còn trong DB sau helper.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_009
  it('TC_UT_KHOSACH_009 - từ chối mã bản sao sách bị trùng', async () => {
    // Act: gửi code CP-001 đã tồn tại trong seed để route kiểm tra unique trước khi create.
    const response = await createBookItem({ json: async () => ({ bookId: 10, code: 'CP-001', condition: 'GOOD' }) } as any);

    // Assert: route trả lỗi nghiệp vụ và không cần rollback vì không ghi DB.
    expect(response.success).toBe(false);
    expect(response.error).toBe('Book copy code already exists');
  });

  // Test Case ID: TC_UT_KHOSACH_010
  it('TC_UT_KHOSACH_010 - từ chối bookId không hợp lệ hoặc không tồn tại khi tạo bản sao', async () => {
    // Act: bookId '0' kiểm tra nhánh parse/validate id không hợp lệ.
    const invalid = await createBookItem({ json: async () => ({ bookId: '0', code: 'X', condition: 'GOOD' }) } as any);
    // Act: bookId 999 hợp lệ về kiểu nhưng không có trong mock DB.
    const missing = await createBookItem({ json: async () => ({ bookId: 999, code: 'X', condition: 'GOOD' }) } as any);

    // Assert: mỗi nhánh trả đúng lỗi tương ứng.
    expect(invalid.error).toBe('Invalid bookId');
    expect(missing.error).toBe('Book not found');
  });

  // Test Case ID: TC_UT_KHOSACH_011
  it('TC_UT_KHOSACH_011 - cập nhật bản sao sách và rollback dữ liệu', async () => {
    // Arrange: snapshot DB ảo trước khi cập nhật bản sao.
    const before = structuredClone(testState.db);

    // Act: gọi PUT /api/book-items/[id] trong rollback scope.
    await runWithRollback('TC_UT_KHOSACH_011', async () => {
      const response = await updateBookItem(
        { json: async () => ({ status: 'MAINTENANCE', condition: 'WORN', acquisitionDate: '2026-02-01' }) } as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      // Assert response: cập nhật hợp lệ phải success.
      expect(response.success).toBe(true);
      // Assert CheckDB: status của item id 1 được cập nhật trong DB ảo.
      expect(testState.db.bookItems.find(item => item.id === 1)?.status).toBe('MAINTENANCE'); // CheckDB
      // Assert CheckDB: condition cũng được cập nhật theo payload.
      expect(testState.db.bookItems.find(item => item.id === 1)?.condition).toBe('WORN');
    });
    // Assert rollback: status/condition quay về dữ liệu seed.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_012
  it('TC_UT_KHOSACH_012 - từ chối cập nhật bản sao sang mã đã tồn tại', async () => {
    // Act: cập nhật item id 1 sang code CP-002, là code của item khác trong seed.
    const response = await updateBookItem(
      { json: async () => ({ code: 'CP-002' }) } as any,
      { params: Promise.resolve({ id: '1' }) } as any
    );

    // Assert: route phát hiện trùng code và trả lỗi trước khi update.
    expect(response.success).toBe(false);
    expect(response.error).toBe('Book copy code already exists');
  });

  // Test Case ID: TC_UT_KHOSACH_013
  it('TC_UT_KHOSACH_013 - xóa mềm bản sao sách và rollback dữ liệu', async () => {
    // Arrange: snapshot DB ảo trước thao tác xóa mềm.
    const before = structuredClone(testState.db);

    // Act: gọi DELETE /api/book-items/[id] trong rollback scope.
    await runWithRollback('TC_UT_KHOSACH_013', async () => {
      const response = await deleteBookItem({} as any, { params: Promise.resolve({ id: '1' }) } as any);

      // Assert response: route xóa mềm thành công.
      expect(response.success).toBe(true);
      // Assert CheckDB: item id 1 vẫn còn nhưng isDeleted được bật.
      expect(testState.db.bookItems.find(item => item.id === 1)?.isDeleted).toBe(true); // CheckDB
    });
    // Assert rollback: item id 1 được khôi phục isDeleted=false.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_014
  it('TC_UT_KHOSACH_014 - liệt kê phiên bản ebook theo bộ lọc và serialize BigInt file size', async () => {
    // Act: gọi GET /api/book-editions với các filter ebook.
    const response = await listEditions({
      url: 'http://localhost/api/book-editions?bookIds=10&format=EBOOK&fileFormat=PDF&drmType=NONE&status=ACTIVE&search=978',
    } as any);

    // Assert response: danh sách edition trả success.
    expect(response.success).toBe(true);
    // Assert serialize: BigInt trong mock DB phải được route chuyển thành string để JSON-safe.
    expect(response.data.editions[0].fileSizeBytes).toBe('1024');
    // Assert query: các filter bookId/format/fileFormat/drmType được chuyển đúng vào Prisma.
    expect(prismaMock.bookEdition.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ bookId: { in: [10] }, format: 'EBOOK', fileFormat: 'PDF', drmType: 'NONE' }) }));
  });

  // Test Case ID: TC_UT_KHOSACH_015
  it('TC_UT_KHOSACH_015 - tạo phiên bản ebook với checksum/storageUrl và rollback', async () => {
    // Arrange: snapshot DB ảo trước khi upload edition mới.
    const before = structuredClone(testState.db);

    // Act: gọi POST /api/book-editions bằng request multipart giả và để helper ghi evidence/rollback.
    const response = await runWithRollback('TC_UT_KHOSACH_015', async () => {
      // multipartRequest tạo headers/formData; buildFakeFile tạo file PDF giả cho route tính checksum và storageUrl.
      const created = await createEdition(
        multipartRequest({
          bookId: '10',
          format: 'EBOOK',
          isbn13: '9781111111111',
          fileFormat: 'PDF',
          drmType: 'NONE',
          status: 'ACTIVE',
          file: buildFakeFile('sample.pdf', 'pdf-content'),
        }) as any
      );

      // Lấy edition vừa tạo từ mock DB để kiểm tra dữ liệu sau khi route ghi.
      const edition = testState.db.bookEditions.find(row => row.id === created.data.id);
      // Assert CheckDB: checksum SHA-256 hợp lệ có độ dài 64 ký tự hex.
      expect(edition?.checksumSha256).toHaveLength(64); // CheckDB
      // Assert CheckDB: storageUrl phải trỏ vào thư mục upload ebook.
      expect(edition?.storageUrl).toContain('/api/files/uploads/ebooks/');
      return created;
    });

    // Assert response: upload hợp lệ trả status 201.
    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    // Assert side effect: route đã gọi FileUtils.writeFileToSystem để lưu file.
    expect(fileUtilsMock.writeFileToSystem).toHaveBeenCalled();
    // Assert rollback: edition mới không còn trong DB sau test.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_016
  it('TC_UT_KHOSACH_016 - từ chối tạo phiên bản ebook khi request không multipart hoặc thiếu file/trường', async () => {
    // Act: gửi content-type JSON để kiểm tra route bắt buộc multipart/form-data.
    const nonMultipart = await createEdition({ headers: { get: () => 'application/json' } } as any);
    // Act: gửi multipart nhưng thiếu file để kiểm tra validate upload.
    const missingFile = await createEdition(multipartRequest({ bookId: '10', format: 'EBOOK', fileFormat: 'PDF', drmType: 'NONE' }) as any);

    // Assert: mỗi request lỗi trả đúng message, không phát sinh ghi DB.
    expect(nonMultipart.error).toBe('Content-Type must be multipart/form-data');
    expect(missingFile.error).toBe('File is required');
  });

  // Test Case ID: TC_UT_KHOSACH_017
  it('TC_UT_KHOSACH_017 - từ chối upload ebook có đuôi file sai với định dạng', async () => {
    // Act: khai báo fileFormat PDF nhưng upload file .txt để route kiểm tra extension.
    const response = await createEdition(
      multipartRequest({
        bookId: '10',
        format: 'EBOOK',
        fileFormat: 'PDF',
        drmType: 'NONE',
        file: buildFakeFile('sample.txt', 'text'),
      }) as any
    );

    // Assert: route trả lỗi loại file không hợp lệ cho ebook.
    expect(response.success).toBe(false);
    expect(response.error).toContain('Invalid file type for EBOOK');
  });

  // Test Case ID: TC_UT_KHOSACH_018
  it('TC_UT_KHOSACH_018 - từ chối file ebook vượt quá MAX_EBOOK_SIZE', async () => {
    // Act: buildFakeFile nhận size override 101MB để test giới hạn MAX_EBOOK_SIZE mà không tạo file thật lớn.
    const response = await createEdition(
      multipartRequest({
        bookId: '10',
        format: 'EBOOK',
        fileFormat: 'PDF',
        drmType: 'NONE',
        file: buildFakeFile('huge.pdf', 'x', 101 * 1024 * 1024),
      }) as any
    );

    // Assert: route chặn upload vì vượt quá giới hạn dung lượng.
    expect(response.success).toBe(false);
    expect(response.error).toContain('File is too large');
  });

  // Test Case ID: TC_UT_KHOSACH_019
  it('TC_UT_KHOSACH_019 - lấy phiên bản ebook theo id và xử lý id sai/không tồn tại', async () => {
    // Act: gọi route detail với id tồn tại, id sai định dạng nghiệp vụ và id không tồn tại.
    const found = await getEditionById({} as any, { params: Promise.resolve({ id: '1' }) } as any);
    const invalid = await getEditionById({} as any, { params: Promise.resolve({ id: '0' }) } as any);
    const missing = await getEditionById({} as any, { params: Promise.resolve({ id: '999' }) } as any);

    // Assert: id hợp lệ trả data và serialize BigInt thành string.
    expect(found.success).toBe(true);
    expect(found.data.fileSizeBytes).toBe('1024');
    // Assert: hai nhánh lỗi trả đúng message.
    expect(invalid.error).toBe('Invalid edition ID');
    expect(missing.error).toBe('Book edition not found');
  });

  // Test Case ID: TC_UT_KHOSACH_020
  it('TC_UT_KHOSACH_020 - cập nhật metadata ebook không thay file và rollback', async () => {
    // Arrange: snapshot DB ảo trước khi sửa metadata.
    const before = structuredClone(testState.db);

    // Act: PATCH /api/book-editions/[id] với multipart chỉ có metadata, không có file mới.
    await runWithRollback('TC_UT_KHOSACH_020', async () => {
      const response = await updateEdition(
        multipartRequest({ status: 'INACTIVE', isbn13: ' 9782222222222 ' }) as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      // Lấy record trong DB ảo sau khi route update để CheckDB.
      const updated = testState.db.bookEditions.find(edition => edition.id === 1);
      // Assert response: cập nhật metadata hợp lệ thành công.
      expect(response.success).toBe(true);
      // Assert CheckDB: status đổi sang INACTIVE.
      expect(updated?.status).toBe('INACTIVE'); // CheckDB
      // Assert CheckDB: không gửi file mới nên storageUrl cũ phải được giữ nguyên.
      expect(updated?.storageUrl).toBe('/api/files/uploads/ebooks/old.pdf');
    });
    // Assert rollback: status/storageUrl quay về seed.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_021
  it('TC_UT_KHOSACH_021 - thay file ebook, xóa file cũ và rollback', async () => {
    // Arrange: snapshot DB ảo trước khi thay file.
    const before = structuredClone(testState.db);

    // Act: PATCH /api/book-editions/[id] với file PDF mới.
    await runWithRollback('TC_UT_KHOSACH_021', async () => {
      const response = await updateEdition(
        multipartRequest({ file: buildFakeFile('replacement.pdf', 'new-pdf') }) as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      // Lấy edition sau update để kiểm tra metadata file mới.
      const updated = testState.db.bookEditions.find(edition => edition.id === 1);
      // Assert response: thay file thành công.
      expect(response.success).toBe(true);
      // Assert CheckDB: checksum phải đổi so với checksum cũ.
      expect(updated?.checksumSha256).not.toBe('old-checksum'); // CheckDB
      // Assert side effect: file cũ được yêu cầu xóa khỏi hệ thống lưu trữ.
      expect(fileUtilsMock.deleteFileFromSystem).toHaveBeenCalledWith('uploads/ebooks/old.pdf', expect.any(Object));
    });
    // Assert rollback: metadata file cũ được khôi phục trong mock DB.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_022
  it('TC_UT_KHOSACH_022 - xóa metadata file khỏi ebook và rollback', async () => {
    // Arrange: snapshot DB ảo trước khi remove file.
    const before = structuredClone(testState.db);

    // Act: PATCH với removeFile=true để route xóa metadata file khỏi edition.
    await runWithRollback('TC_UT_KHOSACH_022', async () => {
      const response = await updateEdition(
        multipartRequest({ removeFile: 'true' }) as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      // Lấy edition sau khi remove file để CheckDB.
      const updated = testState.db.bookEditions.find(edition => edition.id === 1);
      // Assert response: thao tác remove file thành công.
      expect(response.success).toBe(true);
      // Assert CheckDB: storageUrl bị xóa rỗng.
      expect(updated?.storageUrl).toBe(''); // CheckDB
      // Assert CheckDB: checksum và size không còn vì file đã được gỡ khỏi metadata.
      expect(updated?.checksumSha256).toBeNull();
      expect(updated?.fileSizeBytes).toBeNull();
    });
    // Assert rollback: metadata file được khôi phục như seed.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_KHOSACH_023
  it('TC_UT_KHOSACH_023 - xóa mềm hàng loạt phiên bản ebook và rollback', async () => {
    // Arrange: snapshot DB ảo trước khi bulk delete.
    const before = structuredClone(testState.db);

    // Act: gọi DELETE bulk trong rollback scope để có evidence DB trước/sau/rollback.
    const response = await runWithRollback('TC_UT_KHOSACH_023', async () => {
      // bulkDeleteEditions đọc ids từ body JSON và gọi updateMany trong prismaMock.
      const deleted = await bulkDeleteEditions({ json: async () => ({ ids: [1] }) } as any);

      // Assert CheckDB: edition id 1 được xóa mềm bằng isDeleted=true.
      expect(testState.db.bookEditions.find(edition => edition.id === 1)?.isDeleted).toBe(true); // CheckDB
      // Assert side effect: route gọi xóa file vật lý liên quan đến edition.
      expect(fileUtilsMock.deleteFileFromSystem).toHaveBeenCalled();
      return deleted;
    });

    // Assert response: route báo đúng số lượng bản ghi đã xóa.
    expect(response.success).toBe(true);
    expect(response.data.deletedCount).toBe(1);
    // Assert rollback: edition quay về isDeleted=false như seed.
    expect(testState.db).toEqual(before); // Rollback
  });
});
