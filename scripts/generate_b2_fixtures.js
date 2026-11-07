// Generates the B2 demo supplier price list PDFs used by tests (text-based + one image-only).
// Usage: node scripts/generate_b2_fixtures.js
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'tests', 'fixtures');

function buildPdf(lines) {
  const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = lines
    .map((l, i) => `BT /F1 11 Tf 50 ${780 - i * 18} Td (${esc(l)}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const header = ['SKU Description Spec Pack Unit UnitCost'];

const fixtures = {
  'supplier_price_list_2026_11.pdf': [
    'TW-YINGDE Supplier Price List 2026/11',
    ...header,
    'KA-T91N TAPE 910x1100 40 ROLL 36.6',
    'KA-B20 BAG 20x30cm 100 PCS 1.25',
  ],
  'supplier_price_list_2026_12.pdf': [
    'TW-YINGDE Supplier Price List 2026/12',
    ...header,
    'KA-T91N TAPE 910x1100 40 ROLL 38',
    'KA-B20 BAG 20x30cm 100 PCS 1.25',
    'KA-X99 GLOVE M 10 BOX N/A',
  ],
  // No text layer at all: simulates a scanned image PDF
  'supplier_price_list_scanned.pdf': [],
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, lines] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(outDir, name), buildPdf(lines));
  console.log('wrote', path.join('tests', 'fixtures', name));
}
