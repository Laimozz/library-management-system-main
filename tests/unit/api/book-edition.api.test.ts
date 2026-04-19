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

import { BookEditionApi } from '@/api/book-edition.api';

describe('BookEditionApi CRUD (Ebook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockReturnValue('token-ebook');
    mocks.fetchWithAuth.mockResolvedValue({ ok: true, statusText: 'OK' } as unknown as Response);
    mocks.handleJson.mockResolvedValue({});
  });

  // Test Case ID: TC_UT_EBOOK_001
  it('gets ebook editions with filter query', async () => {
    await BookEditionApi.getBookEditions({
      bookIds: [4, 6],
      page: 1,
      limit: 10,
      search: 'pdf',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      format: 'EBOOK',
      status: 'ACTIVE',
    });

    const [url, options] = mocks.fetchWithAuth.mock.calls[0];
    expect(url).toContain('/api/book-editions?');
    expect(url).toContain('bookIds=4');
    expect(url).toContain('bookIds=6');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=10');
    expect(url).toContain('search=pdf');
    expect(url).toContain('sortBy=createdAt');
    expect(url).toContain('sortOrder=desc');
    expect(url).toContain('format=EBOOK');
    expect(url).toContain('status=ACTIVE');

    expect(options).toEqual({
      method: 'GET',
      headers: {
        Authorization: 'Bearer token-ebook',
      },
    });
  });

  // Test Case ID: TC_UT_EBOOK_002
  it('gets ebook edition by id', async () => {
    await BookEditionApi.getBookEditionById(14);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/book-editions/14', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer token-ebook',
      },
    });
  });

  // Test Case ID: TC_UT_EBOOK_003
  it('creates ebook edition and appends bookId into formData', async () => {
    const formData = new FormData();
    formData.append('format', 'EBOOK');
    formData.append('fileFormat', 'PDF');

    await BookEditionApi.createBookEdition(9, formData);

    const [, options] = mocks.fetchWithAuth.mock.calls[0];
    const body = options.body as FormData;

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/book-editions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-ebook',
      },
      body,
    });
    expect(body.get('bookId')).toBe('9');
    expect(body.get('format')).toBe('EBOOK');
  });

  // Test Case ID: TC_UT_EBOOK_004
  it('updates ebook edition with PATCH formData request', async () => {
    const formData = new FormData();
    formData.append('status', 'INACTIVE');

    await BookEditionApi.updateBookEdition(14, formData);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/book-editions/14', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token-ebook',
      },
      body: formData,
    });
  });

  // Test Case ID: TC_UT_EBOOK_005
  it('bulk deletes ebook editions with JSON ids payload', async () => {
    await BookEditionApi.bulkDeleteBookEditions([5, 6, 7]);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/book-editions/bulk-delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-ebook',
      },
      body: JSON.stringify({ ids: [5, 6, 7] }),
    });
  });
});
