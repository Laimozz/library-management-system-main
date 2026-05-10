import { describe, expect, it } from 'vitest';
import { validateCreateAuthor } from '@/lib/validators/author';
import { validateCreateCategory } from '@/lib/validators/category';

describe('Validator form tác giả và category', () => {
  // Test Case ID: TC_UT_TACGIACATE_001
  it('TC_UT_TACGIACATE_001 - kiểm tra form tác giả hợp lệ', () => {
    // Act: truyền đầy đủ dữ liệu hợp lệ vào validateCreateAuthor.
    const result = validateCreateAuthor({
      fullName: 'Nguyen Nhat Anh',
      bio: 'Tac gia truyen thieu nhi',
      birthDate: '1955-05-07',
      nationality: 'Viet Nam',
      isDeleted: false,
    });

    // Assert: validator không trả errors và firstError null khi form hợp lệ.
    expect(result.errors).toEqual({});
    expect(result.firstError).toBeNull();
  });

  // Test Case ID: TC_UT_TACGIACATE_002
  it('TC_UT_TACGIACATE_002 - từ chối fullName tác giả theo quy tắc độ dài', () => {
    // Act/Assert: fullName rỗng phải báo lỗi bắt buộc nhập.
    expect(
      validateCreateAuthor({
        fullName: '',
        bio: '',
        birthDate: '',
        nationality: '',
        isDeleted: false,
      }).errors.fullName
    ).toBe('Full name is required');
    // Act/Assert: fullName dưới 2 ký tự phải báo lỗi min length.
    expect(
      validateCreateAuthor({
        fullName: 'A',
        bio: '',
        birthDate: '',
        nationality: '',
        isDeleted: false,
      }).errors.fullName
    ).toBe('Full name must be at least 2 characters');
    // Act/Assert: fullName trên 100 ký tự phải báo lỗi max length.
    expect(
      validateCreateAuthor({
        fullName: 'A'.repeat(101),
        bio: '',
        birthDate: '',
        nationality: '',
        isDeleted: false,
      }).errors.fullName
    ).toBe('Full name must be less than 100 characters');
  });

  // Test Case ID: TC_UT_TACGIACATE_003
  it('TC_UT_TACGIACATE_003 - từ chối bio tác giả dài hơn 200 ký tự', () => {
    // Act: bio 201 ký tự vượt giới hạn 200 ký tự.
    const result = validateCreateAuthor({
      fullName: 'Valid Author',
      bio: 'B'.repeat(201),
      birthDate: '',
      nationality: '',
      isDeleted: false,
    });

    // Assert: lỗi bio trả đúng message giới hạn độ dài.
    expect(result.errors.bio).toBe('Bio must be less than 200 characters');
  });

  // Test Case ID: TC_UT_TACGIACATE_004
  it('TC_UT_TACGIACATE_004 - từ chối birthDate tác giả sai định dạng hoặc ở tương lai', () => {
    // Act: ngày không parse được phải đi vào nhánh invalid format.
    const invalidDate = validateCreateAuthor({
      fullName: 'Valid Author',
      bio: '',
      birthDate: 'not-a-date',
      nationality: '',
      isDeleted: false,
    });
    // Act: ngày hợp lệ về format nhưng nằm trong tương lai phải đi vào nhánh future date.
    const futureDate = validateCreateAuthor({
      fullName: 'Valid Author',
      bio: '',
      birthDate: '2999-01-01',
      nationality: '',
      isDeleted: false,
    });

    // Assert: mỗi nhánh ngày tháng trả đúng lỗi riêng.
    expect(invalidDate.errors.birthDate).toBe('Invalid birth date format');
    expect(futureDate.errors.birthDate).toBe('Birth date cannot be in the future');
  });

  // Test Case ID: TC_UT_TACGIACATE_005
  it('TC_UT_TACGIACATE_005 - từ chối nationality dài hơn 50 ký tự', () => {
    // Act: nationality 51 ký tự vượt giới hạn 50 ký tự.
    const result = validateCreateAuthor({
      fullName: 'Valid Author',
      bio: '',
      birthDate: '',
      nationality: 'N'.repeat(51),
      isDeleted: false,
    });

    // Assert: validator báo lỗi đúng ở field nationality.
    expect(result.errors.nationality).toBe('Nationality must be less than 50 characters');
  });

  // Test Case ID: TC_UT_TACGIACATE_013
  it('TC_UT_TACGIACATE_013 - kiểm tra form category hợp lệ', () => {
    // Act: truyền name và description hợp lệ vào validateCreateCategory.
    const result = validateCreateCategory({
      name: 'Cong nghe',
      description: 'Sach cong nghe',
      isDeleted: false,
    });

    // Assert: category hợp lệ không có lỗi field và không có firstError.
    expect(result.errors).toEqual({});
    expect(result.firstError).toBeNull();
  });

  // Test Case ID: TC_UT_TACGIACATE_014
  it('TC_UT_TACGIACATE_014 - từ chối tên category theo quy tắc độ dài', () => {
    // Act/Assert: name rỗng phải báo lỗi bắt buộc nhập.
    expect(validateCreateCategory({ name: '', description: '', isDeleted: false }).errors.name).toBe(
      'Category name is required'
    );
    // Act/Assert: name dưới 2 ký tự phải báo lỗi min length.
    expect(validateCreateCategory({ name: 'A', description: '', isDeleted: false }).errors.name).toBe(
      'Category name must be at least 2 characters'
    );
    // Act/Assert: name trên 100 ký tự phải báo lỗi max length.
    expect(
      validateCreateCategory({ name: 'A'.repeat(101), description: '', isDeleted: false }).errors
        .name
    ).toBe('Category name must be less than 100 characters');
  });

  // Test Case ID: TC_UT_TACGIACATE_015
  it('TC_UT_TACGIACATE_015 - từ chối mô tả category dài hơn 200 ký tự', () => {
    // Act: description 201 ký tự vượt giới hạn 200 ký tự.
    const result = validateCreateCategory({
      name: 'Valid Category',
      description: 'D'.repeat(201),
      isDeleted: false,
    });

    // Assert: validator báo lỗi đúng ở field description.
    expect(result.errors.description).toBe('Description must be less than 200 characters');
  });
});
