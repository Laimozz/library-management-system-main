import { beforeEach, describe, expect, it } from 'vitest';
import { getApiMocks, resetApiMocks } from './api-test-utils';
import { AuthorApi } from '@/api/author.api';
import { CategoryApi } from '@/api/category.api';

const apiMocks = getApiMocks();

describe('API client tác giả và category', () => {
  beforeEach(() => {
    // Arrange chung: reset mock fetch/token/handleJson để mỗi test case chạy độc lập.
    resetApiMocks();
  });

  // Test Case ID: TC_UT_API_AUTHOR_001
  it('TC_UT_API_AUTHOR_001 - tạo đúng query danh sách tác giả và gọi xử lý JSON', async () => {
    // Act: gọi API client với đủ tham số phân trang, tìm kiếm, sắp xếp và trạng thái xóa mềm.
    await AuthorApi.getAuthors({
      page: 2,
      limit: 5,
      search: 'Nam Cao',
      sortBy: 'fullName',
      sortOrder: 'asc',
      isDeleted: false,
    });

    // Assert: query string phải encode đúng search, sort và isDeleted trước khi gọi fetchWithAuth.
    expect(apiMocks.fetchWithAuth).toHaveBeenCalledWith(
      '/api/authors?page=2&limit=5&search=Nam+Cao&sortBy=fullName&sortOrder=asc&isDeleted=false'
    );
    // Assert: API client phải chuyển response qua handleJson đúng một lần.
    expect(apiMocks.handleJson).toHaveBeenCalledTimes(1);
  });

  // Test Case ID: TC_UT_API_AUTHOR_002
  it('TC_UT_API_AUTHOR_002 - gửi đúng request tạo, cập nhật, chi tiết và xóa tác giả', async () => {
    // Act/Assert: getAllAuthors phải gọi endpoint danh sách rút gọn cho control chọn.
    await AuthorApi.getAllAuthors();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/authors/all');

    // Act/Assert: getAuthorById phải ghép id vào URL detail.
    await AuthorApi.getAuthorById(7);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/authors/7');

    // Act: tạo tác giả bằng JSON body.
    await AuthorApi.createAuthor({ fullName: 'Nguyen Nhat Anh', biography: 'Tac gia' } as never);
    // Assert: request create dùng POST, content-type JSON và stringify đúng payload.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/authors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Nguyen Nhat Anh', biography: 'Tac gia' }),
    });

    // Act: cập nhật một phần thông tin tác giả.
    await AuthorApi.updateAuthor(7, { biography: 'Cap nhat' } as never);
    // Assert: request update dùng PUT vào đúng id và body JSON chỉ gồm field cần cập nhật.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/authors/7', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ biography: 'Cap nhat' }),
    });

    // Act/Assert: deleteAuthor resolve undefined khi response ok và gọi DELETE đúng endpoint.
    await expect(AuthorApi.deleteAuthor(7)).resolves.toBeUndefined();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/authors/7', {
      method: 'DELETE',
    });
  });

  // Test Case ID: TC_UT_API_AUTHOR_003
  it('TC_UT_API_AUTHOR_003 - báo lỗi khi xóa tác giả thất bại', async () => {
    // Arrange: giả lập server trả response không ok để nhánh throw error được chạy.
    apiMocks.fetchWithAuth.mockResolvedValueOnce({ ok: false, statusText: 'Conflict' } as Response);

    // Act/Assert: deleteAuthor phải reject với message chứa statusText từ response lỗi.
    await expect(AuthorApi.deleteAuthor(99)).rejects.toThrow(
      'Failed to delete author: Conflict'
    );
  });

  // Test Case ID: TC_UT_API_CATEGORY_001
  it('TC_UT_API_CATEGORY_001 - gửi đúng request CRUD category với endpoint và payload mong đợi', async () => {
    // Act: gọi danh sách category với đủ query filter.
    await CategoryApi.getCategories({
      page: 1,
      limit: 20,
      search: 'Khoa hoc',
      sortBy: 'name',
      sortOrder: 'desc',
      isDeleted: true,
    });
    // Assert: URL danh sách phải encode search và giữ đúng các tham số phân trang/sắp xếp.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith(
      '/api/categories?page=1&limit=20&search=Khoa+hoc&sortBy=name&sortOrder=desc&isDeleted=true'
    );

    // Act/Assert: getAllCategories dùng endpoint all cho danh sách chọn.
    await CategoryApi.getAllCategories();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/categories/all');

    // Act/Assert: getCategoryById dùng id trong path.
    await CategoryApi.getCategoryById(3);
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/categories/3');

    // Act: tạo category bằng JSON payload.
    await CategoryApi.createCategory({ name: 'Testing', description: 'Sach QA' } as never);
    // Assert: create dùng POST, content-type JSON và body stringify đúng dữ liệu.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Testing', description: 'Sach QA' }),
    });

    // Act: cập nhật category id 3.
    await CategoryApi.updateCategory(3, { description: 'Cap nhat' } as never);
    // Assert: update dùng PUT vào đúng endpoint và body chỉ chứa trường cần sửa.
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/categories/3', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Cap nhat' }),
    });
  });

  // Test Case ID: TC_UT_API_CATEGORY_002
  it('TC_UT_API_CATEGORY_002 - xử lý xóa category thành công và thất bại', async () => {
    // Act/Assert: response ok phải resolve undefined và gọi DELETE đúng endpoint.
    await expect(CategoryApi.deleteCategory(4)).resolves.toBeUndefined();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/categories/4', {
      method: 'DELETE',
    });

    // Arrange: lần gọi tiếp theo giả lập server từ chối.
    apiMocks.fetchWithAuth.mockResolvedValueOnce({ ok: false, statusText: 'Forbidden' } as Response);
    // Act/Assert: response lỗi phải reject với message chứa lý do từ server.
    await expect(CategoryApi.deleteCategory(4)).rejects.toThrow(
      'Failed to delete category: Forbidden'
    );
  });

  // Test Case ID: TC_UT_API_OPTIONAL_AUTHOR_CATEGORY_001
  it('TC_UT_API_OPTIONAL_AUTHOR_CATEGORY_001 - dùng endpoint gốc khi không có query tùy chọn', async () => {
    // Act/Assert: không truyền params thì AuthorApi không được thêm dấu ? hoặc query rỗng.
    await AuthorApi.getAuthors();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/authors');

    // Act/Assert: CategoryApi cũng dùng endpoint gốc khi không có filter.
    await CategoryApi.getCategories();
    expect(apiMocks.fetchWithAuth).toHaveBeenLastCalledWith('/api/categories');
  });
});
