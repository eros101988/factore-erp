export type ImportType = 'products' | 'customers' | 'suppliers' | 'sales' | 'purchases';

export const TYPE_TARGET_COLUMNS: Record<ImportType, { key: string, label: string, required: boolean }[]> = {
  products: [
    { key: 'external_product_code', label: '商品編號 (external_product_code)', required: true },
    { key: 'product_name', label: '商品名稱 (product_name)', required: true },
    { key: 'specification', label: '規格 (specification)', required: false },
    { key: 'unit', label: '單位 (unit)', required: false },
    { key: 'pack_qty', label: '箱入數 (pack_qty)', required: false },
    { key: 'category', label: '分類 (category)', required: false },
    { key: 'barcode', label: '條碼 (barcode)', required: false },
    { key: 'current_purchase_price', label: '當前進價 (current_purchase_price)', required: false },
  ],
  customers: [
    { key: 'external_customer_code', label: '客戶編號 (external_customer_code)', required: true },
    { key: 'customer_name', label: '客戶名稱 (customer_name)', required: true },
    { key: 'tax_id', label: '統編 (tax_id)', required: false },
    { key: 'phone', label: '電話 (phone)', required: false },
    { key: 'address', label: '地址 (address)', required: false },
    { key: 'salesperson', label: '業務員 (salesperson)', required: false },
    { key: 'payment_terms', label: '結帳條件 (payment_terms)', required: false },
  ],
  suppliers: [
    { key: 'external_supplier_code', label: '廠商編號 (external_supplier_code)', required: true },
    { key: 'supplier_name', label: '廠商名稱 (supplier_name)', required: true },
    { key: 'tax_id', label: '統編 (tax_id)', required: false },
    { key: 'phone', label: '電話 (phone)', required: false },
    { key: 'address', label: '地址 (address)', required: false },
  ],
  sales: [
    { key: 'sale_date', label: '銷貨日期 (sale_date)', required: true },
    { key: 'sale_number', label: '銷貨單號 (sale_number)', required: true },
    { key: 'customer_code', label: '客戶編號 (customer_code)', required: true },
    { key: 'product_code', label: '商品編號 (product_code)', required: true },
    { key: 'quantity', label: '數量 (quantity)', required: true },
    { key: 'unit_price', label: '單價 (unit_price)', required: true },
    { key: 'subtotal', label: '小計 (subtotal)', required: false },
    { key: 'discount', label: '折扣 (discount)', required: false },
    { key: 'tax', label: '稅額 (tax)', required: false },
    { key: 'total', label: '總計 (total)', required: false },
  ],
  purchases: [
    { key: 'purchase_date', label: '進貨日期 (purchase_date)', required: true },
    { key: 'purchase_number', label: '進貨單號 (purchase_number)', required: true },
    { key: 'supplier_code', label: '廠商編號 (supplier_code)', required: true },
    { key: 'product_code', label: '商品編號 (product_code)', required: true },
    { key: 'quantity', label: '數量 (quantity)', required: true },
    { key: 'unit_cost', label: '單價 (unit_cost)', required: true },
    { key: 'subtotal', label: '小計 (subtotal)', required: false },
  ]
};

export function validateImportData(importType: ImportType, mappedData: any[]) {
  const errors: { row: number, message: string }[] = [];
  let validCount = 0;
  let errorCount = 0;
  
  const requiredTargets = TYPE_TARGET_COLUMNS[importType].filter(t => t.required).map(t => t.key);
  const duplicatesTracker = new Set<string>();

  mappedData.forEach((row, idx) => {
    const rowNum = idx + 2; // Assuming 1 header row + 1 for 0-index
    let hasError = false;
    
    // Required fields check
    for (const req of requiredTargets) {
      if (row[req] === undefined || row[req] === null || String(row[req]).trim() === '') {
        errors.push({ row: rowNum, message: `缺少必填欄位: ${req}` });
        hasError = true;
      }
    }

    // Numeric checks
    const numericFields = ['quantity', 'unit_price', 'unit_cost', 'subtotal', 'discount', 'tax', 'total', 'pack_qty', 'current_purchase_price'];
    for (const field of numericFields) {
      if (row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== '') {
        const val = parseFloat(row[field]);
        if (isNaN(val) || val < 0) {
           errors.push({ row: rowNum, message: `欄位 ${field} 必須為有效的非負數值` });
           hasError = true;
        }
      }
    }

    // Date checks
    const dateFields = ['sale_date', 'purchase_date'];
    for (const field of dateFields) {
       if (row[field]) {
         const d = new Date(row[field]);
         if (isNaN(d.getTime())) {
           errors.push({ row: rowNum, message: `欄位 ${field} 日期格式無效` });
           hasError = true;
         } else {
           row[field] = d.toISOString().split('T')[0];
         }
       }
    }

    // Duplicate detection within batch
    let duplicateKey = '';
    if (importType === 'products' && row['external_product_code']) {
      duplicateKey = row['external_product_code'];
    } else if (importType === 'customers' && row['external_customer_code']) {
      duplicateKey = row['external_customer_code'];
    } else if (importType === 'suppliers' && row['external_supplier_code']) {
      duplicateKey = row['external_supplier_code'];
    } else if (importType === 'sales' && row['sale_number'] && row['product_code']) {
      duplicateKey = `${row['sale_number']}_${row['product_code']}`;
    } else if (importType === 'purchases' && row['purchase_number'] && row['product_code']) {
      duplicateKey = `${row['purchase_number']}_${row['product_code']}`;
    }

    if (duplicateKey) {
      if (duplicatesTracker.has(duplicateKey)) {
        errors.push({ row: rowNum, message: `偵測到重複資料鍵值: ${duplicateKey}` });
        hasError = true;
      } else {
        duplicatesTracker.add(duplicateKey);
      }
    }

    if (hasError) {
      errorCount++;
    } else {
      validCount++;
    }
  });

  return {
    validCount,
    errorCount,
    warningCount: 0,
    data: mappedData,
    errors
  };
}