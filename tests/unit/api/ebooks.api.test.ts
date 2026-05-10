import { beforeEach, describe, expect, it } from 'vitest';
import { getApiMocks, latestFetchCall, resetApiMocks } from './api-test-utils';
import { BookEditionApi } from '@/api/book-edition.api';
import { EbookBorrowRequestApi } from '@/api/ebook-borrow-request.api';
import { BorrowRequestStatus } from '@/types/borrow-request';

const apiMocks = getApiMocks();

describe('API client ebook', () => {
  beforeEach(() => {
    // Arrange chung: reset mock API adapter để mỗi test kiểm tra đúng call của chính nó.
    resetApiMocks();
  });

  // Test Case ID: TC_UT_API_EBOOK_001
  it('TC_UT_API_EBOOK_001 - gửi request danh sách, chi tiết, tạo và cập nhật phiên bản ebook', async () => {
    // Arrange: FormData trống để kiểm tra createBookEdition tự append bookId.
    const formData = new FormData();
    // Act: tạo edition cho book id 10.
    await BookEditionApi.createBookEdition(10, formData);
    // Assert: bookId được append vào form và request gửi body FormData kèm Authorization.
    expect(formData.get('bookId')).toBe('10');
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-123' },
      body: formData,
    });

    // Arrange/Act: FormData cập nhật không cần tự append bookId.
    const updateForm = new FormData();
    await BookEditionApi.updateBookEdition(3, updateForm);
    // Assert: update dùng PATCH vào đúng edition id.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions/3', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer token-123' },
      body: updateForm,
    });

    // Act/Assert: detail edition dùng GET /api/book-editions/:id.
    await BookEditionApi.getBookEditionById(3);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions/3', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Act: danh sách edition với đầy đủ filter.
    await BookEditionApi.getBookEditions({
      bookIds: [10, 11],
      page: 1,
      limit: 10,
      search: 'pdf',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      format: 'EBOOK',
      fileFormat: 'PDF',
      drmType: 'NONE',
      status: 'ACTIVE',
    });
    // Assert: query string phải serialize bookIds dạng lặp key và giữ đủ filter file/DRM/status.
    expect(latestFetchCall()[0]).toBe(
      '/api/book-editions?bookIds=10&bookIds=11&page=1&limit=10&search=pdf&sortBy=createdAt&sortOrder=desc&format=EBOOK&fileFormat=PDF&drmType=NONE&status=ACTIVE'
    );
  });

  // Test Case ID: TC_UT_API_EBOOK_002
  it('TC_UT_API_EBOOK_002 - gửi request xóa hàng loạt, shortcut theo sách và AI summarize', async () => {
    // Act/Assert: shortcut getBookEditionsByBookId phải map sang query bookIds.
    await BookEditionApi.getBookEditionsByBookId(8, { format: 'AUDIO' });
    expect(latestFetchCall()[0]).toBe('/api/book-editions?bookIds=8&format=AUDIO');

    // Act: xóa hàng loạt edition.
    await BookEditionApi.bulkDeleteBookEditions([1, 2]);
    // Assert: bulk delete dùng DELETE, JSON body ids và Authorization.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions/bulk-delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ ids: [1, 2] }),
    });

    // Act: gọi AI summarize với file và các field tùy chọn.
    await BookEditionApi.aiSummarize({
      file: new Blob(['pdf']) as File,
      language: 'vi',
      maxLength: 500,
    });
    // Assert: endpoint AI nhận POST FormData để upload file.
    const [, options] = latestFetchCall();
    expect(latestFetchCall()[0]).toBe('/api/ai-summarize');
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(FormData);
  });

  // Test Case ID: TC_UT_API_EBOOK_003
  it('TC_UT_API_EBOOK_003 - xử lý không có query, thiếu token và trường summarize tùy chọn', async () => {
    // Act/Assert: không truyền filter thì getBookEditions gọi endpoint gốc.
    await BookEditionApi.getBookEditions();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Arrange: token null để kiểm tra nhánh bỏ Authorization.
    apiMocks.getAccessToken.mockReturnValue(null);

    // Act/Assert: create edition không token gửi headers rỗng vì FormData tự set content-type.
    const formData = new FormData();
    await BookEditionApi.createBookEdition(1, formData);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions', {
      method: 'POST',
      headers: {},
      body: formData,
    });

    // Act/Assert: update edition không token cũng gửi headers rỗng.
    const updateForm = new FormData();
    await BookEditionApi.updateBookEdition(1, updateForm);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions/1', {
      method: 'PATCH',
      headers: {},
      body: updateForm,
    });

    // Act/Assert: get detail không token gửi GET headers rỗng.
    await BookEditionApi.getBookEditionById(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions/1', {
      method: 'GET',
      headers: {},
    });

    // Act/Assert: bulk delete không token vẫn có content-type JSON.
    await BookEditionApi.bulkDeleteBookEditions([1]);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/book-editions/bulk-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [1] }),
    });

    // Act: summarize chỉ có file, không có language/maxLength.
    await BookEditionApi.aiSummarize({ file: new Blob(['pdf']) as File });
    const [, options] = latestFetchCall();
    const summaryBody = options?.body as FormData;
    // Assert: request gửi FormData và không append các field tùy chọn khi không truyền.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/ai-summarize', {
      method: 'POST',
      headers: {},
      body: expect.any(FormData),
    });
    expect(summaryBody.get('language')).toBeNull();
    expect(summaryBody.get('maxLength')).toBeNull();
  });

  // Test Case ID: TC_UT_API_EBORROW_001
  it('TC_UT_API_EBORROW_001 - gửi request mượn ebook, xem ebook và trả ebook', async () => {
    // Act/Assert: tạo yêu cầu mượn ebook gọi endpoint ebook-borrow-requests.
    await EbookBorrowRequestApi.createEbookBorrowRequest({ bookId: 10 } as never);
    expect(latestFetchCall()[0]).toBe('/api/ebook-borrow-requests');

    // Act/Assert: danh sách yêu cầu mượn ebook serialize page/limit/status.
    await EbookBorrowRequestApi.getEbookBorrowRequests({
      page: 1,
      limit: 8,
      status: BorrowRequestStatus.APPROVED,
    });
    expect(latestFetchCall()[0]).toBe(
      '/api/ebook-borrow-requests?page=1&limit=8&status=APPROVED'
    );

    // Act/Assert: getMyEbooks gọi endpoint riêng của độc giả.
    await EbookBorrowRequestApi.getMyEbooks({ page: 2, limit: 4 });
    expect(latestFetchCall()[0]).toBe('/api/my-ebooks?page=2&limit=4');

    // Act/Assert: xem ebook gọi route sinh URL đã ký theo book id.
    await EbookBorrowRequestApi.getEbookViewUrl(10);
    expect(latestFetchCall()[0]).toBe('/api/ebooks/10/view');

    // Act/Assert: trả ebook dùng route return-ebook với POST JSON header và Authorization.
    await EbookBorrowRequestApi.returnEbook(12);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records/12/return-ebook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
    });
  });

  // Test Case ID: TC_UT_API_EBORROW_002
  it('TC_UT_API_EBORROW_002 - xử lý endpoint ebook mặc định và thiếu token', async () => {
    // Act/Assert: danh sách ebook borrow mặc định có Bearer token.
    await EbookBorrowRequestApi.getEbookBorrowRequests();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/ebook-borrow-requests', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Act/Assert: my ebooks mặc định có Bearer token.
    await EbookBorrowRequestApi.getMyEbooks();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/my-ebooks', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Arrange: bỏ token để kiểm tra headers trong các lệnh ghi/đọc còn lại.
    apiMocks.getAccessToken.mockReturnValue(null);

    // Act/Assert: create ebook borrow không token chỉ có content-type JSON.
    await EbookBorrowRequestApi.createEbookBorrowRequest({ bookId: 1 } as never);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/ebook-borrow-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: 1 }),
    });

    // Act/Assert: view url không token gửi headers rỗng.
    await EbookBorrowRequestApi.getEbookViewUrl(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/ebooks/1/view', {
      method: 'GET',
      headers: {},
    });

    // Act/Assert: return ebook không token giữ content-type JSON nhưng không có Authorization.
    await EbookBorrowRequestApi.returnEbook(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records/1/return-ebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
