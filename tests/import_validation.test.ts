import { describe, it, expect } from 'vitest';
import { validateImportData, ImportType } from '../src/lib/import/validator';

describe('Import Validation Logic', () => {
  it('should invalidate missing required fields', () => {
    const data = [
      { product_name: 'Test Product' } // missing external_product_code
    ];
    const result = validateImportData('products', data);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].message).toContain('缺少必填欄位: external_product_code');
  });

  it('should validate numeric fields', () => {
    const data = [
      { 
        external_product_code: 'P001', 
        product_name: 'Test', 
        current_purchase_price: '-10' // Invalid negative
      } 
    ];
    const result = validateImportData('products', data);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].message).toContain('必須為有效的非負數值');
  });

  it('should validate dates', () => {
    const data = [
      { 
        sale_number: 'S001', 
        customer_code: 'C001',
        product_code: 'P001',
        quantity: '1',
        unit_price: '100',
        sale_date: 'invalid-date' 
      } 
    ];
    const result = validateImportData('sales', data);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].message).toContain('日期格式無效');
  });

  it('should detect duplicates in the same batch', () => {
    const data = [
      { external_product_code: 'P001', product_name: 'Test 1' },
      { external_product_code: 'P001', product_name: 'Test 2' } // Duplicate code
    ];
    const result = validateImportData('products', data);
    expect(result.errorCount).toBe(1);
    expect(result.errors[0].message).toContain('重複資料鍵值: P001');
  });

  it('should pass valid data', () => {
    const data = [
      { external_product_code: 'P001', product_name: 'Test 1', current_purchase_price: '100' },
    ];
    const result = validateImportData('products', data);
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(1);
  });
});