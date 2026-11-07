'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Upload, CheckCircle2, AlertCircle, FileText, Settings, FileSearch, ArrowRight, ArrowLeft } from 'lucide-react';
import { uploadImportBatchAction, confirmImportBatchAction } from '@/app/actions/dataIntake';

import { validateImportData, TYPE_TARGET_COLUMNS, ImportType } from '@/lib/import/validator';

type WizardStep = 'type' | 'upload' | 'mapping' | 'preview' | 'result';

interface MappedColumn {
  source: string;
  target: string;
}

interface ValidationResult {
  validCount: number;
  errorCount: number;
  warningCount: number;
  data: any[];
  errors: { row: number; message: string }[];
}

export default function DataIntakeWizard() {
  const [step, setStep] = useState<WizardStep>('type');
  const [importType, setImportType] = useState<ImportType>('products');
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<MappedColumn[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // 1. Select Type
  const handleTypeSelect = (type: ImportType) => {
    setImportType(type);
    setStep('upload');
  };

  // 2. Upload File
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    const isCSV = selectedFile.name.endsWith('.csv');
    
    if (isCSV) {
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processParsedData(results.data, results.meta.fields || []);
        }
      });
    } else {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      
      if (jsonData.length > 0) {
        const fields = Object.keys(jsonData[0] as any);
        processParsedData(jsonData, fields);
      } else {
        alert("檔案為空或無法解析");
      }
    }
  };

  const processParsedData = (data: any[], fields: string[]) => {
    setRawData(data);
    setSourceColumns(fields);
    
    // Auto-suggest mapping
    const targets = TYPE_TARGET_COLUMNS[importType];
    const initialMappings: MappedColumn[] = targets.map(t => {
      // Very basic auto-match by checking if field includes target key or target key includes field
      const match = fields.find(f => 
        t.key.toLowerCase().includes(f.toLowerCase()) || 
        f.toLowerCase().includes(t.key.toLowerCase()) ||
        t.label.includes(f)
      );
      return { source: match || '', target: t.key };
    });
    
    setMappings(initialMappings);
    setStep('mapping');
  };

  // 3. Mapping
  const handleMappingChange = (targetKey: string, sourceField: string) => {
    setMappings(prev => prev.map(m => m.target === targetKey ? { ...m, source: sourceField } : m));
  };

  const handleValidate = async () => {
    setIsProcessing(true);
    
    // Create mapped data
    const mappedData = rawData.map(row => {
      const mappedRow: any = {};
      mappings.forEach(m => {
        if (m.source) {
          mappedRow[m.target] = row[m.source];
        }
      });
      return mappedRow;
    });

    const result = validateImportData(importType, mappedData);

    setValidationResult(result);

    // Upload batch to get batch_id
    if (file) {
       // Convert rawData to staging rows format
       const stagingRows = rawData.map((row, idx) => {
         const rowNum = idx + 2;
         const rowErrors = result.errors.filter(e => e.row === rowNum);
      const validationStatus = rowErrors.length > 0 ? 'error' : 'valid';
      const errorMessage = rowErrors.map(e => e.message).join('; ');
         return {
           row_number: rowNum,
           raw_data: row,
           normalized_data: mappedData[idx],
           validation_status: validationStatus,
           error_message: errorMessage
         };
       });

       const res = await uploadImportBatchAction('manual', importType, file.name, stagingRows);
       if (res.success && res.batchId) {
         setBatchId(res.batchId);
         setStep('preview');
       } else {
         alert("建立 Import Batch 失敗：" + res.error);
       }
    }
    
    setIsProcessing(false);
  };

  // 4. Confirm
  const handleConfirm = async () => {
    if (!batchId || !validationResult || validationResult.errorCount > 0) return;
    
    setIsProcessing(true);
    const res = await confirmImportBatchAction(batchId, importType);
    
    setIsProcessing(false);
    setStep('result');
    if (res.success) {
      setResultMessage({ type: 'success', text: `成功匯入 ${validationResult.validCount} 筆資料` });
    } else {
      setResultMessage({ type: 'error', text: `匯入失敗：${res.error}` });
    }
  };

  const reset = () => {
    setStep('type');
    setFile(null);
    setRawData([]);
    setMappings([]);
    setValidationResult(null);
    setBatchId(null);
    setResultMessage(null);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6 pb-20">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header Steps */}
        <div className="flex border-b border-gray-100 bg-gray-50">
          <div className={`flex-1 py-3 px-4 text-center text-sm font-medium ${step === 'type' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-gray-500'}`}>1. 選擇類型</div>
          <div className={`flex-1 py-3 px-4 text-center text-sm font-medium ${step === 'upload' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-gray-500'}`}>2. 上傳檔案</div>
          <div className={`flex-1 py-3 px-4 text-center text-sm font-medium ${step === 'mapping' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-gray-500'}`}>3. 欄位對應</div>
          <div className={`flex-1 py-3 px-4 text-center text-sm font-medium ${step === 'preview' ? 'text-blue-600 bg-white border-b-2 border-blue-600' : 'text-gray-500'}`}>4. 預覽與確認</div>
        </div>

        <div className="p-6">
          {/* Step 1: Type */}
          {step === 'type' && (
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleTypeSelect('products')} className="p-6 border rounded-xl hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center gap-3">
                <FileText size={32} className="text-blue-500" />
                <span className="font-bold">商品資料</span>
              </button>
              <button onClick={() => handleTypeSelect('customers')} className="p-6 border rounded-xl hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center gap-3">
                <FileText size={32} className="text-green-500" />
                <span className="font-bold">客戶資料</span>
              </button>
              <button onClick={() => handleTypeSelect('suppliers')} className="p-6 border rounded-xl hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center gap-3">
                <FileText size={32} className="text-purple-500" />
                <span className="font-bold">廠商資料</span>
              </button>
              <button onClick={() => handleTypeSelect('sales')} className="p-6 border rounded-xl hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center gap-3">
                <FileText size={32} className="text-orange-500" />
                <span className="font-bold">歷史銷貨</span>
              </button>
              <button onClick={() => handleTypeSelect('purchases')} className="p-6 border rounded-xl hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center gap-3">
                <FileText size={32} className="text-red-500" />
                <span className="font-bold">歷史進貨</span>
              </button>
            </div>
          )}

          {/* Step 2: Upload */}
          {step === 'upload' && (
            <div className="space-y-4 text-center">
              <h3 className="font-bold text-lg">上傳 {importType} 檔案</h3>
              <p className="text-sm text-gray-500">支援 .csv, .xlsx, .xls</p>
              
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 hover:bg-gray-50 transition-colors relative mt-4">
                <input 
                  type="file" 
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                <p className="text-sm text-gray-600 font-medium">點擊或拖曳上傳檔案</p>
              </div>
              <button onClick={() => setStep('type')} className="text-sm text-gray-500 hover:text-gray-800 mt-4 flex items-center justify-center w-full">
                <ArrowLeft size={16} className="mr-1" /> 返回選擇類型
              </button>
            </div>
          )}

          {/* Step 3: Mapping */}
          {step === 'mapping' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg">設定欄位對應</h3>
                <span className="text-sm text-gray-500">來源檔案: {file?.name} ({rawData.length} 筆)</span>
              </div>
              
              <div className="space-y-4">
                {TYPE_TARGET_COLUMNS[importType].map((target) => {
                  const mapping = mappings.find(m => m.target === target.key);
                  return (
                    <div key={target.key} className="flex items-center gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-700">{target.label}</span>
                        {target.required && <span className="text-red-500 ml-1 text-xs">*必填</span>}
                      </div>
                      <ArrowRight size={16} className="text-gray-400" />
                      <div className="flex-1">
                        <select 
                          className="w-full p-2 text-sm border rounded bg-white"
                          value={mapping?.source || ''}
                          onChange={(e) => handleMappingChange(target.key, e.target.value)}
                        >
                          <option value="">-- 忽略此欄位 --</option>
                          {sourceColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-between pt-4">
                <button onClick={() => setStep('upload')} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                  重新上傳
                </button>
                <button 
                  onClick={handleValidate} 
                  disabled={isProcessing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isProcessing ? '驗證中...' : '驗證並預覽'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 'preview' && validationResult && (
            <div className="space-y-6">
              <h3 className="font-bold text-lg">資料預覽與驗證結果</h3>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                  <div className="text-2xl font-bold text-blue-700">{validationResult.data.length}</div>
                  <div className="text-xs text-blue-600 mt-1">總筆數</div>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
                  <div className="text-2xl font-bold text-green-700">{validationResult.validCount}</div>
                  <div className="text-xs text-green-600 mt-1">可匯入</div>
                </div>
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                  <div className="text-2xl font-bold text-red-700">{validationResult.errorCount}</div>
                  <div className="text-xs text-red-600 mt-1">錯誤</div>
                </div>
              </div>

              {validationResult.errors.length > 0 && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <h4 className="text-red-800 font-bold flex items-center text-sm mb-2">
                    <AlertCircle size={16} className="mr-1" /> 發現 {validationResult.errors.length} 個錯誤
                  </h4>
                  <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto list-disc pl-4">
                    {validationResult.errors.slice(0, 50).map((err, i) => (
                      <li key={i}>第 {err.row} 行: {err.message}</li>
                    ))}
                    {validationResult.errors.length > 50 && <li>...等其他 {validationResult.errors.length - 50} 個錯誤</li>}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-500 uppercase border-b border-gray-200">
                    <tr>
                      {TYPE_TARGET_COLUMNS[importType].map(t => (
                         <th key={t.key} className="px-3 py-2">{t.key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {validationResult.data.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                         {TYPE_TARGET_COLUMNS[importType].map(t => (
                           <td key={t.key} className="px-3 py-2 max-w-[150px] truncate">{row[t.key] !== undefined ? String(row[t.key]) : ''}</td>
                         ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validationResult.data.length > 10 && (
                  <div className="text-center text-xs text-gray-500 py-2 bg-gray-50 rounded-b-lg border-t border-gray-100">
                    ...預覽前 10 筆，共 {validationResult.data.length} 筆
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <button onClick={() => setStep('mapping')} className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                  返回修改對應
                </button>
                <button 
                  onClick={handleConfirm} 
                  disabled={isProcessing || validationResult.errorCount > 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing ? '寫入中...' : <><CheckCircle2 size={16}/> 確認匯入</>}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Result */}
          {step === 'result' && resultMessage && (
            <div className="text-center space-y-6 py-8">
              {resultMessage.type === 'success' ? (
                <CheckCircle2 size={64} className="mx-auto text-green-500" />
              ) : (
                <AlertCircle size={64} className="mx-auto text-red-500" />
              )}
              
              <h3 className={`text-xl font-bold ${resultMessage.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                {resultMessage.text}
              </h3>
              
              <button onClick={reset} className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
                完成並返回
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}