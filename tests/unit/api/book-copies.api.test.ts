import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectBearerHeader,
  getApiMocks,
  latestFetchCall,
  resetApiMocks,
} from './api-test-utils';
import { BookItemApi } from '@/api/book-item.api';

const apiMocks = getApiMocks();

describe('API client bản sao sách', () => {
  beforeEach(() => {
    // Arrange chung: reset mock fetch/token trước mỗi test để không rò rỉ call history.
    resetApiMocks();
  });

  // Test Case ID: TC_UT_API_BOOKCOPY_001
  it('TC_UT_API_BOOKCOPY_001 - tạo đúng query danh sách bản sao sách với bộ lọc', async () => {
    // Act: gọi getBookItems với đầy đủ filter search, bookIds, condition, status, ngày nhập và sort.
    await BookItemApi.getBookItems({
      page: 2,
      limit: 15,
      search: 'CP',
      searchByCodeOnly: true,
      authorIds: [1],
      bookIds: [10, 11],
      conditions: ['GOOD'],
      statuses: ['AVAILABLE'],
      acquisitionDateFrom: '2026-01-01',
      acquisitionDateTo: '2026-05-01',
      sortBy: 'code',
      sortOrder: 'asc',
    });

    // Assert: lấy call mới nhất để kiểm tra URL và options do API client tạo.
    const [url, options] = latestFetchCall();
    // Assert: query string phải giữ đủ các tham số mảng bằng cách lặp key nhiều lần.
    expect(url).toBe(
      '/api/book-items?page=2&limit=15&search=CP&searchByCodeOnly=true&authorIds=1&bookIds=10&bookIds=11&conditions=GOOD&statuses=AVAILABLE&acquisitionDateFrom=2026-01-01&acquisitionDateTo=2026-05-01&sortBy=code&sortOrder=asc'
    );
    // Assert: request đọc danh sách vẫn cần Authorization Bearer khi có token.
    expectBearerHeader(options);
  });

  // Test Case ID: TC_UT_API_BOOKCOPY_002
  it('TC_UT_API_BOOKCOPY_002 - gửi đúng request CRUD bản sao sách', async () => {
    // Act/Assert: getBookItemById dùng GET và header xác thực.
    await BookItemApi.getBookItemById(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items/1', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Act: tạo bản sao sách bằng JSON.
    await BookItemApi.createBookItem({ bookId: 10, code: 'CP-001', condition: 'GOOD' } as never);
    // Assert: POST phải gửi content-type JSON, Authorization và body đúng payload.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ bookId: 10, code: 'CP-001', condition: 'GOOD' }),
    });

    // Act: cập nhật trạng thái bản sao sách.
    await BookItemApi.updateBookItem(1, { status: 'MAINTENANCE' } as never);
    // Assert: PUT vào đúng id và body chỉ chứa trường update.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items/1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ status: 'MAINTENANCE' }),
    });

    // Act/Assert: delete dùng DELETE với Authorization header.
    await BookItemApi.deleteBookItem(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items/1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  // Test Case ID: TC_UT_API_BOOKCOPY_003
  it('TC_UT_API_BOOKCOPY_003 - xử lý endpoint mặc định và header xác thực rỗng', async () => {
    // Act/Assert: không truyền filter thì client vẫn gọi endpoint danh sách mặc định hiện tại.
    await BookItemApi.getBookItems();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items?', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Arrange: giả lập không có access token để kiểm tra branch bỏ Authorization.
    apiMocks.getAccessToken.mockReturnValue(null);

    // Act/Assert: GET detail khi thiếu token phải gửi headers rỗng.
    await BookItemApi.getBookItemById(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items/1', {
      method: 'GET',
      headers: {},
    });

    // Act/Assert: POST khi thiếu token vẫn có content-type JSON nhưng không có Authorization.
    await BookItemApi.createBookItem({ bookId: 1, code: 'NO-TOKEN', condition: 'GOOD' } as never);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: 1, code: 'NO-TOKEN', condition: 'GOOD' }),
    });

    // Act/Assert: PUT khi thiếu token chỉ giữ header content-type.
    await BookItemApi.updateBookItem(1, { status: 'AVAILABLE' } as never);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    });

    // Act/Assert: DELETE khi thiếu token gửi headers rỗng.
    await BookItemApi.deleteBookItem(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-items/1', {
      method: 'DELETE',
      headers: {},
    });
  });
});
