import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMockDbWithRollback } from '../db-evidence';

const testState = vi.hoisted(() => {
  // Seed DB ảo cho domain mượn/trả; Prisma mock bên dưới đọc/ghi trực tiếp vào object này.
  const now = new Date('2026-05-09T00:00:00.000Z');
  const seed = {
    users: [
      { id: 101, fullName: 'Reader One', email: 'reader@example.com', role: 'READER', avatarUrl: null, violationPoints: 0, isDeleted: false },
      { id: 102, fullName: 'Other Reader', email: 'other@example.com', role: 'READER', avatarUrl: null, violationPoints: 0, isDeleted: false },
      { id: 201, fullName: 'Librarian', email: 'lib@example.com', role: 'LIBRARIAN', avatarUrl: null, violationPoints: 0, isDeleted: false },
    ],
    books: [
      { id: 10, title: 'Clean Code', isbn: '9780132350884', coverImageUrl: null, publishYear: 2008, price: 25, author: { id: 1, fullName: 'Robert C. Martin' } },
      { id: 11, title: 'No PDF Book', isbn: null, coverImageUrl: null, publishYear: 2020, price: 10, author: { id: 1, fullName: 'Author One' } },
    ],
    bookItems: [
      { id: 1, bookId: 10, code: 'CP-001', condition: 'GOOD', status: 'AVAILABLE', isDeleted: false },
      { id: 2, bookId: 10, code: 'CP-002', condition: 'GOOD', status: 'AVAILABLE', isDeleted: false },
      { id: 3, bookId: 10, code: 'CP-003', condition: 'GOOD', status: 'ON_BORROW', isDeleted: false },
      { id: 4, bookId: 10, code: 'CP-004', condition: 'GOOD', status: 'ON_BORROW', isDeleted: false },
    ],
    bookEditions: [{ id: 1, bookId: 10, fileFormat: 'PDF', storageUrl: '/api/files/uploads/ebooks/clean-code.pdf', isDeleted: false }],
    borrowRequests: [
      { id: 5, userId: 101, startDate: now, endDate: new Date('2026-05-20T00:00:00.000Z'), status: 'APPROVED', createdAt: now, updatedAt: now, isDeleted: false },
      { id: 6, userId: 102, startDate: now, endDate: new Date('2026-05-20T00:00:00.000Z'), status: 'PENDING', createdAt: new Date('2026-05-08T00:00:00.000Z'), updatedAt: now, isDeleted: false },
      { id: 7, userId: 101, startDate: now, endDate: new Date('2026-05-20T00:00:00.000Z'), status: 'FULFILLED', createdAt: now, updatedAt: now, isDeleted: false },
    ],
    borrowRequestItems: [
      { borrowRequestId: 5, bookId: 10, quantity: 1, startDate: now, endDate: new Date('2026-05-20T00:00:00.000Z'), createdAt: now, updatedAt: now, isDeleted: false },
      { borrowRequestId: 6, bookId: 10, quantity: 1, startDate: now, endDate: new Date('2026-05-20T00:00:00.000Z'), createdAt: new Date('2026-05-08T00:00:00.000Z'), updatedAt: now, isDeleted: false },
      { borrowRequestId: 7, bookId: 10, quantity: 1, startDate: now, endDate: new Date('2026-05-20T00:00:00.000Z'), createdAt: now, updatedAt: now, isDeleted: false },
    ],
    borrowRecords: [
      { id: 7, userId: 101, borrowDate: new Date('2026-05-01T00:00:00.000Z'), returnDate: new Date('2026-05-20T00:00:00.000Z'), actualReturnDate: null, renewalCount: 0, status: 'BORROWED', createdAt: now, updatedAt: now, isDeleted: false },
      { id: 8, userId: 101, borrowDate: new Date('2026-04-01T00:00:00.000Z'), returnDate: new Date('2026-04-20T00:00:00.000Z'), actualReturnDate: new Date('2026-04-10T00:00:00.000Z'), renewalCount: 0, status: 'RETURNED', createdAt: now, updatedAt: now, isDeleted: false },
      { id: 9, userId: 101, borrowDate: new Date('2026-05-01T00:00:00.000Z'), returnDate: new Date('2026-05-20T00:00:00.000Z'), actualReturnDate: null, renewalCount: 0, status: 'BORROWED', createdAt: now, updatedAt: now, isDeleted: false },
    ],
    borrowBooks: [{ borrowId: 7, bookItemId: 3, isDeleted: false }],
    borrowEbooks: [{ borrowId: 9, bookId: 10, isDeleted: false }],
    payments: [] as Array<{ id: number; policyId: string; borrowRecordId: number; amount: number; isPaid: boolean; dueDate: Date; isDeleted: boolean }>,
    policies: [
      { id: 'LOST_BOOK', name: 'Lost book', amount: 100, unit: 'FIXED', isDeleted: false },
      { id: 'DAMAGED_BOOK', name: 'Damaged book', amount: 100, unit: 'FIXED', isDeleted: false },
      { id: 'WORN_BOOK', name: 'Worn book', amount: 50, unit: 'FIXED', isDeleted: false },
    ],
    nextBorrowRequestId: 20,
    nextBorrowRecordId: 30,
    nextPaymentId: 40,
  };

  return {
    seed,
    db: structuredClone(seed),
    flags: {
      totalAvailableOverride: null as number | null,
      reservedQuantityOverride: null as number | null,
      borrowedCountOverride: null as number | null,
      hasEbook: true,
      alreadyBorrowedEbook: false,
      tokenData: { valid: true, userId: 101, bookId: 10, storageUrl: '/api/files/uploads/ebooks/clean-code.pdf' },
      userServiceReturnsUser: true,
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
  validateRequiredFields: vi.fn((data: Record<string, unknown>, required: string[]) => {
    for (const field of required) {
      const value = data[field];
      if (!value || (typeof value === 'string' && value.trim() === '')) return `Missing required field: ${field}`;
    }
    return null;
  }),
  checkBookHasEbook: vi.fn(async () => testState.flags.hasEbook),
  checkUserBorrowedEbook: vi.fn(async () => testState.flags.alreadyBorrowedEbook),
  generateSignedUrl: vi.fn(async (storageUrl: string, options: { bookId: number; userId: number }) => `/api/ebooks/${options.bookId}/file?token=signed-${options.userId}-${storageUrl}`),
  verifySignedUrlToken: vi.fn(() => testState.flags.tokenData),
}));

function userSelect(userId: number) {
  // Mô phỏng select user tối thiểu mà route cần trả về.
  const user = testState.db.users.find(row => row.id === userId);
  if (!user) return undefined;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    violationPoints: user.violationPoints,
  };
}

function bookWithAuthor(bookId: number) {
  // Mô phỏng include author khi route cần thông tin sách.
  const book = testState.db.books.find(row => row.id === bookId);
  if (!book) return undefined;
  return { ...book };
}

function bookItemWithBook(itemId: number) {
  // Mô phỏng include book trong BookItem để route kiểm tra bản sao thuộc sách nào.
  const item = testState.db.bookItems.find(row => row.id === itemId);
  if (!item) return undefined;
  return { ...item, book: bookWithAuthor(item.bookId) };
}

function requestWithItems(request: any) {
  // Gắn user và items vào BorrowRequest giống dữ liệu Prisma include trả về.
  return {
    ...request,
    user: testState.db.users.find(user => user.id === request.userId),
    items: testState.db.borrowRequestItems
      .filter(item => item.borrowRequestId === request.id && !item.isDeleted)
      .map(item => ({ ...item, book: bookWithAuthor(item.bookId) })),
  };
}

function recordWithDetails(record: any) {
  // Gắn user, sách in, ebook và payment vào BorrowRecord giống include ở route thật.
  return {
    ...record,
    user: userSelect(record.userId),
    borrowBooks: testState.db.borrowBooks
      .filter(link => link.borrowId === record.id && !link.isDeleted)
      .map(link => ({ ...link, bookItem: bookItemWithBook(link.bookItemId) })),
    borrowEbooks: testState.db.borrowEbooks
      .filter(link => link.borrowId === record.id && !link.isDeleted)
      .map(link => ({ ...link, book: { ...bookWithAuthor(link.bookId), bookEditions: testState.db.bookEditions.filter(edition => edition.bookId === link.bookId && !edition.isDeleted) } })),
    payments: testState.db.payments
      .filter(payment => payment.borrowRecordId === record.id && !payment.isDeleted)
      .map(payment => ({ ...payment, policy: testState.db.policies.find(policy => policy.id === payment.policyId) })),
  };
}

function requestMatchesWhere(request: any, where: any = {}) {
  // Helper lọc BorrowRequest theo phần where tối thiểu mà các route đang dùng.
  if (where.id?.in && !where.id.in.includes(request.id)) return false;
  if (typeof where.id === 'number' && request.id !== where.id) return false;
  if (where.userId !== undefined && request.userId !== where.userId) return false;
  if (where.isDeleted !== undefined && request.isDeleted !== where.isDeleted) return false;
  if (where.status !== undefined) {
    if (typeof where.status === 'string' && request.status !== where.status) return false;
    if (where.status.in && !where.status.in.includes(request.status)) return false;
  }
  if (where.items?.some?.bookId !== undefined) {
    if (!testState.db.borrowRequestItems.some(item => item.borrowRequestId === request.id && item.bookId === where.items.some.bookId && !item.isDeleted)) return false;
  }
  return true;
}

function recordMatchesWhere(record: any, where: any = {}) {
  // Helper lọc BorrowRecord theo id/user/status/date và quan hệ sách in/ebook.
  if (where.id !== undefined && record.id !== where.id) return false;
  if (where.userId !== undefined && record.userId !== where.userId) return false;
  if (where.isDeleted !== undefined && record.isDeleted !== where.isDeleted) return false;
  if (where.status !== undefined && record.status !== where.status) return false;
  if (where.returnDate?.gte && (!record.returnDate || record.returnDate < where.returnDate.gte)) return false;
  if (where.borrowEbooks?.some?.bookId !== undefined) {
    if (!testState.db.borrowEbooks.some(link => link.borrowId === record.id && link.bookId === where.borrowEbooks.some.bookId && !link.isDeleted)) return false;
  }
  if (where.borrowBooks?.some?.bookItem?.bookId !== undefined) {
    if (!testState.db.borrowBooks.some(link => link.borrowId === record.id && bookItemWithBook(link.bookItemId)?.bookId === where.borrowBooks.some.bookItem.bookId)) return false;
  }
  return true;
}

const txMock = vi.hoisted(() => ({
  bookItem: {
    findMany: vi.fn(async ({ where }: any) => {
      const ids = where.id?.in || [];
      return testState.db.bookItems
        .filter(item => ids.includes(item.id) && (where.isDeleted === undefined || item.isDeleted === where.isDeleted))
        .map(item => bookItemWithBook(item.id));
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const item = testState.db.bookItems.find(row => row.id === where.id);
      if (!item) throw new Error('BookItem not found');
      Object.assign(item, data);
      return item;
    }),
    count: vi.fn(async ({ where }: any) => {
      if (testState.flags.totalAvailableOverride !== null) return testState.flags.totalAvailableOverride;
      return testState.db.bookItems.filter(item => item.bookId === where.bookId && item.status === where.status && item.isDeleted === where.isDeleted).length;
    }),
  },
  borrowRecord: {
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: testState.db.nextBorrowRecordId++,
        userId: data.userId,
        borrowDate: data.borrowDate,
        returnDate: data.returnDate ?? null,
        actualReturnDate: null,
        renewalCount: 0,
        status: data.status,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      };
      testState.db.borrowRecords.push(created);
      return created;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const record = testState.db.borrowRecords.find(row => row.id === where.id);
      if (!record) throw new Error('BorrowRecord not found');
      if (data.renewalCount?.increment) record.renewalCount += data.renewalCount.increment;
      Object.assign(record, { ...data, renewalCount: record.renewalCount });
      return recordWithDetails(record);
    }),
  },
  borrowBook: {
    create: vi.fn(async ({ data }: any) => {
      testState.db.borrowBooks.push({ ...data, isDeleted: false });
      return data;
    }),
  },
  borrowRequest: {
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: testState.db.nextBorrowRequestId++,
        userId: data.userId,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      };
      testState.db.borrowRequests.push(created);
      const itemData = data.items.create;
      testState.db.borrowRequestItems.push({
        borrowRequestId: created.id,
        bookId: itemData.bookId,
        quantity: itemData.quantity,
        startDate: itemData.startDate,
        endDate: itemData.endDate,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      });
      return requestWithItems(created);
    }),
    findMany: vi.fn(async ({ where }: any) => {
      const ids = where.id?.in || [];
      return testState.db.borrowRequests.filter(request => ids.includes(request.id) && requestMatchesWhere(request, where)).map(requestWithItems);
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const request = testState.db.borrowRequests.find(row => row.id === where.id);
      if (!request) throw new Error('BorrowRequest not found');
      Object.assign(request, data, { updatedAt: new Date() });
      return requestWithItems(request);
    }),
  },
  borrowRequestItem: {
    findFirst: vi.fn(async ({ where }: any) => {
      const item = testState.db.borrowRequestItems.find(row => {
        if (row.bookId !== where.bookId || row.isDeleted) return false;
        const request = testState.db.borrowRequests.find(req => req.id === row.borrowRequestId);
        return request?.status === where.borrowRequest.status && request.isDeleted === where.borrowRequest.isDeleted;
      });
      return item ? { ...item, borrowRequest: requestWithItems(testState.db.borrowRequests.find(req => req.id === item.borrowRequestId)) } : null;
    }),
    aggregate: vi.fn(async ({ where }: any) => {
      if (testState.flags.reservedQuantityOverride !== null) return { _sum: { quantity: testState.flags.reservedQuantityOverride } };
      const quantity = testState.db.borrowRequestItems
        .filter(item => {
          const request = testState.db.borrowRequests.find(req => req.id === item.borrowRequestId);
          const statusFilter = where.borrowRequest.status;
          const matchesStatus = Array.isArray(statusFilter?.in)
            ? statusFilter.in.includes(request?.status)
            : request?.status === statusFilter;
          return item.bookId === where.bookId && matchesStatus && request?.isDeleted === where.borrowRequest.isDeleted;
        })
        .reduce((sum, item) => sum + item.quantity, 0);
      return { _sum: { quantity } };
    }),
  },
  borrowEbook: {
    create: vi.fn(async ({ data }: any) => {
      testState.db.borrowEbooks.push({ ...data, isDeleted: false });
      return data;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const link of testState.db.borrowEbooks) {
        if (link.borrowId === where.borrowId && link.isDeleted === where.isDeleted) {
          Object.assign(link, data);
          count += 1;
        }
      }
      return { count };
    }),
  },
  policy: {
    findUnique: vi.fn(async ({ where }: any) => testState.db.policies.find(policy => policy.id === where.id && policy.isDeleted === where.isDeleted) || null),
  },
  payment: {
    create: vi.fn(async ({ data }: any) => {
      const created = { id: testState.db.nextPaymentId++, isDeleted: false, isPaid: false, ...data };
      testState.db.payments.push(created);
      return created;
    }),
  },
  user: {
    update: vi.fn(async ({ where, data }: any) => {
      const user = testState.db.users.find(row => row.id === where.id);
      if (!user) throw new Error('User not found');
      if (data.violationPoints?.increment) user.violationPoints += data.violationPoints.increment;
      Object.assign(user, data.violationPoints ? {} : data);
      return user;
    }),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: any) => callback(txMock)),
  borrowBook: {
    count: vi.fn(async ({ where }: any) => {
      if (testState.flags.borrowedCountOverride !== null) return testState.flags.borrowedCountOverride;
      return testState.db.borrowBooks.filter(link => {
        const record = testState.db.borrowRecords.find(row => row.id === link.borrowId);
        return !link.isDeleted && record?.userId === where.borrow.userId && record.status === where.borrow.status && record.isDeleted === where.borrow.isDeleted;
      }).length;
    }),
  },
  borrowRequestItem: {
    aggregate: txMock.borrowRequestItem.aggregate,
    findMany: vi.fn(async ({ where }: any) => {
      return testState.db.borrowRequestItems
        .filter(item => {
          const request = testState.db.borrowRequests.find(req => req.id === item.borrowRequestId);
          return item.bookId === where.bookId && request?.status === where.borrowRequest.status && !request.isDeleted && !item.isDeleted;
        })
        .map(item => ({ ...item, borrowRequest: { id: item.borrowRequestId, createdAt: testState.db.borrowRequests.find(req => req.id === item.borrowRequestId)?.createdAt } }));
    }),
  },
  bookItem: {
    count: txMock.bookItem.count,
  },
  book: {
    findFirst: vi.fn(async ({ where }: any) => {
      const book = testState.db.books.find(row => row.id === where.id);
      if (!book) return null;
      if (where.isDeleted === false && (book as any).isDeleted) return null;
      if (where.include?.bookEditions) {
        return { ...book, bookEditions: testState.db.bookEditions.filter(edition => edition.bookId === book.id && !edition.isDeleted && edition.fileFormat === 'PDF') };
      }
      return book;
    }),
  },
  user: {
    findFirst: vi.fn(async ({ where }: any) => {
      const user = testState.db.users.find(row => row.id === where.id && row.role === where.role && row.isDeleted === where.isDeleted);
      return user ? userSelect(user.id) : null;
    }),
  },
  borrowRequest: {
    findMany: vi.fn(async ({ where, skip = 0, take = 10 }: any) => testState.db.borrowRequests.filter(request => requestMatchesWhere(request, where)).map(requestWithItems).slice(skip, skip + take)),
    count: vi.fn(async ({ where }: any) => testState.db.borrowRequests.filter(request => requestMatchesWhere(request, where)).length),
    findFirst: vi.fn(async ({ where }: any) => {
      const request = testState.db.borrowRequests.find(row => requestMatchesWhere(row, where));
      return request ? requestWithItems(request) : null;
    }),
    update: txMock.borrowRequest.update,
  },
  borrowRecord: {
    findMany: vi.fn(async ({ where, skip = 0, take = 10 }: any) => testState.db.borrowRecords.filter(record => recordMatchesWhere(record, where)).map(recordWithDetails).slice(skip, skip + take)),
    count: vi.fn(async ({ where }: any) => testState.db.borrowRecords.filter(record => recordMatchesWhere(record, where)).length),
    findFirst: vi.fn(async ({ where }: any) => {
      const record = testState.db.borrowRecords.find(row => recordMatchesWhere(row, where));
      return record ? recordWithDetails(record) : null;
    }),
  },
}));

const gorseMock = vi.hoisted(() => ({
  createFeedback: vi.fn((userId, bookId, type) => ({ userId, itemId: String(bookId), type })),
  insertFeedback: vi.fn(async () => undefined),
}));

const notificationMock = vi.hoisted(() => ({
  queueNotification: vi.fn(async () => undefined),
}));

const userServiceMock = vi.hoisted(() => ({
  getUserById: vi.fn(async () => (testState.flags.userServiceReturnsUser ? userSelect(101) : null)),
}));

const fileUtilsMock = vi.hoisted(() => ({
  prepareFileForServing: vi.fn(async () => ({
    success: true,
    data: {
      buffer: Buffer.from('%PDF-test'),
      size: 9,
      fileName: 'clean-code.pdf',
    },
  })),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/utils', () => mocks);
vi.mock('@/middleware/auth.middleware', () => ({
  requireReader: (handler: unknown) => handler,
  requireLibrarian: (handler: unknown) => handler,
  requireAuth: (handler: unknown) => handler,
  optionalAuth: (handler: unknown) => handler,
}));
vi.mock('@/services/gorse.service', () => ({ GorseService: gorseMock }));
vi.mock('@/services', () => ({ NotificationService: notificationMock }));
vi.mock('@/services/user.service', () => ({ UserService: userServiceMock }));
vi.mock('@/lib/server-utils', () => ({ FileUtils: fileUtilsMock }));

import { PATCH as cancelBorrowRequest } from '@/app/api/borrow-requests/[id]/route';
import { PATCH as manageBorrowRequest } from '@/app/api/borrow-requests/[id]/manage/route';
import { GET as listBorrowRequests, POST as createBorrowRequest } from '@/app/api/borrow-requests/route';
import { GET as getBorrowRecordById } from '@/app/api/borrow-records/[id]/route';
import { POST as renewBorrowRecord } from '@/app/api/borrow-records/[id]/renew/route';
import { POST as returnBorrowRecord } from '@/app/api/borrow-records/[id]/return/route';
import { POST as returnEbook } from '@/app/api/borrow-records/[id]/return-ebook/route';
import { GET as listAllBorrowRecords } from '@/app/api/borrow-records/all/route';
import { GET as listMyBorrowRecords, POST as createBorrowRecord } from '@/app/api/borrow-records/route';
import { GET as ebookFile } from '@/app/api/ebooks/[bookId]/file/route';
import { GET as ebookView } from '@/app/api/ebooks/[bookId]/view/route';
import { GET as listEbookBorrowRequests, POST as createEbookBorrowRequest } from '@/app/api/ebook-borrow-requests/route';

async function runWithRollback<T>(action: () => Promise<T>): Promise<T> {
  // Chụp riêng flags vì một số case điều chỉnh giả lập số lượng sách, ebook hoặc token.
  const flagSnapshot = structuredClone(testState.flags);
  return runMockDbWithRollback({
    getDb: () => testState.db,
    setDb: db => {
      testState.db = db;
      testState.flags = structuredClone(flagSnapshot);
    },
    action,
  });
}

const readerRequest = (url = 'http://localhost/api/test', body?: unknown) =>
  // Tạo request giả đã được middleware gắn user READER để gọi trực tiếp route handler.
  ({
    url,
    user: { id: 101, role: 'READER' },
    json: async () => body,
  }) as any;

const librarianRequest = (url = 'http://localhost/api/test', body?: unknown) =>
  // Tạo request giả đã được middleware gắn user LIBRARIAN cho các route thủ thư.
  ({
    url,
    user: { id: 201, role: 'LIBRARIAN' },
    json: async () => body,
  }) as any;

describe('Route mượn trả sách với CheckDB/Rollback', () => {
  beforeEach(() => {
    // Arrange chung: reset mock call history, DB ảo và flags điều khiển nhánh nghiệp vụ.
    vi.clearAllMocks();
    testState.db = structuredClone(testState.seed);
    testState.flags = {
      totalAvailableOverride: null,
      reservedQuantityOverride: null,
      borrowedCountOverride: null,
      hasEbook: true,
      alreadyBorrowedEbook: false,
      tokenData: { valid: true, userId: 101, bookId: 10, storageUrl: '/api/files/uploads/ebooks/clean-code.pdf' },
      userServiceReturnsUser: true,
    };
  });

  // Test Case ID: TC_UT_MUONTRA_001
  it('TC_UT_MUONTRA_001 - liệt kê yêu cầu mượn hiện tại của độc giả kèm vị trí hàng chờ', async () => {
    // Act: gọi route GET /api/borrow-requests với user READER và filter status APPROVED.
    const response = await listBorrowRequests(readerRequest('http://localhost/api/borrow-requests?page=1&limit=10&status=APPROVED'));

    // Assert: response thành công và chỉ chứa request của user đăng nhập.
    expect(response.success).toBe(true);
    expect(response.data.borrowRequests.every((request: any) => request.userId === 101)).toBe(true);
    // Assert query: route truyền userId và status vào prisma.borrowRequest.findMany.
    expect(prismaMock.borrowRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 101, status: 'APPROVED' }) }));
  });

  // Test Case ID: TC_UT_MUONTRA_002
  it('TC_UT_MUONTRA_002 - tạo yêu cầu mượn được duyệt khi còn bản in khả dụng', async () => {
    // Arrange: snapshot DB trước khi tạo request để kiểm tra rollback sau cùng.
    const before = structuredClone(testState.db);
    // Act: chạy POST /api/borrow-requests trong rollback scope và ghi evidence JSON.
    const response = await runWithRollback(async () => {
      // Arrange trong scope: giả lập còn 2 bản khả dụng và không có đặt chỗ.
      testState.flags.totalAvailableOverride = 2;
      testState.flags.reservedQuantityOverride = 0;
      // Act: tạo request mượn một đầu sách trong khoảng ngày hợp lệ.
      const created = await createBorrowRequest(
        readerRequest('http://localhost/api/borrow-requests', {
          userId: 101,
          startDate: '2026-05-10',
          endDate: '2026-05-20',
          items: [{ bookId: 11, quantity: 1, startDate: '2026-05-10', endDate: '2026-05-20' }],
        })
      );

      // Assert CheckDB: request mới được ghi vào DB ảo với status APPROVED.
      expect(testState.db.borrowRequests.some(request => request.id === created.data.borrowRequest.id && request.status === 'APPROVED')).toBe(true); // CheckDB
      return created;
    });

    // Assert response: tạo thành công trả status 201.
    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    // Assert rollback: DB ảo quay về snapshot trước khi tạo.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_003
  it('TC_UT_MUONTRA_003 - tạo yêu cầu mượn chờ duyệt khi số lượng khả dụng bằng 0', async () => {
    // Act: rollback scope dùng flags để giả lập tổng bản khả dụng đã bị đặt hết.
    const response = await runWithRollback(async () => {
      testState.flags.totalAvailableOverride = 1;
      testState.flags.reservedQuantityOverride = 1;
      return createBorrowRequest(
        readerRequest('http://localhost/api/borrow-requests', {
          userId: 101,
          startDate: '2026-05-10',
          endDate: '2026-05-20',
          items: [{ bookId: 11, quantity: 1, startDate: '2026-05-10', endDate: '2026-05-20' }],
        })
      );
    });

    // Assert: request vẫn tạo được nhưng trạng thái là PENDING và có vị trí hàng chờ.
    expect(response.success).toBe(true);
    expect(response.data.borrowRequest.status).toBe('PENDING');
    expect(response.data.queuePosition).toBeGreaterThan(0);
  });

  // Test Case ID: TC_UT_MUONTRA_004
  it('TC_UT_MUONTRA_004 - từ chối yêu cầu mượn khi userId trong body khác độc giả đăng nhập', async () => {
    // Act: gửi userId=102 trong body trong khi request.user là 101.
    const response = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 102, startDate: '2026-05-10', endDate: '2026-05-20', items: [{ bookId: 10, quantity: 1, startDate: '2026-05-10', endDate: '2026-05-20' }] }));

    // Assert: route chặn user mismatch và không gọi transaction create.
    expect(response.success).toBe(false);
    expect(response.error).toBe('User ID does not match authenticated user');
    expect(txMock.borrowRequest.create).not.toHaveBeenCalled();
  });

  // Test Case ID: TC_UT_MUONTRA_005
  it('TC_UT_MUONTRA_005 - từ chối yêu cầu mượn có nhiều hơn một đầu sách', async () => {
    // Act: gửi hai item khác nhau để kiểm tra rule mỗi request chỉ được một đầu sách.
    const response = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 101, startDate: '2026-05-10', endDate: '2026-05-20', items: [{ bookId: 10, quantity: 1 }, { bookId: 11, quantity: 1 }] }));

    // Assert: route trả lỗi đúng rule nghiệp vụ.
    expect(response.success).toBe(false);
    expect(response.error).toBe('Only one book can be requested per borrow request');
  });

  // Test Case ID: TC_UT_MUONTRA_006
  it('TC_UT_MUONTRA_006 - từ chối yêu cầu mượn khi số lượng khác 1 hoặc nhỏ hơn 1', async () => {
    // Act: quantity '0' kiểm tra rule số lượng phải lớn hơn 0.
    const quantityZero = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 101, startDate: '2026-05-10', endDate: '2026-05-20', items: [{ bookId: 10, quantity: '0', startDate: '2026-05-10', endDate: '2026-05-20' }] }));
    // Act: quantity 2 kiểm tra rule chỉ được mượn một bản trong một request.
    const quantityTwo = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 101, startDate: '2026-05-10', endDate: '2026-05-20', items: [{ bookId: 10, quantity: 2, startDate: '2026-05-10', endDate: '2026-05-20' }] }));

    // Assert: mỗi payload sai trả đúng lỗi tương ứng.
    expect(quantityZero.error).toBe('Quantity must be greater than 0');
    expect(quantityTwo.error).toBe('Only 1 book item can be requested per borrow request');
  });

  // Test Case ID: TC_UT_MUONTRA_007
  it('TC_UT_MUONTRA_007 - từ chối khi độc giả đã đạt giới hạn 3 bản sách đang mượn', async () => {
    // Arrange: override count sách đang mượn của user lên 3.
    testState.flags.borrowedCountOverride = 3;
    // Act: tạo thêm request mượn sách in.
    const response = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 101, startDate: '2026-05-10', endDate: '2026-05-20', items: [{ bookId: 10, quantity: 1, startDate: '2026-05-10', endDate: '2026-05-20' }] }));

    // Assert: route chặn vì vượt giới hạn mượn tối đa.
    expect(response.success).toBe(false);
    expect(response.error).toContain('maximum borrowing limit of 3');
  });

  // Test Case ID: TC_UT_MUONTRA_008
  it('TC_UT_MUONTRA_008 - từ chối yêu cầu mượn trùng sách đang hoạt động', async () => {
    // Act: user 101 đã có request APPROVED cho book 10 trong seed.
    const response = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 101, startDate: '2026-05-10', endDate: '2026-05-20', items: [{ bookId: 10, quantity: 1, startDate: '2026-05-10', endDate: '2026-05-20' }] }));

    // Assert: route phát hiện request trùng đang hoạt động.
    expect(response.success).toBe(false);
    expect(response.error).toContain('already have an active borrow request');
  });

  // Test Case ID: TC_UT_MUONTRA_009
  it('TC_UT_MUONTRA_009 - kiểm tra hợp lệ ngày bắt đầu và ngày kết thúc yêu cầu mượn', async () => {
    // Act: tạo ba payload sai ngày gồm format sai, ngày kết thúc trước ngày bắt đầu và kỳ hạn quá 30 ngày.
    const invalidDate = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 101, startDate: 'bad-date', endDate: '2026-05-20', items: [{ bookId: 11, quantity: 1, startDate: 'bad-date', endDate: '2026-05-20' }] }));
    const reverseDate = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 101, startDate: '2026-05-20', endDate: '2026-05-10', items: [{ bookId: 11, quantity: 1, startDate: '2026-05-20', endDate: '2026-05-10' }] }));
    const tooLong = await createBorrowRequest(readerRequest('http://localhost/api/borrow-requests', { userId: 101, startDate: '2026-05-10', endDate: '2026-07-01', items: [{ bookId: 11, quantity: 1, startDate: '2026-05-10', endDate: '2026-07-01' }] }));

    // Assert: route trả đúng message cho từng rule ngày tháng.
    expect(invalidDate.error).toBe('Invalid date format');
    expect(reverseDate.error).toBe('End date must be after start date');
    expect(tooLong.error).toBe('Borrow period cannot exceed 30 days');
  });

  // Test Case ID: TC_UT_MUONTRA_010
  it('TC_UT_MUONTRA_010 - hủy yêu cầu đang chờ/đã duyệt của chính độc giả và rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước khi hủy request.
    const before = structuredClone(testState.db);
    // Act: PATCH /api/borrow-requests/[id] trong rollback scope.
    await runWithRollback(async () => {
      const response = await cancelBorrowRequest(
        readerRequest('http://localhost/api/borrow-requests/5', { status: 'CANCELLED' }),
        { params: Promise.resolve({ id: '5' }) } as any
      );

      // Assert response và CheckDB: request id 5 chuyển sang CANCELLED trong DB ảo.
      expect(response.success).toBe(true);
      expect(testState.db.borrowRequests.find(request => request.id === 5)?.status).toBe('CANCELLED'); // CheckDB
    });
    // Assert rollback: status request quay về seed.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_011
  it('TC_UT_MUONTRA_011 - từ chối hủy yêu cầu đã hoàn tất', async () => {
    // Act: request id 7 trong seed đang FULFILLED, không được hủy.
    const response = await cancelBorrowRequest(
      readerRequest('http://localhost/api/borrow-requests/7', { status: 'CANCELLED' }),
      { params: Promise.resolve({ id: '7' }) } as any
    );

    // Assert: route trả lỗi rule trạng thái.
    expect(response.success).toBe(false);
    expect(response.error).toContain('Only PENDING or APPROVED requests can be cancelled');
  });

  // Test Case ID: TC_UT_MUONTRA_012
  it('TC_UT_MUONTRA_012 - thủ thư duyệt yêu cầu đang chờ', async () => {
    // Arrange: snapshot DB trước khi thủ thư duyệt request.
    const before = structuredClone(testState.db);
    // Act: LIBRARIAN gọi route manage để chuyển request id 6 từ PENDING sang APPROVED.
    await runWithRollback(async () => {
      const response = await manageBorrowRequest(
        librarianRequest('http://localhost/api/borrow-requests/6/manage', { status: 'APPROVED' }),
        { params: Promise.resolve({ id: '6' }) } as any
      );

      // Assert response và CheckDB: status đã cập nhật trong DB ảo.
      expect(response.success).toBe(true);
      expect(testState.db.borrowRequests.find(request => request.id === 6)?.status).toBe('APPROVED'); // CheckDB
    });
    // Assert rollback: request id 6 quay về PENDING.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_013
  it('TC_UT_MUONTRA_013 - thủ thư từ chối yêu cầu hợp lệ và chặn chuyển trạng thái sai', async () => {
    // Act: từ chối request hợp lệ trong rollback scope để không làm bẩn DB ảo.
    const rejected = await runWithRollback(() =>
      manageBorrowRequest(librarianRequest('http://localhost/api/borrow-requests/5/manage', { status: 'REJECTED' }), { params: Promise.resolve({ id: '5' }) } as any)
    );
    // Act: thử approve request không còn ở trạng thái PENDING theo seed để kiểm tra nhánh lỗi.
    const invalid = await manageBorrowRequest(
      librarianRequest('http://localhost/api/borrow-requests/5/manage', { status: 'APPROVED' }),
      { params: Promise.resolve({ id: '5' }) } as any
    );

    // Assert: reject thành công, approve sai trạng thái bị chặn.
    expect(rejected.success).toBe(true);
    expect(rejected.data.borrowRequest.status).toBe('REJECTED');
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Can only approve PENDING requests');
  });

  // Test Case ID: TC_UT_MUONTRA_014
  it('TC_UT_MUONTRA_014 - tạo phiếu mượn sách in và cập nhật bản sao sang ON_BORROW', async () => {
    // Arrange: snapshot DB trước khi tạo phiếu mượn.
    const before = structuredClone(testState.db);
    // Act: tạo BorrowRecord cho hai bản sao sách trong rollback scope.
    const response = await runWithRollback(async () => {
      const created = await createBorrowRecord(
        librarianRequest('http://localhost/api/borrow-records', {
          userId: 101,
          borrowDate: '2026-05-10',
          returnDate: '2026-05-20',
          bookItemIds: [1, 2],
        })
      );

      // Assert CheckDB: phiếu mượn mới có status BORROWED.
      expect(testState.db.borrowRecords.some(record => record.id === created.data.borrowRecord.id && record.status === 'BORROWED')).toBe(true); // CheckDB
      // Assert CheckDB: các bản sao được chọn chuyển sang ON_BORROW.
      expect(testState.db.bookItems.filter(item => [1, 2].includes(item.id)).every(item => item.status === 'ON_BORROW')).toBe(true);
      return created;
    });

    // Assert response, side effect Gorse và rollback.
    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(gorseMock.insertFeedback).toHaveBeenCalled();
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_015
  it('TC_UT_MUONTRA_015 - từ chối tạo phiếu mượn khi bookItemIds bị trùng', async () => {
    // Act: gửi cùng một bookItemId hai lần để route validate duplicate ids.
    const response = await createBorrowRecord(librarianRequest('http://localhost/api/borrow-records', { userId: 101, borrowDate: '2026-05-10', returnDate: '2026-05-20', bookItemIds: [1, 1] }));

    // Assert: route trả lỗi trùng bản sao.
    expect(response.success).toBe(false);
    expect(response.error).toBe('Duplicate bookItemIds are not allowed');
  });

  // Test Case ID: TC_UT_MUONTRA_016
  it('TC_UT_MUONTRA_016 - từ chối tạo phiếu mượn với bản sao không khả dụng', async () => {
    // Act: bookItem id 3 trong seed đang ON_BORROW nên không thể tạo phiếu mượn mới.
    const response = await createBorrowRecord(librarianRequest('http://localhost/api/borrow-records', { userId: 101, borrowDate: '2026-05-10', returnDate: '2026-05-20', bookItemIds: [3] }));

    // Assert: route trả lỗi bản sao không khả dụng.
    expect(response.success).toBe(false);
    expect(response.error).toContain('Book items are not available');
  });

  // Test Case ID: TC_UT_MUONTRA_017
  it('TC_UT_MUONTRA_017 - kiểm tra hợp lệ độc giả và ngày mượn khi tạo phiếu mượn', async () => {
    // Act: tạo bốn payload sai gồm userId không hợp lệ, ngày sai format, ngày trả trước ngày mượn và kỳ hạn quá dài.
    const invalidUser = await createBorrowRecord(librarianRequest('http://localhost/api/borrow-records', { userId: '0', borrowDate: '2026-05-10', returnDate: '2026-05-20', bookItemIds: [1] }));
    const invalidDate = await createBorrowRecord(librarianRequest('http://localhost/api/borrow-records', { userId: 101, borrowDate: 'bad', returnDate: '2026-05-20', bookItemIds: [1] }));
    const reverseDate = await createBorrowRecord(librarianRequest('http://localhost/api/borrow-records', { userId: 101, borrowDate: '2026-05-20', returnDate: '2026-05-10', bookItemIds: [1] }));
    const tooLong = await createBorrowRecord(librarianRequest('http://localhost/api/borrow-records', { userId: 101, borrowDate: '2026-05-10', returnDate: '2026-07-01', bookItemIds: [1] }));

    // Assert: mỗi payload sai trả đúng message validate.
    expect(invalidUser.error).toBe('Invalid userId');
    expect(invalidDate.error).toBe('Invalid date format');
    expect(reverseDate.error).toBe('Return date must be after borrow date');
    expect(tooLong.error).toBe('Borrow period cannot exceed 30 days');
  });

  // Test Case ID: TC_UT_MUONTRA_018
  it('TC_UT_MUONTRA_018 - hoàn tất yêu cầu đã duyệt khi bản sao được chọn đáp ứng số lượng', async () => {
    // Act: tạo phiếu mượn từ request id 5 trong rollback scope.
    const response = await runWithRollback(() =>
      createBorrowRecord(librarianRequest('http://localhost/api/borrow-records', { userId: 101, borrowDate: '2026-05-10', returnDate: '2026-05-20', bookItemIds: [1], requestIds: [5] }))
    );

    // Assert: request liên quan được đánh dấu FULFILLED trong response.
    expect(response.success).toBe(true);
    expect(response.data.fulfilledRequests).toEqual([{ id: 5, status: 'FULFILLED' }]);
  });

  // Test Case ID: TC_UT_MUONTRA_019
  it('TC_UT_MUONTRA_019 - trả sách in không có vi phạm và rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước khi trả sách.
    const before = structuredClone(testState.db);
    // Act: trả phiếu mượn id 7, cập nhật condition GOOD và không gửi violations.
    const response = await runWithRollback(async () => {
      const returned = await returnBorrowRecord(
        librarianRequest('http://localhost/api/borrow-records/7/return', { conditionUpdates: { 3: 'GOOD' } }),
        { params: Promise.resolve({ id: '7' }) } as any
      );

      // Assert CheckDB: borrow record chuyển RETURNED.
      expect(testState.db.borrowRecords.find(record => record.id === 7)?.status).toBe('RETURNED'); // CheckDB
      // Assert CheckDB: bản sao được trả về AVAILABLE.
      expect(testState.db.bookItems.find(item => item.id === 3)?.status).toBe('AVAILABLE');
      // Assert CheckDB: không có vi phạm nên không tạo payment.
      expect(testState.db.payments).toHaveLength(0);
      return returned;
    });

    // Assert response và rollback.
    expect(response.success).toBe(true);
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_020
  it('TC_UT_MUONTRA_020 - trả sách in có vi phạm, thanh toán, điểm phạt và rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước khi trả sách có vi phạm.
    const before = structuredClone(testState.db);
    // Act: trả sách với policy LOST_BOOK và condition LOST.
    const response = await runWithRollback(async () => {
      const returned = await returnBorrowRecord(
        librarianRequest('http://localhost/api/borrow-records/7/return', {
          violations: [{ policyId: 'LOST_BOOK', bookItemId: 3, amount: 25000, dueDate: '2026-05-15' }],
          conditionUpdates: { 3: 'LOST' },
        }),
        { params: Promise.resolve({ id: '7' }) } as any
      );

      // Assert CheckDB: route tạo một payment cho vi phạm.
      expect(testState.db.payments).toHaveLength(1); // CheckDB
      // Assert CheckDB: user bị cộng điểm vi phạm.
      expect(testState.db.users.find(user => user.id === 101)?.violationPoints).toBe(3);
      // Assert CheckDB: bản sao chuyển sang trạng thái LOST.
      expect(testState.db.bookItems.find(item => item.id === 3)?.status).toBe('LOST');
      return returned;
    });

    // Assert response có payment và rollback khôi phục DB.
    expect(response.success).toBe(true);
    expect(response.data.payments).toHaveLength(1);
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_021
  it('TC_UT_MUONTRA_021 - từ chối trả phiếu mượn không tồn tại hoặc đã trả', async () => {
    // Act: thử trả record không tồn tại và record đã RETURNED trong seed.
    const missing = await returnBorrowRecord(librarianRequest('http://localhost/api/borrow-records/999/return', {}), { params: Promise.resolve({ id: '999' }) } as any);
    const alreadyReturned = await returnBorrowRecord(librarianRequest('http://localhost/api/borrow-records/8/return', {}), { params: Promise.resolve({ id: '8' }) } as any);

    // Assert: mỗi nhánh trả đúng lỗi nghiệp vụ.
    expect(missing.error).toBe('Borrow record not found');
    expect(alreadyReturned.error).toBe('This borrow record has already been returned');
  });

  // Test Case ID: TC_UT_MUONTRA_022
  it('TC_UT_MUONTRA_022 - gia hạn phiếu mượn đang hoạt động và rollback dữ liệu', async () => {
    // Arrange: chỉnh request liên quan để không còn đặt chỗ cản trở gia hạn.
    testState.db.borrowRequests.find(request => request.id === 5)!.status = 'FULFILLED';
    testState.db.borrowRequests.find(request => request.id === 6)!.status = 'REJECTED';
    // Arrange: snapshot sau khi chỉnh setup, dùng làm mốc rollback.
    const before = structuredClone(testState.db);
    // Act: độc giả gọi route renew cho borrow record id 7.
    await runWithRollback(async () => {
      const response = await renewBorrowRecord(readerRequest('http://localhost/api/borrow-records/7/renew'), { params: Promise.resolve({ id: '7' }) } as any);

      // Assert response và CheckDB: renewalCount tăng thêm 1.
      expect(response.success).toBe(true);
      expect(testState.db.borrowRecords.find(record => record.id === 7)?.renewalCount).toBe(1); // CheckDB
    });
    // Assert rollback: renewalCount quay lại giá trị trước khi action chạy.
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_023
  it('TC_UT_MUONTRA_023 - từ chối gia hạn khi đã trả, quá số lần, quá hạn hoặc có đặt chỗ', async () => {
    // Act: record id 8 đã trả nên không thể gia hạn.
    const returned = await renewBorrowRecord(readerRequest('http://localhost/api/borrow-records/8/renew'), { params: Promise.resolve({ id: '8' }) } as any);
    // Arrange/Act: đẩy renewalCount lên 3 để chạm giới hạn số lần gia hạn.
    testState.db.borrowRecords.find(record => record.id === 7)!.renewalCount = 3;
    const maxRenewal = await renewBorrowRecord(readerRequest('http://localhost/api/borrow-records/7/renew'), { params: Promise.resolve({ id: '7' }) } as any);
    // Arrange/Act: reset renewalCount, seed còn đặt chỗ nên route phải chặn vì pending reservations.
    testState.db.borrowRecords.find(record => record.id === 7)!.renewalCount = 0;
    const reservationConflict = await renewBorrowRecord(readerRequest('http://localhost/api/borrow-records/7/renew'), { params: Promise.resolve({ id: '7' }) } as any);

    // Assert: ba nhánh lỗi gia hạn trả đúng message.
    expect(returned.error).toContain('already been returned');
    expect(maxRenewal.error).toContain('Maximum renewal limit reached');
    expect(reservationConflict.error).toContain('pending reservations');
  });

  // Test Case ID: TC_UT_MUONTRA_024
  it('TC_UT_MUONTRA_024 - tạo yêu cầu mượn ebook kèm phiếu mượn đã hoàn tất', async () => {
    // Arrange: snapshot DB trước khi mượn ebook.
    const before = structuredClone(testState.db);
    // Act: tạo ebook borrow request trong rollback scope.
    const response = await runWithRollback(async () => {
      const created = await createEbookBorrowRequest(
        readerRequest('http://localhost/api/ebook-borrow-requests', { userId: 101, bookId: 10, startDate: '2026-05-10', endDate: '2026-05-20' })
      );

      // Assert CheckDB: route tạo BorrowRecord BORROWED cho ebook.
      expect(testState.db.borrowRecords.some(record => record.id === created.data.borrowRecord.id && record.status === 'BORROWED')).toBe(true); // CheckDB
      // Assert CheckDB: bảng liên kết BorrowEbook có record trỏ tới book 10.
      expect(testState.db.borrowEbooks.some(link => link.borrowId === created.data.borrowRecord.id && link.bookId === 10)).toBe(true);
      return created;
    });

    // Assert response, notification side effect và rollback.
    expect(response.success).toBe(true);
    expect(response.status).toBe(201);
    expect(notificationMock.queueNotification).toHaveBeenCalled();
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_025
  it('TC_UT_MUONTRA_025 - từ chối các trường hợp mượn ebook không hợp lệ', async () => {
    // Arrange/Act: giả lập sách không có ebook để route trả lỗi noPdf.
    testState.flags.hasEbook = false;
    const noPdf = await createEbookBorrowRequest(readerRequest('http://localhost/api/ebook-borrow-requests', { userId: 101, bookId: 11, startDate: '2026-05-10', endDate: '2026-05-20' }));
    // Arrange/Act: giả lập user đã mượn ebook này.
    testState.flags.hasEbook = true;
    testState.flags.alreadyBorrowedEbook = true;
    const alreadyBorrowed = await createEbookBorrowRequest(readerRequest('http://localhost/api/ebook-borrow-requests', { userId: 101, bookId: 10, startDate: '2026-05-10', endDate: '2026-05-20' }));
    // Act: body userId khác user đăng nhập để kiểm tra mismatch.
    const userMismatch = await createEbookBorrowRequest(readerRequest('http://localhost/api/ebook-borrow-requests', { userId: 102, bookId: 10, startDate: '2026-05-10', endDate: '2026-05-20' }));

    // Assert: mỗi trường hợp bất hợp lệ trả đúng lỗi.
    expect(noPdf.error).toBe('This book does not have an electronic version');
    expect(alreadyBorrowed.error).toContain('already borrowed this ebook');
    expect(userMismatch.error).toBe('User ID does not match authenticated user');
  });

  // Test Case ID: TC_UT_MUONTRA_026
  it('TC_UT_MUONTRA_026 - trả về URL xem ebook đã ký cho lượt mượn còn hiệu lực', async () => {
    // Act: gọi route view ebook với user READER có lượt mượn hợp lệ trong seed.
    const response = await ebookView(readerRequest('http://localhost/api/ebooks/10/view'), { params: Promise.resolve({ bookId: '10' }) } as any);

    // Assert: response chứa signed view URL và gọi helper generateSignedUrl.
    expect(response.success).toBe(true);
    expect(response.data.viewUrl).toContain('/api/ebooks/10/file?token=');
    expect(mocks.generateSignedUrl).toHaveBeenCalled();
  });

  // Test Case ID: TC_UT_MUONTRA_027
  it('TC_UT_MUONTRA_027 - từ chối token ebook không hợp lệ hoặc thiếu quyền truy cập', async () => {
    // Act: thiếu token query phải trả 400.
    const missingToken = await ebookFile({ url: 'http://localhost/api/ebooks/10/file' } as any, { params: Promise.resolve({ bookId: '10' }) } as any);
    // Arrange/Act: token hết hạn hoặc invalid phải trả 403.
    testState.flags.tokenData = { valid: false, error: 'Token expired' } as any;
    const expired = await ebookFile({ url: 'http://localhost/api/ebooks/10/file?token=expired' } as any, { params: Promise.resolve({ bookId: '10' }) } as any);
    // Arrange/Act: token hợp lệ nhưng bookId không khớp params cũng bị cấm.
    testState.flags.tokenData = { valid: true, userId: 101, bookId: 11, storageUrl: '/api/files/uploads/ebooks/clean-code.pdf' } as any;
    const wrongBook = await ebookFile({ url: 'http://localhost/api/ebooks/10/file?token=wrong' } as any, { params: Promise.resolve({ bookId: '10' }) } as any);

    // Assert: status code phản ánh đúng nhánh bảo vệ file ebook.
    expect(missingToken.status).toBe(400);
    expect(expired.status).toBe(403);
    expect(wrongBook.status).toBe(403);
  });

  // Test Case ID: TC_UT_MUONTRA_028
  it('TC_UT_MUONTRA_028 - trả ebook sớm và xóa mềm BorrowEbook với rollback dữ liệu', async () => {
    // Arrange: snapshot DB trước khi trả ebook.
    const before = structuredClone(testState.db);
    // Act: gọi route return-ebook trong rollback scope.
    const response = await runWithRollback(async () => {
      const returned = await returnEbook(readerRequest('http://localhost/api/borrow-records/9/return-ebook'), { params: Promise.resolve({ id: '9' }) } as any);

      // Assert CheckDB: borrow record ebook chuyển RETURNED.
      expect(testState.db.borrowRecords.find(record => record.id === 9)?.status).toBe('RETURNED'); // CheckDB
      // Assert CheckDB: BorrowEbook liên quan được xóa mềm.
      expect(testState.db.borrowEbooks.find(link => link.borrowId === 9)?.isDeleted).toBe(true);
      return returned;
    });

    // Assert response, notification side effect và rollback.
    expect(response.success).toBe(true);
    expect(notificationMock.queueNotification).toHaveBeenCalled();
    expect(testState.db).toEqual(before); // Rollback
  });

  // Test Case ID: TC_UT_MUONTRA_029
  it('TC_UT_MUONTRA_029 - liệt kê phiếu mượn và yêu cầu ebook ở các route chỉ đọc', async () => {
    // Act: gọi các route chỉ đọc để kiểm tra chúng hoạt động với request giả phù hợp role.
    const mine = await listMyBorrowRecords(readerRequest('http://localhost/api/borrow-records?page=1&limit=10&status=BORROWED'));
    const all = await listAllBorrowRecords(librarianRequest('http://localhost/api/borrow-records/all?page=1&limit=10&userId=101&bookId=10&search=Reader'));
    const detail = await getBorrowRecordById(readerRequest('http://localhost/api/borrow-records/7'), { params: Promise.resolve({ id: '7' }) } as any);
    const ebooks = await listEbookBorrowRequests(readerRequest('http://localhost/api/ebook-borrow-requests?page=1&limit=10&status=FULFILLED'));

    // Assert: tất cả route đọc trả success, không cần rollback vì không ghi DB.
    expect(mine.success).toBe(true);
    expect(all.success).toBe(true);
    expect(detail.success).toBe(true);
    expect(ebooks.success).toBe(true);
  });
});
