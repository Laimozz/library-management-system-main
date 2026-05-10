import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMockDbWithRollback } from '../db-evidence';

type AuthorRow = {
  id: number;
  fullName: string;
  bio: string | null;
  birthDate: Date | null;
  nationality: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const testState = vi.hoisted(() => {
  // Seed DB ảo cho route test; mọi thao tác Prisma mock sẽ đọc/ghi vào object này.
  const now = new Date('2026-05-09T00:00:00.000Z');
  const seed = {
    authors: [
      {
        id: 1,
        fullName: 'Nam Cao',
        bio: 'Tac gia hien thuc',
        birthDate: new Date('1915-10-29T00:00:00.000Z'),
        nationality: 'Viet Nam',
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        fullName: 'Deleted Author',
        bio: null,
        birthDate: null,
        nationality: 'Japan',
        isDeleted: true,
        createdAt: now,
        updatedAt: now,
      },
    ] as AuthorRow[],
    categories: [
      {
        id: 1,
        name: 'Software',
        description: 'Software books',
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        name: 'Deleted Category',
        description: null,
        isDeleted: true,
        createdAt: now,
        updatedAt: now,
      },
    ] as CategoryRow[],
    nextAuthorId: 3,
    nextCategoryId: 3,
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
      const value = data[field];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        return `Missing required field: ${field}`;
      }
    }
    return null;
  }),
}));

function filterByWhere<T extends { id: number; isDeleted: boolean }>(rows: T[], where: any) {
  // Helper lọc tối thiểu theo id/isDeleted để Prisma mock mô phỏng where clause của route.
  return rows.filter(row => {
    if (typeof where?.isDeleted === 'boolean' && row.isDeleted !== where.isDeleted) return false;
    if (typeof where?.id === 'number' && row.id !== where.id) return false;
    return true;
  });
}

const prismaMock = vi.hoisted(() => ({
  author: {
    findMany: vi.fn(async (args: any = {}) => {
      const where = args.where || {};
      let rows = filterByWhere(testState.db.authors, where);
      if (where.OR) {
        const fullNameSearch = where.OR[0]?.fullName?.contains ?? '';
        const nationalitySearch = where.OR[1]?.nationality?.contains ?? '';
        rows = rows.filter(
          author =>
            author.fullName.includes(fullNameSearch) ||
            (author.nationality || '').includes(nationalitySearch)
        );
      }
      if (args.orderBy?.fullName === 'asc') {
        rows = [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName));
      }
      return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length));
    }),
    count: vi.fn(async (args: any = {}) => filterByWhere(testState.db.authors, args.where || {}).length),
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: testState.db.nextAuthorId++,
        fullName: data.fullName,
        bio: data.bio ?? null,
        birthDate: data.birthDate ?? null,
        nationality: data.nationality ?? null,
        isDeleted: Boolean(data.isDeleted),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      testState.db.authors.push(created);
      return created;
    }),
    findFirst: vi.fn(async ({ where }: any) => filterByWhere(testState.db.authors, where || {})[0] || null),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.authors.findIndex(author => author.id === where.id);
      if (index < 0) throw new Error('Author not found');
      testState.db.authors[index] = { ...testState.db.authors[index], ...data, updatedAt: new Date() };
      return testState.db.authors[index];
    }),
  },
  category: {
    findMany: vi.fn(async (args: any = {}) => {
      const where = args.where || {};
      let rows = filterByWhere(testState.db.categories, where);
      if (where.OR) {
        const nameSearch = where.OR[0]?.name?.contains ?? '';
        const descriptionSearch = where.OR[1]?.description?.contains ?? '';
        rows = rows.filter(
          category =>
            category.name.includes(nameSearch) ||
            (category.description || '').includes(descriptionSearch)
        );
      }
      if (args.orderBy?.name === 'asc') {
        rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
      }
      return rows.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length));
    }),
    count: vi.fn(async (args: any = {}) => filterByWhere(testState.db.categories, args.where || {}).length),
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: testState.db.nextCategoryId++,
        name: data.name,
        description: data.description ?? null,
        isDeleted: Boolean(data.isDeleted),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      testState.db.categories.push(created);
      return created;
    }),
    findFirst: vi.fn(async ({ where }: any) => filterByWhere(testState.db.categories, where || {})[0] || null),
    update: vi.fn(async ({ where, data }: any) => {
      const index = testState.db.categories.findIndex(category => category.id === where.id);
      if (index < 0) throw new Error('Category not found');
      testState.db.categories[index] = { ...testState.db.categories[index], ...data, updatedAt: new Date() };
      return testState.db.categories[index];
    }),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/utils', () => mocks);
vi.mock('@/middleware/auth.middleware', () => ({
  requireLibrarian: (handler: unknown) => handler,
}));

import {
  DELETE as deleteAuthor,
  GET as getAuthorById,
  PUT as updateAuthor,
} from '@/app/api/authors/[id]/route';
import { GET as getAllAuthors } from '@/app/api/authors/all/route';
import { GET as getAuthors, POST as createAuthor } from '@/app/api/authors/route';
import {
  DELETE as deleteCategory,
  GET as getCategoryById,
  PUT as updateCategory,
} from '@/app/api/categories/[id]/route';
import { GET as getAllCategories } from '@/app/api/categories/all/route';
import { GET as getCategories, POST as createCategory } from '@/app/api/categories/route';

async function runWithRollback<T>(action: () => Promise<T>): Promise<T> {
  // Helper chung: chạy action trên DB ảo, ghi evidence JSON theo tên test case và rollback dữ liệu sau cùng.
  return runMockDbWithRollback({
    getDb: () => testState.db,
    setDb: db => {
      testState.db = db;
    },
    action,
  });
}

describe('Route tác giả và category với CheckDB/Rollback', () => {
  beforeEach(() => {
    // Arrange chung: reset mock call history và khôi phục DB ảo về seed trước từng test.
    vi.clearAllMocks();
    testState.db = structuredClone(testState.seed);
  });

  // Test Case ID: TC_UT_TACGIACATE_006
  it('TC_UT_TACGIACATE_006 - liệt kê tác giả với tìm kiếm, isDeleted, sắp xếp và phân trang', async () => {
    // Act: gọi route GET /api/authors với query search, isDeleted, sort và pagination.
    const response = await getAuthors({
      url: 'http://localhost/api/authors?page=1&limit=5&search=Nam&isDeleted=false&sortBy=fullName&sortOrder=asc',
    } as any);

    // Assert: response thành công và chỉ trả một tác giả khớp search.
    expect(response.success).toBe(true);
    expect(response.data.authors).toHaveLength(1);
    // Assert query: route phải gọi prisma.author.findMany với where, skip/take và orderBy đúng.
    expect(prismaMock.author.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false }),
        skip: 0,
        take: 5,
        orderBy: { fullName: 'asc' },
      })
    );
  });

  // Test Case ID: TC_UT_TACGIACATE_007
  it('TC_UT_TACGIACATE_007 - tạo tác giả và rollback dữ liệu', async () => {
    // Arrange: chụp DB trước khi create để cuối test kiểm tra rollback.
    const before = structuredClone(testState.db);
    // Act: chạy POST /api/authors trong rollback scope; helper sẽ ghi test-evi/TC_UT_TACGIACATE_007.json.
    const response = await runWithRollback(async () => {
      const created = await createAuthor({
        json: async () => ({
          fullName: '  New Author <x> ',
          bio: 'Bio',
          birthDate: '1980-01-01',
          nationality: 'VN',
        }),
      } as any);

      // Assert CheckDB: fullName được sanitize và bản ghi mới xuất hiện trong DB ảo.
      expect(testState.db.authors.some(author => author.fullName === 'New Author x')).toBe(true); // CheckDB
      return created;
    });

    // Assert response: create trả success và HTTP status 201.
    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    // Assert rollback: DB sau helper phải bằng snapshot ban đầu.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_TACGIACATE_008
  it('TC_UT_TACGIACATE_008 - từ chối tạo tác giả thiếu fullName', async () => {
    // Act: gửi fullName rỗng để validateRequiredFields chặn request.
    const response = await createAuthor({ json: async () => ({ fullName: '' }) } as any);

    // Assert: route trả lỗi bắt buộc nhập và không gọi prisma.author.create.
    expect(response.success).toBe(false);
    expect(response.error).toBe('Missing required field: fullName');
    expect(prismaMock.author.create).not.toHaveBeenCalled();
  });

  // Test Case ID: TC_UT_TACGIACATE_009
  it('TC_UT_TACGIACATE_009 - lấy tác giả theo id và từ chối id sai/không tồn tại', async () => {
    // Act: gọi detail với id tồn tại, id không hợp lệ và id không có trong DB ảo.
    const found = await getAuthorById({} as any, { params: Promise.resolve({ id: '1' }) });
    const invalid = await getAuthorById({} as any, { params: Promise.resolve({ id: '0' }) });
    const missing = await getAuthorById({} as any, { params: Promise.resolve({ id: '999' }) });

    // Assert: từng nhánh trả đúng dữ liệu hoặc message lỗi.
    expect(found.success).toBe(true);
    expect(found.data.fullName).toBe('Nam Cao');
    expect(invalid.error).toBe('Invalid author ID');
    expect(missing.error).toBe('Author not found');
  });

  // Test Case ID: TC_UT_TACGIACATE_010
  it('TC_UT_TACGIACATE_010 - cập nhật tác giả và rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước update.
    const before = structuredClone(testState.db);

    // Act: PUT /api/authors/[id] trong rollback scope để ghi evidence và hoàn nguyên DB.
    await runWithRollback(async () => {
      const response = await updateAuthor(
        { json: async () => ({ fullName: ' Updated Author ', bio: '', nationality: 'VN' }) } as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      // Assert response: update thành công.
      expect(response.success).toBe(true);
      // Assert CheckDB: fullName được trim và bio rỗng được normalize thành null.
      expect(testState.db.authors.find(author => author.id === 1)?.fullName).toBe('Updated Author'); // CheckDB
      expect(testState.db.authors.find(author => author.id === 1)?.bio).toBeNull();
    });

    // Assert rollback: DB sau test quay về snapshot.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_TACGIACATE_011
  it('TC_UT_TACGIACATE_011 - xóa mềm tác giả và rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước delete.
    const before = structuredClone(testState.db);

    // Act: DELETE /api/authors/[id] trong rollback scope.
    await runWithRollback(async () => {
      const response = await deleteAuthor({} as any, { params: Promise.resolve({ id: '1' }) } as any);

      // Assert response và CheckDB: route xóa mềm bằng isDeleted=true.
      expect(response.success).toBe(true);
      expect(testState.db.authors.find(author => author.id === 1)?.isDeleted).toBe(true); // CheckDB
    });

    // Assert rollback: isDeleted được phục hồi về false.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_TACGIACATE_012
  it('TC_UT_TACGIACATE_012 - liệt kê toàn bộ tác giả chưa xóa cho control chọn', async () => {
    // Act: gọi route getAllAuthors không cần request object vì route không đọc query/body.
    const response = await getAllAuthors();

    // Assert: chỉ trả tác giả chưa xóa và query Prisma có where/orderBy đúng.
    expect(response.success).toBe(true);
    expect(response.data.every((author: AuthorRow) => author.isDeleted === false)).toBe(true);
    expect(prismaMock.author.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDeleted: false }, orderBy: { fullName: 'asc' } })
    );
  });

  // Test Case ID: TC_UT_TACGIACATE_016
  it('TC_UT_TACGIACATE_016 - liệt kê category với tìm kiếm, isDeleted, sắp xếp và phân trang', async () => {
    // Act: gọi route GET /api/categories với query search, isDeleted, sort và pagination.
    const response = await getCategories({
      url: 'http://localhost/api/categories?page=1&limit=10&search=Software&isDeleted=false&sortBy=name&sortOrder=asc',
    } as any);

    // Assert: response trả đúng một category khớp filter.
    expect(response.success).toBe(true);
    expect(response.data.categories).toHaveLength(1);
    // Assert query: route build đúng where, skip/take và orderBy.
    expect(prismaMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false }),
        skip: 0,
        take: 10,
        orderBy: { name: 'asc' },
      })
    );
  });

  // Test Case ID: TC_UT_TACGIACATE_017
  it('TC_UT_TACGIACATE_017 - tạo category và rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước khi create category.
    const before = structuredClone(testState.db);
    // Act: POST /api/categories trong rollback scope để sinh evidence JSON.
    const response = await runWithRollback(async () => {
      const created = await createCategory({
        json: async () => ({ name: ' Architecture <x> ', description: 'Design books' }),
      } as any);

      // Assert CheckDB: name được trim/sanitize và bản ghi mới nằm trong DB ảo.
      expect(testState.db.categories.some(category => category.name === 'Architecture x')).toBe(true); // CheckDB
      return created;
    });

    // Assert response và rollback.
    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_TACGIACATE_018
  it('TC_UT_TACGIACATE_018 - từ chối tạo category thiếu name', async () => {
    // Act: gửi name rỗng để route validate required field.
    const response = await createCategory({ json: async () => ({ name: '' }) } as any);

    // Assert: trả lỗi đúng và không gọi create.
    expect(response.success).toBe(false);
    expect(response.error).toBe('Missing required field: name');
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });

  // Test Case ID: TC_UT_TACGIACATE_019
  it('TC_UT_TACGIACATE_019 - lấy category theo id và từ chối id sai/không tồn tại', async () => {
    // Act: gọi detail với id tồn tại, id không hợp lệ và id không tồn tại.
    const found = await getCategoryById({} as any, { params: Promise.resolve({ id: '1' }) });
    const invalid = await getCategoryById({} as any, { params: Promise.resolve({ id: '0' }) });
    const missing = await getCategoryById({} as any, { params: Promise.resolve({ id: '999' }) });

    // Assert: route trả data hoặc lỗi đúng theo từng trường hợp.
    expect(found.success).toBe(true);
    expect(found.data.name).toBe('Software');
    expect(invalid.error).toBe('Invalid category ID');
    expect(missing.error).toBe('Category not found');
  });

  // Test Case ID: TC_UT_TACGIACATE_020
  it('TC_UT_TACGIACATE_020 - cập nhật category và rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước update.
    const before = structuredClone(testState.db);

    // Act: PUT /api/categories/[id] trong rollback scope.
    await runWithRollback(async () => {
      const response = await updateCategory(
        { json: async () => ({ name: ' Updated Category ', description: '' }) } as any,
        { params: Promise.resolve({ id: '1' }) } as any
      );

      // Assert response và CheckDB: name được trim, description rỗng thành null.
      expect(response.success).toBe(true);
      expect(testState.db.categories.find(category => category.id === 1)?.name).toBe('Updated Category'); // CheckDB
      expect(testState.db.categories.find(category => category.id === 1)?.description).toBeNull();
    });

    // Assert rollback: DB quay về snapshot trước update.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_TACGIACATE_021
  it('TC_UT_TACGIACATE_021 - xóa mềm category và rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước delete.
    const before = structuredClone(testState.db);

    // Act: DELETE /api/categories/[id] trong rollback scope.
    await runWithRollback(async () => {
      const response = await deleteCategory({} as any, { params: Promise.resolve({ id: '1' }) } as any);

      // Assert response và CheckDB: category được đánh dấu isDeleted=true.
      expect(response.success).toBe(true);
      expect(testState.db.categories.find(category => category.id === 1)?.isDeleted).toBe(true); // CheckDB
    });

    // Assert rollback: isDeleted phục hồi như dữ liệu seed.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_TACGIACATE_022
  it('TC_UT_TACGIACATE_022 - liệt kê toàn bộ category chưa xóa cho control chọn', async () => {
    // Act: gọi route all category cho dropdown/control chọn.
    const response = await getAllCategories();

    // Assert: chỉ lấy category chưa xóa và sắp xếp theo name asc.
    expect(response.success).toBe(true);
    expect(response.data.every((category: CategoryRow) => category.isDeleted === false)).toBe(true);
    expect(prismaMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDeleted: false }, orderBy: { name: 'asc' } })
    );
  });
});
