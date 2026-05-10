const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const csvPath = path.resolve(__dirname, '../docs/UnitTestCases_MuonTra_QuanLyKho_TacGia_Category.csv');
const outPath = path.resolve(__dirname, '../docs/UnitTestReport_LibraryMS_Postman_vn.xlsx');

if (!fs.existsSync(csvPath)) {
  console.error('Không tìm thấy file CSV mẫu:', csvPath);
  process.exit(1);
}

const csvText = fs.readFileSync(csvPath, 'utf8');

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };

  const header = parseLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const parsed = parseLine(lines[i]);
    // If number of columns is less than header, try to merge subsequent lines (not expected for our CSV)
    if (parsed.length === 0) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = parsed[j] !== undefined ? parsed[j] : '';
    }
    rows.push(obj);
  }

  return { header, rows };
}

function parseLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // handle escaped double quotes ""
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
      continue;
    }

    cur += ch;
  }
  result.push(cur);
  return result.map(s => s.replace(/\r?\n/g, ' ').trim());
}

const { header, rows } = parseCSV(csvText);

// Group by feature (Tính năng)
const groups = {};
for (const r of rows) {
  const feature = (r['Tính năng'] || r['Feature'] || 'Không phân loại').trim();
  if (!groups[feature]) groups[feature] = [];
  groups[feature].push(r);
}

(async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Script tạo Excel (VN)';
  workbook.created = new Date();

  // Tổng quan sheet
  const overview = workbook.addWorksheet('Tổng Quan');
  overview.columns = [
    { header: 'Tính năng', key: 'feature', width: 40 },
    { header: 'Số test case', key: 'count', width: 15 },
  ];

  let total = 0;
  for (const [feature, arr] of Object.entries(groups)) {
    overview.addRow({ feature, count: arr.length });
    total += arr.length;
  }
  overview.addRow({ feature: 'Tổng cộng', count: total });
  overview.getRow(1).font = { bold: true };

  // Add sheets per feature
  const usedNames = new Set();
  for (const [feature, arr] of Object.entries(groups)) {
    let sheetName = feature || 'Không phân loại';
    if (sheetName.length > 31) sheetName = sheetName.slice(0, 31);
    // ensure unique
    let base = sheetName;
    let idx = 1;
    while (usedNames.has(sheetName)) {
      const suffix = '_' + idx;
      sheetName = base.slice(0, 31 - suffix.length) + suffix;
      idx++;
    }
    usedNames.add(sheetName);

    const sheet = workbook.addWorksheet(sheetName);
    // set header row using CSV header if available, else default
    const columns = (header && header.length > 0) ? header : [
      'Test ID','Tính năng','Module (file)','Hàm/Lớp','Tiêu đề kiểm thử','Tiền điều kiện','Dữ liệu vào','Các bước thực hiện','Kết quả mong đợi','Ưu tiên','Ghi chú'
    ];

    sheet.columns = columns.map(h => ({ header: h, key: h, width: Math.max(15, Math.min(60, h.length + 10)) }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const rowObj of arr) {
      const row = columns.map(col => rowObj[col] || '');
      sheet.addRow(row);
    }
  }

  try {
    await workbook.xlsx.writeFile(outPath);
    console.log('Tạo file thành công:', outPath);
  } catch (err) {
    console.error('Lỗi khi ghi file Excel:', err);
    process.exit(1);
  }
})();
