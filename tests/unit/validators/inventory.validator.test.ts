import { describe, expect, it, vi } from 'vitest';
import { validateCreateBook } from '@/lib/validators/book';
import { validateCreateBookItem } from '@/lib/validators/book-item';

vi.mock('@/components', () => ({
  // Mock toaster để validator có thể import component UI mà không tạo side effect trong unit test.
  toaster: { create: vi.fn() },
}));

describe('Validator form quản lý kho sách', () => {
  // Test Case ID: TC_UT_KHOSACH_024
  it('TC_UT_KHOSACH_024 - kiểm tra validate form sách với trường bắt buộc và số', () => {
    // Act: truyền form sách thiếu author/title và nhập chuỗi không phải số cho các field số.
    const result = validateCreateBook({
      authorId: '',
      title: '',
      isbn: '',
      publishYear: 'abc',
      publisher: '',
      pageCount: 'ten',
      price: '100.5',
      edition: '',
      description: '',
      coverImageUrl: '',
      categories: [],
      isDeleted: false,
    });

    // Assert: validator trả lỗi bắt buộc cho author/title và lỗi number cho năm/số trang/giá.
    expect(result.errors.authorId).toBe('Please select Author');
    expect(result.errors.title).toBe('Please enter Book Title');
    expect(result.errors.publishYear).toBe('Publish Year must be a number');
    expect(result.errors.pageCount).toBe('Page Count must be a number');
    expect(result.errors.price).toBe('Price must be a number');
    // Assert: firstError phải là lỗi đầu tiên theo thứ tự validate để UI hiển thị nhanh.
    expect(result.firstError).toBe('Please select Author');
  });

  // Test Case ID: TC_UT_KHOSACH_025
  it('TC_UT_KHOSACH_025 - kiểm tra validate form bản sao sách với trường bắt buộc', () => {
    // Act: truyền form bản sao sách thiếu bookId, code và condition.
    const result = validateCreateBookItem({
      bookId: '',
      code: '',
      condition: '' as 'GOOD',
      status: 'AVAILABLE',
      acquisitionDate: '',
      isDeleted: false,
    });

    // Assert: validator trả lỗi từng field bắt buộc.
    expect(result.errors.bookId).toBe('Please select Book');
    expect(result.errors.code).toBe('Please enter Book Copy Code');
    expect(result.errors.condition).toBe('Please select Condition');
    // Assert: firstError là lỗi bookId vì đây là field bắt buộc đầu tiên.
    expect(result.firstError).toBe('Please select Book');
  });

  // Test Case ID: TC_UT_KHOSACH_026
  it('TC_UT_KHOSACH_026 - chấp nhận form sách hợp lệ không có lỗi', () => {
    // Act: truyền đầy đủ form sách hợp lệ, bao gồm số dạng string và category đã chọn.
    const result = validateCreateBook({
      authorId: '1',
      title: 'Clean Architecture',
      isbn: '9780134494166',
      publishYear: '2017',
      publisher: 'Prentice Hall',
      pageCount: '432',
      price: '39',
      edition: '1',
      description: 'Sach kien truc phan mem',
      coverImageUrl: '',
      categories: [{ value: '1', label: 'Software' }],
      isDeleted: false,
    });

    // Assert: dữ liệu hợp lệ không sinh errors và firstError null.
    expect(result.errors).toEqual({});
    expect(result.firstError).toBeNull();
  });

  // Test Case ID: TC_UT_KHOSACH_027
  it('TC_UT_KHOSACH_027 - chấp nhận form bản sao sách hợp lệ không có lỗi', () => {
    // Act: truyền đầy đủ bookId, code, condition, status và acquisitionDate hợp lệ.
    const result = validateCreateBookItem({
      bookId: '10',
      code: 'CP-010',
      condition: 'GOOD',
      status: 'AVAILABLE',
      acquisitionDate: '2026-05-10',
      isDeleted: false,
    });

    // Assert: form bản sao hợp lệ không có lỗi field và không có firstError.
    expect(result.errors).toEqual({});
    expect(result.firstError).toBeNull();
  });
});
