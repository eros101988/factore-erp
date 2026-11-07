import Decimal from 'decimal.js';

export interface ParsedPriceListItem {
  supplier_sku: string;
  description?: string;
  specification?: string;
  pack_qty?: number;
  purchase_unit?: string;
  unit_cost: string | null; // Decimal string; null when the cost could not be read
  calculated_pack_cost: string | null;
  row_status: 'valid' | 'error';
  error_message?: string;
  raw_text: string;
}

export type ParseStatus = 'PARSED' | 'MANUAL_REVIEW_REQUIRED';

export interface ParseResult {
  status: ParseStatus;
  items: ParsedPriceListItem[];
  error?: string;
}

// Supplier SKU: starts alphanumeric, contains at least one letter, allows dashes, e.g. KA-T91N
const SKU_RE = /^(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9\-_.\/]{2,}$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
// Pack qty token, e.g. "40", "40捲/箱", "100包", "40ROLL"
const PACK_RE = /^(\d+)([^\d\s\/]*)(?:\/(\S+))?$/;
const MIN_TEXT_LENGTH = 20;

export function calculatePackCost(unitCost: Decimal.Value, packQty: Decimal.Value): string {
  return new Decimal(unitCost).times(new Decimal(packQty)).toString();
}

/**
 * Parses one line of a text-based supplier price list.
 * Expected column order: SKU, description/spec..., pack qty [unit], [purchase unit], unit cost.
 * Returns null for lines that are not item rows (headers, titles, blank lines).
 */
export function parsePriceListLine(line: string): ParsedPriceListItem | null {
  const trimmed = line.trim().replace(/,(?=\d{3}\b)/g, '');
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 3 || !SKU_RE.test(tokens[0]) || /^\d+$/.test(tokens[0])) return null;

  const sku = tokens[0];
  const costToken = tokens[tokens.length - 1];
  const middle = tokens.slice(1, -1);

  // Find pack qty: last token in the middle that looks like a pack token
  let packIndex = -1;
  for (let i = middle.length - 1; i >= 0; i--) {
    if (PACK_RE.test(middle[i])) { packIndex = i; break; }
  }
  // A cost-like last token is required to treat this as an item row
  if (!NUMBER_RE.test(costToken) && packIndex === -1) return null;

  let packQty: number | undefined;
  let purchaseUnit: string | undefined;
  let descTokens = middle;
  if (packIndex >= 0) {
    const m = middle[packIndex].match(PACK_RE)!;
    packQty = parseInt(m[1], 10);
    purchaseUnit = m[2] || middle[packIndex + 1] || undefined;
    descTokens = middle.slice(0, packIndex);
  }

  const item: ParsedPriceListItem = {
    supplier_sku: sku,
    description: descTokens[0],
    specification: descTokens.slice(1).join(' ') || undefined,
    pack_qty: packQty,
    purchase_unit: purchaseUnit,
    unit_cost: null,
    calculated_pack_cost: null,
    row_status: 'valid',
    raw_text: line.trim(),
  };

  if (!NUMBER_RE.test(costToken)) {
    item.row_status = 'error';
    item.error_message = `無法解析成本: ${costToken}`;
    return item;
  }
  const cost = new Decimal(costToken);
  item.unit_cost = cost.toString();
  if (cost.lte(0)) {
    item.row_status = 'error';
    item.error_message = `成本必須大於 0: ${costToken}`;
    return item;
  }
  if (packQty === undefined || packQty <= 0) {
    item.row_status = 'error';
    item.error_message = '無有效包裝數量 (Pack Qty)';
    return item;
  }
  item.calculated_pack_cost = calculatePackCost(cost, packQty);
  return item;
}

export function parsePriceListText(text: string): ParseResult {
  if (!text || text.replace(/\s/g, '').length < MIN_TEXT_LENGTH) {
    return { status: 'MANUAL_REVIEW_REQUIRED', items: [], error: 'PDF 無可讀文字（可能為掃描圖片），需人工檢查。' };
  }
  const items = text.split(/\r?\n/).map(parsePriceListLine).filter((i): i is ParsedPriceListItem => i !== null);
  if (items.length === 0) {
    return { status: 'MANUAL_REVIEW_REQUIRED', items: [], error: '無法從 PDF 文字中找到任何價格項目，版面可能不符。' };
  }
  return { status: 'PARSED', items };
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function parseSupplierPdf(buffer: Buffer): Promise<ParseResult> {
  let text: string;
  try {
    text = await extractPdfText(buffer);
  } catch (error) {
    return {
      status: 'MANUAL_REVIEW_REQUIRED',
      items: [],
      error: `PDF 讀取失敗: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return parsePriceListText(text);
}
