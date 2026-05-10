import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Prisma at service level so the test checks generated query arguments
// without depending on MySQL or seed data.
const prismaMock = vi.hoisted(() => ({
  book: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

import {
  buildBookWhereClause,
  buildOrderByClause,
  listBooks,
  transformBookData,
} from '@/services/book.service';
import { BookFilterParams, BookRawData } from '@/types/book';

// Default filter params used by list/search requests. Each test overrides only
// the field needed for its objective.
function baseFilterParams(overrides: Partial<BookFilterParams> = {}): BookFilterParams {
  // Tạo bộ filter mặc định để các test chỉ override đúng field đang kiểm tra.
  return {
    search: '',
    page: 1,
    limit: 10,
    authorIds: [],
    categoryIds: [],
    languageCodes: [],
    publishYearFrom: undefined,
    publishYearTo: undefined,
    sortBy: undefined,
    sortOrder: undefined,
    isDeleted: null,
    availableAt: undefined,
    ...overrides,
  };
}

describe('Service sách - logic kho và tìm kiếm', () => {
  beforeEach(() => {
    // Arrange chung: xóa lịch sử gọi prismaMock để mỗi test assert đúng query của chính nó.
    vi.clearAllMocks();
  });

  // Test Case ID: TC_UT_SERVICE_BOOK_001
  it('TC_UT_SERVICE_BOOK_001 - chuyển dữ liệu Prisma book sang trường response', () => {
    // Arrange: rawBooks giả lập dữ liệu Prisma có relation category, edition, review và _count.
    const rawBooks = [
      {
        id: 1,
        title: 'Clean Code',
        bookCategories: [
          { category: { name: 'Software' } },
          { category: { name: 'Testing' } },
        ],
        bookEditions: [{ format: 'EBOOK' }, { format: 'AUDIO' }, { format: 'EBOOK' }],
        reviews: [{ rating: 4 }, { rating: 5 }, { rating: 5 }],
        _count: { bookItems: 3 },
      },
      {
        id: 2,
        title: 'No Relations',
        bookCategories: undefined,
        bookEditions: undefined,
        reviews: [],
        _count: undefined,
      },
    ] as unknown as BookRawData[];

    // Act: transformBookData map raw Prisma rows sang shape response cho UI/API.
    const result = transformBookData(rawBooks);

    // Assert: book có relation phải được tính category, số bản in, số ebook/audio và rating trung bình.
    expect(result[0]).toEqual(
      expect.objectContaining({
        categories: ['Software', 'Testing'],
        bookItemsCount: 3,
        bookEbookCount: 2,
        bookAudioCount: 1,
        averageRating: 4.7,
      })
    );
    // Assert: book thiếu relation vẫn trả mảng/count/rating mặc định thay vì undefined.
    expect(result[1]).toEqual(
      expect.objectContaining({
        categories: [],
        bookItemsCount: 0,
        bookEbookCount: 0,
        bookAudioCount: 0,
        averageRating: 0,
      })
    );
  });

  // Test Case ID: TC_UT_SERVICE_BOOK_002
  it('TC_UT_SERVICE_BOOK_002 - tạo where mặc định cho sách active', () => {
    // Act: không truyền override để kiểm tra filter mặc định.
    const where = buildBookWhereClause(baseFilterParams());

    // Assert: mặc định service chỉ lấy sách chưa xóa mềm.
    expect(where).toEqual({ isDeleted: false });
  });

  // Test Case ID: TC_UT_SERVICE_BOOK_003
  it('TC_UT_SERVICE_BOOK_003 - tạo where với bộ lọc tác giả, category, ngôn ngữ và năm', () => {
    // Act: truyền các filter dạng id array và khoảng năm xuất bản.
    const where = buildBookWhereClause(
      baseFilterParams({
        authorIds: [1, 2],
        categoryIds: [3],
        languageCodes: ['vi', 'en'],
        publishYearFrom: 2000,
        publishYearTo: 2026,
        isDeleted: true,
      })
    );

    // Assert: service phải map mỗi filter sang đúng cú pháp Prisma where.
    expect(where).toEqual({
      authorId: { in: [1, 2] },
      bookCategories: { some: { categoryId: { in: [3] } } },
      language: { in: ['vi', 'en'] },
      publishYear: { gte: 2000, lte: 2026 },
    });
  });

  // Test Case ID: TC_UT_SERVICE_BOOK_004
  it('TC_UT_SERVICE_BOOK_004 - tạo bộ lọc khả dụng cho ebook và bản in', () => {
    // Act: kiểm tra lần lượt filter chỉ ebook, chỉ bản in và yêu cầu cả hai loại khả dụng.
    const ebookOnly = buildBookWhereClause(baseFilterParams({ availableAt: ['ebook'] }));
    const copyOnly = buildBookWhereClause(baseFilterParams({ availableAt: ['book-copy'] }));
    const both = buildBookWhereClause(baseFilterParams({ availableAt: ['ebook', 'book-copy'] }));

    // Assert: ebookOnly yêu cầu có bookEdition EBOOK chưa xóa.
    expect(ebookOnly).toEqual({
      isDeleted: false,
      bookEditions: { some: { format: 'EBOOK', isDeleted: false } },
    });
    // Assert: copyOnly yêu cầu có bookItem AVAILABLE chưa xóa.
    expect(copyOnly).toEqual({
      isDeleted: false,
      bookItems: { some: { status: 'AVAILABLE', isDeleted: false } },
    });
    // Assert: both dùng AND để sách phải có cả ebook và bản in khả dụng.
    expect(both).toEqual({
      isDeleted: false,
      AND: [
        {
          AND: [
            { bookEditions: { some: { format: 'EBOOK', isDeleted: false } } },
            { bookItems: { some: { status: 'AVAILABLE', isDeleted: false } } },
          ],
        },
      ],
    });
  });

  // Test Case ID: TC_UT_SERVICE_BOOK_005
  it('TC_UT_SERVICE_BOOK_005 - tạo orderBy từ trường sort được hỗ trợ', () => {
    // Act/Assert: không truyền sort thì mặc định sắp xếp mới nhất trước.
    expect(buildOrderByClause()).toEqual({ createdAt: 'desc' });
    // Act/Assert: title và publishYear là các field sort được hỗ trợ.
    expect(buildOrderByClause('title', 'asc')).toEqual({ title: 'asc' });
    expect(buildOrderByClause('publishYear', 'desc')).toEqual({ publishYear: 'desc' });
    // Act/Assert: sort field không hỗ trợ phải fallback về createdAt desc.
    expect(buildOrderByClause('unknown', 'asc')).toEqual({ createdAt: 'desc' });
  });

  // Test Case ID: TC_UT_SERVICE_BOOK_006
  it('TC_UT_SERVICE_BOOK_006 - liệt kê sách với phân trang và điều kiện tìm kiếm text', async () => {
    // Arrange: mock Prisma trả một book và tổng số 1 để listBooks không chạm DB thật.
    const expectedBooks = [{ id: 1, title: 'Clean Code' }];
    prismaMock.book.findMany.mockResolvedValueOnce(expectedBooks);
    prismaMock.book.count.mockResolvedValueOnce(1);

    // Act: gọi listBooks với search, page 3, limit 20 và sort title asc.
    const result = await listBooks(
      baseFilterParams({
        search: 'clean',
        page: 3,
        limit: 20,
        sortBy: 'title',
        sortOrder: 'asc',
      })
    );

    // Assert: service trả đúng data và total nhận từ prismaMock.
    expect(result).toEqual({ books: expectedBooks, total: 1 });
    // Assert: findMany phải có where OR cho text search, skip=(page-1)*limit, take và orderBy đúng.
    expect(prismaMock.book.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          OR: [
            { title: { contains: 'clean' } },
            { isbn: { contains: 'clean' } },
            { publisher: { contains: 'clean' } },
            { description: { contains: 'clean' } },
            { author: { fullName: { contains: 'clean' } } },
          ],
        }),
        skip: 40,
        take: 20,
        orderBy: { title: 'asc' },
      })
    );
    // Assert: count dùng cùng where search để total khớp danh sách.
    expect(prismaMock.book.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ isDeleted: false, OR: expect.any(Array) }),
    });
  });

  // Test Case ID: TC_UT_SERVICE_BOOK_007
  it('TC_UT_SERVICE_BOOK_007 - kết hợp tìm kiếm text với điều kiện AND về khả dụng', async () => {
    // Arrange: mock Prisma trả rỗng để tập trung assert query where, không assert dữ liệu.
    prismaMock.book.findMany.mockResolvedValueOnce([]);
    prismaMock.book.count.mockResolvedValueOnce(0);

    // Act: gọi listBooks vừa có search text vừa yêu cầu ebook và bản in khả dụng.
    await listBooks(
      baseFilterParams({
        search: 'architecture',
        availableAt: ['ebook', 'book-copy'],
      })
    );

    // Assert: lấy args findMany để kiểm tra cấu trúc where.AND phức tạp.
    const findArgs = prismaMock.book.findMany.mock.calls[0][0];
    // Assert: AND phải chứa cả điều kiện khả dụng và OR text search.
    expect(findArgs.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          AND: expect.arrayContaining([
            { bookEditions: { some: { format: 'EBOOK', isDeleted: false } } },
            { bookItems: { some: { status: 'AVAILABLE', isDeleted: false } } },
          ]),
        }),
        { OR: expect.any(Array) },
      ])
    );
  });
});
