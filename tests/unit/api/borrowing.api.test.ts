import { beforeEach, describe, expect, it } from 'vitest';
import { getApiMocks, latestFetchCall, resetApiMocks } from './api-test-utils';
import { BorrowRecordApi } from '@/api/borrow-record.api';
import { BorrowRequestApi } from '@/api/borrow-request.api';
import { BorrowRequestStatus } from '@/types/borrow-request';
import { BorrowStatus } from '@/types/borrow-record';

const apiMocks = getApiMocks();

describe('API client mượn trả sách', () => {
  beforeEach(() => {
    // Arrange chung: đưa fetch/token/handleJson mock về trạng thái mặc định trước mỗi test.
    resetApiMocks();
  });

  // Test Case ID: TC_UT_API_BORROW_001
  it('TC_UT_API_BORROW_001 - gửi đúng workflow API yêu cầu mượn sách', async () => {
    // Act: tạo yêu cầu mượn với một item để kiểm tra request POST.
    await BorrowRequestApi.createBorrowRequest({ items: [{ bookId: 10, quantity: 1 }] } as never);
    // Assert: create dùng JSON body, content-type và Authorization.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ items: [{ bookId: 10, quantity: 1 }] }),
    });

    // Act: gọi danh sách yêu cầu mượn có filter trạng thái.
    await BorrowRequestApi.getBorrowRequests({
      page: 1,
      limit: 5,
      status: BorrowRequestStatus.PENDING,
    });
    // Assert: query string phải gồm page, limit và status.
    expect(latestFetchCall()[0]).toBe('/api/borrow-requests?page=1&limit=5&status=PENDING');

    // Act/Assert: hủy yêu cầu là PATCH route detail với status CANCELLED.
    await BorrowRequestApi.cancelBorrowRequest(9);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-requests/9', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify({ status: BorrowRequestStatus.CANCELLED }),
    });

    // Act/Assert: danh sách toàn bộ cho thủ thư phải gọi endpoint /all và serialize userId.
    await BorrowRequestApi.getAllBorrowRequests({ page: 2, limit: 10, userId: 4 });
    expect(latestFetchCall()[0]).toBe('/api/borrow-requests/all?page=2&limit=10&userId=4');

    // Act/Assert: approve dùng route manage.
    await BorrowRequestApi.approveBorrowRequest(9);
    expect(latestFetchCall()[0]).toBe('/api/borrow-requests/9/manage');

    // Act/Assert: reject cũng dùng route manage nhưng body status là REJECTED.
    await BorrowRequestApi.rejectBorrowRequest(9);
    expect(latestFetchCall()[0]).toBe('/api/borrow-requests/9/manage');
    expect(latestFetchCall()[1]?.body).toBe(JSON.stringify({ status: BorrowRequestStatus.REJECTED }));
  });

  // Test Case ID: TC_UT_API_BORROW_002
  it('TC_UT_API_BORROW_002 - gửi đúng workflow API phiếu mượn, trả sách và gia hạn', async () => {
    // Act/Assert: tạo phiếu mượn gọi POST /api/borrow-records.
    await BorrowRecordApi.createBorrowRecord({ userId: 1, bookItemIds: [1] } as never);
    expect(latestFetchCall()[0]).toBe('/api/borrow-records');

    // Act: lấy danh sách phiếu mượn toàn bộ với nhiều filter.
    await BorrowRecordApi.getAllBorrowRecords({
      page: 1,
      limit: 5,
      status: BorrowStatus.BORROWED,
      userId: 2,
      bookId: 10,
      search: 'reader',
    });
    // Assert: query string phải giữ đủ status, userId, bookId và search.
    expect(latestFetchCall()[0]).toBe(
      '/api/borrow-records/all?page=1&limit=5&status=BORROWED&userId=2&bookId=10&search=reader'
    );

    // Act/Assert: danh sách phiếu mượn của tôi dùng endpoint gốc và status query.
    await BorrowRecordApi.getMyBorrowRecords({ page: 1, status: BorrowStatus.RETURNED });
    expect(latestFetchCall()[0]).toBe('/api/borrow-records?page=1&status=RETURNED');

    // Act/Assert: detail phiếu mượn dùng /api/borrow-records/:id.
    await BorrowRecordApi.getBorrowRecordById(3);
    expect(latestFetchCall()[0]).toBe('/api/borrow-records/3');

    // Act/Assert: gia hạn dùng POST route renew và gửi header JSON/Auth.
    await BorrowRecordApi.renewBorrowRecord(3);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records/3/renew', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
    });

    // Act: trả sách với vi phạm và cập nhật tình trạng bản sao.
    await BorrowRecordApi.returnBorrowRecord(3, {
      violations: [{ policyId: 'late', amount: 1000 } as never],
      conditionUpdates: { 1: 'WORN' },
    });
    // Assert: body trả sách phải chứa đúng violations và conditionUpdates.
    expect(latestFetchCall()[0]).toBe('/api/borrow-records/3/return');
    expect(latestFetchCall()[1]?.body).toBe(
      JSON.stringify({
        violations: [{ policyId: 'late', amount: 1000 }],
        conditionUpdates: { 1: 'WORN' },
      })
    );

    // Act/Assert: trả sách không truyền payload thì body để undefined.
    await BorrowRecordApi.returnBorrowRecord(4);
    expect(latestFetchCall()[1]?.body).toBeUndefined();
  });

  // Test Case ID: TC_UT_API_BORROW_003
  it('TC_UT_API_BORROW_003 - xử lý endpoint mặc định và header Authorization rỗng', async () => {
    // Act/Assert: các API đọc mặc định dùng GET và có Bearer token khi token tồn tại.
    await BorrowRequestApi.getBorrowRequests();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-requests', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Act/Assert: endpoint all của yêu cầu mượn.
    await BorrowRequestApi.getAllBorrowRequests();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-requests/all', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Act/Assert: endpoint all của phiếu mượn.
    await BorrowRecordApi.getAllBorrowRecords();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records/all', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Act/Assert: endpoint phiếu mượn của người dùng hiện tại.
    await BorrowRecordApi.getMyBorrowRecords();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-123' },
    });

    // Arrange: token null để kiểm tra client bỏ Authorization.
    apiMocks.getAccessToken.mockReturnValue(null);

    // Act/Assert: create yêu cầu mượn khi thiếu token chỉ còn content-type JSON.
    await BorrowRequestApi.createBorrowRequest({ items: [] } as never);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });

    // Act/Assert: approve không token vẫn gửi JSON status APPROVED.
    await BorrowRequestApi.approveBorrowRequest(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-requests/1/manage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: BorrowRequestStatus.APPROVED }),
    });

    // Act/Assert: cancel không token gửi status CANCELLED.
    await BorrowRequestApi.cancelBorrowRequest(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-requests/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: BorrowRequestStatus.CANCELLED }),
    });

    // Act/Assert: reject không token gửi status REJECTED.
    await BorrowRequestApi.rejectBorrowRequest(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-requests/1/manage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: BorrowRequestStatus.REJECTED }),
    });

    // Act/Assert: create phiếu mượn không token vẫn có content-type JSON.
    await BorrowRecordApi.createBorrowRecord({ bookItemIds: [] } as never);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookItemIds: [] }),
    });

    // Act/Assert: GET detail không token gửi headers rỗng.
    await BorrowRecordApi.getBorrowRecordById(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records/1', {
      method: 'GET',
      headers: {},
    });

    // Act/Assert: renew không token chỉ có content-type JSON.
    await BorrowRecordApi.renewBorrowRecord(1);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records/1/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Act/Assert: return không token stringify payload điều kiện trả sách.
    await BorrowRecordApi.returnBorrowRecord(1, { conditionUpdates: { 1: 'GOOD' } });
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/borrow-records/1/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditionUpdates: { 1: 'GOOD' } }),
    });
  });
});
