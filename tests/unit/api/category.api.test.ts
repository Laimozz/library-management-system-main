import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
  handleJson: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  fetchWithAuth: mocks.fetchWithAuth,
  handleJson: mocks.handleJson,
}));

import { CategoryApi } from '@/api/category.api';

describe('CategoryApi CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchWithAuth.mockResolvedValue({ ok: true, statusText: 'OK' } as unknown as Response);
    mocks.handleJson.mockResolvedValue({});
  });

  // Test Case ID: TC_UT_CATEGORY_001
  it('gets categories with pagination and filters', async () => {
    await CategoryApi.getCategories({
      page: 1,
      limit: 20,
      search: 'Tech',
      sortBy: 'name',
      sortOrder: 'desc',
      isDeleted: false,
    });

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith(
      '/api/categories?page=1&limit=20&search=Tech&sortBy=name&sortOrder=desc&isDeleted=false'
    );
  });

  // Test Case ID: TC_UT_CATEGORY_002
  it('gets a category by id', async () => {
    await CategoryApi.getCategoryById(12);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/categories/12');
    expect(mocks.handleJson).toHaveBeenCalledTimes(1);
  });

  // Test Case ID: TC_UT_CATEGORY_003
  it('creates a category with JSON payload', async () => {
    const payload = {
      name: 'Testing',
      description: 'QA books',
    };

    await CategoryApi.createCategory(payload as never);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  });

  // Test Case ID: TC_UT_CATEGORY_004
  it('updates a category with JSON payload', async () => {
    const payload = { description: 'Updated category description' };

    await CategoryApi.updateCategory(8, payload as never);

    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/categories/8', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  });

  // Test Case ID: TC_UT_CATEGORY_005
  it('deletes a category successfully when response is ok', async () => {
    await expect(CategoryApi.deleteCategory(4)).resolves.toBeUndefined();
    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/categories/4', { method: 'DELETE' });
  });

  // Test Case ID: TC_UT_CATEGORY_006
  it('throws error when delete category fails', async () => {
    mocks.fetchWithAuth.mockResolvedValue({
      ok: false,
      statusText: 'Forbidden',
    } as unknown as Response);

    await expect(CategoryApi.deleteCategory(4)).rejects.toThrow('Failed to delete category: Forbidden');
  });
});
