import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
  handleJson: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  fetchWithAuth: mocks.fetchWithAuth,
  handleJson: mocks.handleJson,
  getAccessToken: mocks.getAccessToken,
}));

import { BookItemApi } from '@/api/book-item.api';

describe('BookItemApi CRUD (Book Copy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockReturnValue('token-copy');
    mocks.fetchWithAuth.mockResolvedValue({ ok: true, statusText: 'OK' } as unknown as Response);
    mocks.handleJson.mockResolvedValue({});
  });

  // Test Case ID: TC_UT_BOOKCOPY_001
  it('gets book copies with filters and auth header', async () => {
    await BookItemApi.getBookItems({
      page: 1,
      limit: 5,
      search: 'CP',
      authorIds: [1],
      bookIds: [10, 11],
      statuses: ['AVAILABLE'],
      sortBy: 'code',
      sortOrder: 'asc',
    });

    const [url, options] = mocks.fetchWithAuth.mock.calls[0];
    expect(url).toContain('/api/book-items?');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=5');
    expect(url).toContain('search=CP');
    expect(url).toContain('authorIds=1');
    expect(url).toContain('bookIds=10');
    expect(url).toContain('bookIds=11');
    expect(url).toContain('statuses=AVAILABLE');
    expect(url).toContain('sortBy=code');
    expect(url).toContain('sortOrder=asc');

    expect(options).toEqual({
      method: 'GET',
      headers: {
        Authorization: 'Bearer token-copy',
      },
    });
  });

  // Test Case ID: TC_UT_BOOKCOPY_002
  it('gets book copy by id', async () => {
    await BookItemApi.getBookItemById(33);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/book-items/33', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer token-copy',
      },
    });
  });

  // Test Case ID: TC_UT_BOOKCOPY_003
  it('creates a book copy with JSON body', async () => {
    const payload = {
      bookId: 7,
      code: 'CP-0001',
      condition: 'GOOD',
      status: 'AVAILABLE',
    };

    await BookItemApi.createBookItem(payload as never);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/book-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-copy',
      },
      body: JSON.stringify(payload),
    });
  });

  // Test Case ID: TC_UT_BOOKCOPY_004
  it('updates a book copy with JSON body', async () => {
    const payload = {
      status: 'MAINTENANCE',
    };

    await BookItemApi.updateBookItem(33, payload as never);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/book-items/33', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-copy',
      },
      body: JSON.stringify(payload),
    });
  });

  // Test Case ID: TC_UT_BOOKCOPY_005
  it('deletes a book copy and parses response via handleJson', async () => {
    const response = { ok: true, statusText: 'OK' } as unknown as Response;
    mocks.fetchWithAuth.mockResolvedValue(response);

    await expect(BookItemApi.deleteBookItem(33)).resolves.toBeUndefined();

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/book-items/33', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer token-copy',
      },
    });
    expect(mocks.handleJson).toHaveBeenCalledWith(response);
  });
});
