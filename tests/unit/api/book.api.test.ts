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

import { BookApi } from '@/api/book.api';

describe('BookApi CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockReturnValue('token-123');
    mocks.fetchWithAuth.mockResolvedValue({ ok: true, statusText: 'OK' } as unknown as Response);
    mocks.handleJson.mockResolvedValue({});
  });

  // Test Case ID: TC_UT_BOOK_001
  it('gets books and builds query string with filters', async () => {
    await BookApi.getBooks({
      page: 1,
      limit: 10,
      search: 'Refactoring',
      authorIds: [1, 2],
      categoryIds: [3],
      languageCodes: ['en'],
      sortBy: 'title',
      sortOrder: 'asc',
      isDeleted: false,
    });

    const [url, options] = mocks.fetchWithAuth.mock.calls[0];
    expect(url).toContain('/api/books?');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=10');
    expect(url).toContain('search=Refactoring');
    expect(url).toContain('authorIds=1');
    expect(url).toContain('authorIds=2');
    expect(url).toContain('categoryIds=3');
    expect(url).toContain('languageCodes=en');
    expect(url).toContain('sortBy=title');
    expect(url).toContain('sortOrder=asc');
    expect(url).toContain('isDeleted=false');

    expect(options).toEqual({
      method: 'GET',
      headers: {
        Authorization: 'Bearer token-123',
      },
    });
  });

  // Test Case ID: TC_UT_BOOK_002
  it('gets book detail by id with bearer token', async () => {
    await BookApi.getBookById(15);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/books/15', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer token-123',
      },
    });
  });

  // Test Case ID: TC_UT_BOOK_003
  it('creates a book with JSON payload and auth header', async () => {
    const payload = {
      authorId: 2,
      title: 'Clean Code',
      isbn: '9780132350884',
    };

    await BookApi.createBook(payload as never);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/books', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify(payload),
    });
  });

  // Test Case ID: TC_UT_BOOK_004
  it('updates a book with JSON payload and auth header', async () => {
    const payload = {
      title: 'Clean Code 2nd Edition',
    };

    await BookApi.updateBook(21, payload as never);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/books/21', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
      body: JSON.stringify(payload),
    });
  });

  // Test Case ID: TC_UT_BOOK_005
  it('deletes a book and delegates response parsing to handleJson', async () => {
    const response = { ok: true, statusText: 'OK' } as unknown as Response;
    mocks.fetchWithAuth.mockResolvedValue(response);

    await expect(BookApi.deleteBook(5)).resolves.toBeUndefined();

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/books/5', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer token-123',
      },
    });
    expect(mocks.handleJson).toHaveBeenCalledWith(response);
  });
});
