import { CreateFavoriteBookData, FavoriteBookResponse, FavoriteBooksListPayload } from '@/types/favorite-book';
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

import { FavoriteBookApi } from '@/api/favorite-book.api';

describe('FavoriteBookApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockReturnValue('mock-token');
    mocks.fetchWithAuth.mockResolvedValue({ ok: true, statusText: 'OK' } as unknown as Response);
  });

  // Test Case ID: TC_UT_FE_API_FAVORITE_001
  it('should get favorite books', async () => {
    const mockPayload: FavoriteBooksListPayload = {
      favoriteBooks: [],
      pagination: { page: 1, limit: 10, total: 0 },
    };
    mocks.handleJson.mockResolvedValueOnce(mockPayload);

    const result = await FavoriteBookApi.getFavoriteBooks({ page: 1, limit: 10 });

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/favorite-books?page=1&limit=10', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer mock-token',
      },
    });
    expect(mocks.handleJson).toHaveBeenCalled();
    expect(result).toEqual(mockPayload);
  });

  // Test Case ID: TC_UT_FE_API_FAVORITE_002
  it('should create favorite book', async () => {
    const mockData: CreateFavoriteBookData = { bookId: 1 };
    const mockResponse: FavoriteBookResponse = {
      userId: 1,
      bookId: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    mocks.handleJson.mockResolvedValueOnce(mockResponse);

    const result = await FavoriteBookApi.createFavoriteBook(mockData);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/favorite-books', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-token',
      },
      body: JSON.stringify(mockData),
    });
    expect(mocks.handleJson).toHaveBeenCalled();
    expect(result).toEqual(mockResponse);
  });

  // Test Case ID: TC_UT_FE_API_FAVORITE_003
  it('should delete favorite book', async () => {
    mocks.handleJson.mockResolvedValueOnce(undefined);

    await FavoriteBookApi.deleteFavoriteBook({ bookId: 1 });

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/favorite-books', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-token',
      },
      body: JSON.stringify({ bookId: 1 }),
    });
    expect(mocks.handleJson).toHaveBeenCalled();
  });

  // Test Case ID: TC_UT_FE_API_FAVORITE_004
  it('should check if a book is favorite', async () => {
    mocks.handleJson.mockResolvedValueOnce({ isFavorite: true });

    const result = await FavoriteBookApi.checkFavoriteBook(1);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/favorite-books?bookId=1', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer mock-token',
      },
    });
    expect(mocks.handleJson).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
