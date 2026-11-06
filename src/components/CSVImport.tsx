'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { processImportAction } from '@/app/actions/import';

interface ParsedRow {
  internal_sku: string;
  product_name: string;
  specification: string;
  sales_unit: string;
  items_per_box: string;
  purchase_cost: string;
  cost_effective_date: string;
  _rowNum: number;
}

interface ValidationError {
  row: number;
  message: string;
}

export default function CSVImport() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setSuccess(false);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data as any[];
        const validationErrors: ValidationError[] = [];
        
        const mappedData = parsed.map((row, index) => {
          const rowNum = index + 2; // +1 for header, +1 for 0-index
          
          if (!row.internal_sku) validationErrors.push({ row: rowNum, message: 'Missing internal_sku' });
          if (!row.product_name) validationErrors.push({ row: rowNum, message: 'Missing product_name' });
          if (!row.purchase_cost || isNaN(parseFloat(row.purchase_cost)) || parseFloat(row.purchase_cost) < 0) {
            validationErrors.push({ row: rowNum, message: 'Invalid or negative purchase_cost' });
          }
          if (!row.cost_effective_date || isNaN(Date.parse(row.cost_effective_date))) {
            validationErrors.push({ row: rowNum, message: 'Invalid cost_effective_date' });
          }
          if (!row.items_per_box || isNaN(parseInt(row.items_per_box)) || parseInt(row.items_per_box) <= 0) {
            validationErrors.push({ row: rowNum, message: 'Invalid items_per_box' });
          }

          return {
            internal_sku: row.internal_sku,
            product_name: row.product_name,
            specification: row.specification || '',
            sales_unit: row.sales_unit || '箱',
            items_per_box: row.items_per_box || '1',
            purchase_cost: row.purchase_cost,
            cost_effective_date: row.cost_effective_date,
            _rowNum: rowNum
          };
        });

        // Check duplicates in file
        const skus = new Set();
        mappedData.forEach(row => {
          if (skus.has(row.internal_sku)) {
            validationErrors.push({ row: row._rowNum, message: `Duplicate internal_sku in file: ${row.internal_sku}` });
          }
          if (row.internal_sku) skus.add(row.internal_sku);
        });

        setData(mappedData);
        setErrors(validationErrors);
      }
    });
  };

  const handleConfirm = async () => {
    if (errors.length > 0 || data.length === 0) return;
    
    setIsProcessing(true);
    
    // We send data to a Server Action to handle the DB transaction safely
    const result = await processImportAction(data);
    
    setIsProcessing(false);
    if (result.success) {
      setSuccess(true);
      setData([]);
      setFile(null);
    } else {
      setErrors([{ row: 0, message: result.error || 'Server error occurred during import' }]);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "internal_sku,product_name,specification,sales_unit,items_per_box,purchase_cost,cost_effective_date\nTEST-001,測試商品,M號,箱,10,100,2026-10-01";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 space-y-6">
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg text-gray-800">商品與成本匯入</h2>
          <button onClick={downloadTemplate} className="text-sm text-blue-600 hover:underline">
            下載 CSV 範本
          </button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors relative">
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <Upload className="mx-auto text-gray-400 mb-2" size={24} />
          <p className="text-sm text-gray-600 font-medium">點擊或拖曳上傳 CSV 檔案</p>
          {file && <p className="text-xs text-blue-600 mt-2 font-medium">{file.name}</p>}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 p-4 rounded-xl border border-red-100">
          <h3 className="text-red-800 font-bold flex items-center text-sm mb-2">
            <AlertCircle size={16} className="mr-1" /> 發現 {errors.length} 個錯誤
          </h3>
          <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
            {errors.map((err, i) => (
              <li key={i}>
                {err.row > 0 ? `第 ${err.row} 行: ` : ''}{err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {success && (
        <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-center text-green-800 text-sm font-medium">
          <CheckCircle2 size={16} className="mr-2" /> 匯入成功！
        </div>
      )}

      {data.length > 0 && errors.length === 0 && (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-800 text-sm">預覽 (共 {data.length} 筆)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 uppercase border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">商品名稱</th>
                  <th className="px-3 py-2">規格</th>
                  <th className="px-3 py-2">成本</th>
                  <th className="px-3 py-2">生效日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium">{row.internal_sku}</td>
                    <td className="px-3 py-2">{row.product_name}</td>
                    <td className="px-3 py-2">{row.specification}</td>
                    <td className="px-3 py-2">{row.purchase_cost}</td>
                    <td className="px-3 py-2">{row.cost_effective_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 5 && (
              <div className="text-center text-xs text-gray-500 py-2 bg-gray-50 rounded-b-lg border-t border-gray-100">
                ...以及其他 {data.length - 5} 筆
              </div>
            )}
          </div>
          
          <button 
            onClick={handleConfirm}
            disabled={isProcessing}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {isProcessing ? '處理中...' : '確認匯入'}
          </button>
        </div>
      )}
    </div>
  );
}
