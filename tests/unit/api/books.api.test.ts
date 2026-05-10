import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectBearerHeader,
  getApiMocks,
  latestFetchCall,
  resetApiMocks,
} from './api-test-utils';
import { BookApi } from '@/api/book.api';

const apiMocks = getApiMocks();

describe('API client sách', () => {
  beforeEach(() => {
    // Arrange chung: reset toàn bộ mock API adapter trước từng test case.
    resetApiMocks();
  });

  // Test Case ID: TC_UT_API_BOOK_001
  it('TC_UT_API_BOOK_001 - tạo đúng query danh sách sách với toàn bộ bộ lọc kho', async () => {
    // Act: gọi getBooks với đủ filter để kiểm tra URLSearchParams của API client.
    await BookApi.getBooks({
      page: 1,
      limit: 10,
      search: 'Clean Code',
      authorIds: [1, 2],
      categoryIds: [3],
      languageCodes: ['en', 'vi'],
      publishYearFrom: 2000,
      publishYearTo: 2026,
      status: 'ACTIVE',
      sortBy: 'title',
      sortOrder: 'asc',
      isDeleted: false,
      availableAt: ['book-copy', 'ebook'],
    });

    // Assert: lấy request cuối cùng để kiểm tra URL và headers.
    const [url, options] = latestFetchCall();
    // Assert: query phải serialize đúng mảng authorIds/languageCodes/availableAt bằng key lặp lại.
    expect(url).toBe(
      '/api/books?page=1&limit=10&search=Clean+Code&authorIds=1&authorIds=2&categoryIds=3&languageCodes=en&languageCodes=vi&publishYearFrom=2000&publishYearTo=2026&status=ACTIVE&sortBy=title&sortOrder=asc&isDeleted=false&availableAt=book-copy&availableAt=ebook'
    );
    // Assert: getBooks dùng GET và có Authorization Bearer.
    expect(options?.method).toBe('GET');
    expectBearerHeader(options);
  });

  // Test Case ID: TC_UT_API_BOOK_002
  it('TC_UT_API_BOOK_002 - gửi đúng request CRUD sách với JSON và header xác thực', async () => {
    // Act: tạo sách bằng JSON body.
    await BookApi.createBook({ authorId: 1, title: 'Book A' } as never);
    // Assert: create dùng POST, content-type JSON và Bearer token.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/books', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ authorId: 1, title: 'Book A' }),
    });

    // Act/Assert: detail route phải dùng GET /api/books/:id.
    await BookApi.getBookById(5);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/books/5', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Act: cập nhật sách bằng JSON.
    await BookApi.updateBook(5, { title: 'Book B' } as never);
    // Assert: update dùng PUT vào đúng id và stringify payload.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/books/5', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ title: 'Book B' }),
    });

    // Act/Assert: delete dùng DELETE và vẫn gửi Authorization.
    await BookApi.deleteBook(5);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/books/5', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  // Test Case ID: TC_UT_API_BOOK_003
  it('TC_UT_API_BOOK_003 - gửi form upload sách và ánh xạ phân trang searchBooks', async () => {
    // Arrange: Blob giả lập file cover để FormData có file mà không cần đọc filesystem.
    const file = new Blob(['cover'], { type: 'image/png' }) as File;

    // Act: tạo sách kèm file, client phải chuyển payload sang FormData.
    await BookApi.createBookWithFile(
      {
        authorId: 2,
        title: 'Upload Book',
        isbn: '978',
        publishYear: 2020,
        publisher: 'NXB',
        pageCount: 100,
        price: 9,
        edition: '1',
        description: 'Mo ta',
        isDeleted: false,
        categories: [1, 2],
      } as never,
      file
    );
    // Assert: request create-with-file dùng POST, body FormData và không tự set content-type multipart.
    let [, options] = latestFetchCall();
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(FormData);
    expect(options?.headers).toEqual({ Authorization: 'Bearer token-123' });

    // Act: cập nhật sách kèm file để kiểm tra nhánh update FormData.
    await BookApi.updateBookWithFile(2, { title: 'Updated', categories: [3] } as never, file);
    // Assert: update-with-file dùng PUT và body FormData.
    [, options] = latestFetchCall();
    expect(options?.method).toBe('PUT');
    expect(options?.body).toBeInstanceOf(FormData);

    // Arrange: mock handleJson trả dữ liệu phân trang theo shape route.
    apiMocks.handleJson.mockResolvedValueOnce({
      books: [{ id: 1 }],
      pagination: { total: 11 },
    });
    // Act: searchBooks gọi API rồi map lại page/size/total/hasNext cho UI dùng.
    const result = await BookApi.searchBooks({ keyword: 'design', page: 1, size: 5 });
    // Assert: hasNext=true vì total 11 lớn hơn page 1 * size 5.
    expect(result).toEqual({
      books: [{ id: 1 }],
      page: 1,
      size: 5,
      total: 11,
      hasNext: true,
    });

    // Act/Assert: getAllBooks gọi endpoint all với GET và Bearer token.
    await BookApi.getAllBooks();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/books/all', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Act/Assert: getBookAvailableCount gọi route đếm bản khả dụng theo book id.
    await BookApi.getBookAvailableCount(10);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/books/10/available-count', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  // Test Case ID: TC_UT_API_BOOK_004
  it('TC_UT_API_BOOK_004 - xử lý endpoint mặc định, thiếu token và trường upload tùy chọn', async () => {
    // Act/Assert: getBooks không có filter giữ endpoint mặc định hiện tại của client.
    await BookApi.getBooks();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/books?', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Arrange: giả lập thiếu token để kiểm tra headers khi user chưa đăng nhập.
    apiMocks.getAccessToken.mockReturnValueOnce(null);
    // Act/Assert: create JSON khi thiếu token vẫn có content-type nhưng không có Authorization.
    await BookApi.createBook({ authorId: 1, title: 'No token' } as never);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorId: 1, title: 'No token' }),
    });

    // Arrange: file cover dùng cho các nhánh FormData optional fields.
    const coverFile = new Blob(['cover'], { type: 'image/png' }) as File;
    // Act: tạo sách chỉ có các field bắt buộc để kiểm tra optional field không bị append.
    await BookApi.createBookWithFile({ authorId: 1, title: 'Required only' } as never, coverFile);
    let [, options] = latestFetchCall();
    const createBody = options?.body as FormData;
    // Assert: field bắt buộc có trong FormData, optional isbn không có.
    expect(createBody.get('authorId')).toBe('1');
    expect(createBody.get('title')).toBe('Required only');
    expect(createBody.get('isbn')).toBeNull();

    // Act: update với chuỗi rỗng/undefined để kiểm tra cách append optional fields.
    await BookApi.updateBookWithFile(
      1,
      {
        isbn: '',
        publishYear: undefined,
        publisher: '',
        pageCount: undefined,
        price: undefined,
        edition: '',
        description: '',
        isDeleted: false,
      } as never,
      coverFile
    );
    [, options] = latestFetchCall();
    const updateBody = options?.body as FormData;
    // Assert: chuỗi rỗng vẫn được gửi, undefined không ép thành chuỗi "undefined", boolean được stringify.
    expect(updateBody.get('isbn')).toBe('');
    expect(updateBody.get('publisher')).toBe('');
    expect(updateBody.get('isDeleted')).toBe('false');
  });
});
