import { expect, vi } from 'vitest';

// Shared mock for client API adapter tests. These tests verify request shape only;
// no real HTTP request is sent and no real database is touched.
const apiMocks = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
  getAccessToken: vi.fn(),
  handleJson: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  fetchWithAuth: apiMocks.fetchWithAuth,
  getAccessToken: apiMocks.getAccessToken,
  handleJson: apiMocks.handleJson,
}));

export function resetApiMocks() {
  // Reset call history để test sau không bị ảnh hưởng bởi test trước.
  vi.clearAllMocks();
  // Mặc định giả lập user đã đăng nhập với token ổn định để assert header Authorization.
  apiMocks.getAccessToken.mockReturnValue('token-123');
  // Mặc định fetch trả ok để các API client không đi vào nhánh lỗi.
  apiMocks.fetchWithAuth.mockResolvedValue({ ok: true, statusText: 'OK' } as Response);
  // Mặc định handleJson trả shape phân trang phổ biến dùng bởi các API list/search.
  apiMocks.handleJson.mockResolvedValue({
    books: [],
    pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
  });
}

export function getApiMocks() {
  // Trả về cùng một bộ mock hoisted để các file test có thể setup và assert calls.
  return apiMocks;
}

export function latestFetchCall() {
  // Lấy lần gọi fetchWithAuth mới nhất để test kiểm tra URL/options vừa được API client tạo.
  return apiMocks.fetchWithAuth.mock.calls.at(-1) as [string, RequestInit | undefined];
}

export function expectBearerHeader(options: RequestInit | undefined) {
  // Assertion dùng chung cho các API cần header Authorization dạng Bearer token.
  expect(options?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer token-123' }));
}
