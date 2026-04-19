import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
  handleJson: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  fetchWithAuth: mocks.fetchWithAuth,
  handleJson: mocks.handleJson,
}));

import { AuthorApi } from '@/api/author.api';

describe('AuthorApi CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchWithAuth.mockResolvedValue({ ok: true, statusText: 'OK' } as unknown as Response);
    mocks.handleJson.mockResolvedValue({});
  });

  // Test Case ID: TC_UT_AUTHOR_001
  it('gets authors with pagination and filters', async () => {
    await AuthorApi.getAuthors({
      page: 2,
      limit: 10,
      search: 'John',
      sortBy: 'fullName',
      sortOrder: 'asc',
      isDeleted: false,
    });

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith(
      '/api/authors?page=2&limit=10&search=John&sortBy=fullName&sortOrder=asc&isDeleted=false'
    );
    expect(mocks.handleJson).toHaveBeenCalledTimes(1);
  });

  // Test Case ID: TC_UT_AUTHOR_002
  it('gets a single author by id', async () => {
    await AuthorApi.getAuthorById(7);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/authors/7');
    expect(mocks.handleJson).toHaveBeenCalledTimes(1);
  });

  // Test Case ID: TC_UT_AUTHOR_003
  it('creates an author with JSON payload', async () => {
    const payload = {
      fullName: 'Kent Beck',
      bio: 'Software engineering author',
    };

    await AuthorApi.createAuthor(payload as never);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/authors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  });

  // Test Case ID: TC_UT_AUTHOR_004
  it('updates an author with JSON payload', async () => {
    const payload = { bio: 'Updated bio' };

    await AuthorApi.updateAuthor(9, payload as never);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/authors/9', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  });

  // Test Case ID: TC_UT_AUTHOR_005
  it('deletes an author successfully when response is ok', async () => {
    mocks.fetchWithAuth.mockResolvedValue({ ok: true, statusText: 'OK' } as unknown as Response);

    await expect(AuthorApi.deleteAuthor(3)).resolves.toBeUndefined();
    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/authors/3', { method: 'DELETE' });
  });

  // Test Case ID: TC_UT_AUTHOR_006
  it('throws error when delete author fails', async () => {
    mocks.fetchWithAuth.mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    } as unknown as Response);

    await expect(AuthorApi.deleteAuthor(3)).rejects.toThrow(
      'Failed to delete author: Internal Server Error'
    );
  });
});
