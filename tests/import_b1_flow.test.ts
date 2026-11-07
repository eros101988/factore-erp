import { describe, it, expect } from 'vitest';
import { validateImportData } from '../src/lib/import/validator';

describe('B1 Data Intake Feature Suite', () => {
  describe('Parsing and Validation', () => {
    it('should invalidate missing required fields for sales', () => {
      const data = [{ sale_date: '2026-01-01', sale_number: 'S001', quantity: '10' }]; // missing customer_code, product_code, unit_price
      const result = validateImportData('sales', data);
      expect(result.errorCount).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('customer_code'))).toBe(true);
    });

    it('should validate dates correctly for purchases', () => {
      const data = [{ 
        purchase_date: 'invalid-date', 
        purchase_number: 'P001', 
        supplier_code: 'SUP1', 
        product_code: 'PROD1', 
        quantity: '10', 
        unit_cost: '100' 
      }];
      const result = validateImportData('purchases', data);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0].message).toContain('日期格式無效');
    });

    it('should detect duplicate sales rows in the same batch', () => {
      const data = [
        { sale_date: '2026-01-01', sale_number: 'S001', customer_code: 'C1', product_code: 'P1', quantity: '1', unit_price: '1' },
        { sale_date: '2026-01-01', sale_number: 'S001', customer_code: 'C1', product_code: 'P1', quantity: '2', unit_price: '1' }
      ];
      const result = validateImportData('sales', data);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0].message).toContain('重複資料鍵值: S001_P1');
    });
    
    it('should detect duplicate purchase rows in the same batch', () => {
      const data = [
        { purchase_date: '2026-01-01', purchase_number: 'P001', supplier_code: 'S1', product_code: 'P1', quantity: '1', unit_cost: '1' },
        { purchase_date: '2026-01-01', purchase_number: 'P001', supplier_code: 'S1', product_code: 'P1', quantity: '2', unit_cost: '1' }
      ];
      const result = validateImportData('purchases', data);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0].message).toContain('重複資料鍵值: P001_P1');
    });
  });
});