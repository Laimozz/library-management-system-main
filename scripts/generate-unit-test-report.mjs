import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

// Script tạo file Excel báo cáo test nhiều sheet bằng tiếng Việt
// Đọc CSV test case ở docs/UnitTestCases_MuonTra_QuanLyKho_TacGia_Category.csv
// Ghi kết quả vào docs/UnitTestReport_LibraryMS_Postman_vn.xlsx

const root = process.cwd();
const csvPath = path.join(root, 'docs', 'UnitTestCases_MuonTra_QuanLyKho_TacGia_Category.csv');
const outPath = path.join(root, 'docs', 'UnitTestReport_LibraryMS_Postman_vn.xlsx');

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Handle escaped double quote ""
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map(f => {
    let s = f;
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    // Unescape double quotes and convert escaped newlines to real newlines
    s = s.replace(/""/g, '"').replace(/\\n/g, '\n');
    return s;
  });
}

function sanitizeSheetName(name) {
  if (!name) return 'Sheet';
  // Remove invalid chars and trim to 31 chars
  return name.replace(/[\\\/*?:\[\]]/g, ' ').slice(0, 31);
}

async function main() {
  try {
    const csvExists = await fs.stat(csvPath).then(() => true).catch(() => false);
    if (!csvExists) {
      console.error(`Không tìm thấy file CSV mẫu: ${csvPath}`);
      process.exit(1);
    }

    const text = await fs.readFile(csvPath, 'utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) {
      console.error('CSV rỗng.');
      process.exit(1);
    }

    const headersRaw = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(l => parseCsvLine(l));

    // Map headers to Vietnamese (một số đã bằng tiếng Việt)
    const vnHeaders = [
      'Mã Test',
      'Tính năng',
      'Module (file)',
      'Hàm/Lớp',
      'Tiêu đề kiểm thử',
      'Tiền điều kiện',
      'Dữ liệu vào',
      'Các bước thực hiện',
      'Kết quả mong đợi',
      'Ưu tiên',
      'Ghi chú',
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Automated Tester';
    workbook.created = new Date();

    // Tổng quan sheet
    const summary = workbook.addWorksheet('Tổng quan');
    summary.addRow(['Báo cáo Kiểm thử tự động - Phiên bản tiếng Việt']);
    summary.addRow([]);

    // Thống kê cơ bản
    const totalTests = rows.length;
    const featureCounts = {};
    const priorityCounts = {};
    rows.forEach(r => {
      const feature = r[1] || 'Không rõ';
      featureCounts[feature] = (featureCounts[feature] || 0) + 1;
      const pr = (r[9] || '').trim() || 'Không xác định';
      priorityCounts[pr] = (priorityCounts[pr] || 0) + 1;
    });

    summary.addRow(['Tổng số Test Case', totalTests]);
    summary.addRow([]);
    summary.addRow(['Số lượng theo tính năng']);
    Object.entries(featureCounts).forEach(([k, v]) => summary.addRow([k, v]));
    summary.addRow([]);
    summary.addRow(['Số lượng theo độ ưu tiên']);
    Object.entries(priorityCounts).forEach(([k, v]) => summary.addRow([k, v]));

    // Danh sách Test Case (tất cả)
    const listSheet = workbook.addWorksheet('Danh sách Test Case');
    listSheet.addRow(vnHeaders);
    rows.forEach(cols => {
      // ensure length matches
      const row = new Array(vnHeaders.length).fill('');
      for (let i = 0; i < Math.min(cols.length, vnHeaders.length); i++) row[i] = cols[i];
      listSheet.addRow(row);
    });

    // Tạo sheet riêng cho từng tính năng
    for (const feature of Object.keys(featureCounts)) {
      const name = sanitizeSheetName(feature);
      const sheet = workbook.addWorksheet(name || 'Tính năng');
      sheet.addRow(vnHeaders);
      rows.filter(r => (r[1] || '') === feature).forEach(cols => {
        const row = new Array(vnHeaders.length).fill('');
        for (let i = 0; i < Math.min(cols.length, vnHeaders.length); i++) row[i] = cols[i];
        sheet.addRow(row);
      });
    }

    // Một sheet bổ sung: Hướng dẫn ngắn
    const guide = workbook.addWorksheet('Hướng dẫn');
    guide.addRow(['Hướng dẫn:']);
    guide.addRow(['- File này được sinh tự động từ CSV mẫu.']);
    guide.addRow(['- Mọi nội dung bằng tiếng Việt.']);

    // Tùy chỉnh độ rộng cột cho sheet danh sách
    const sheetsToAdjust = [listSheet, ...workbook.worksheets.filter(s => s.name !== 'Tổng quan' && s.name !== 'Hướng dẫn' && s.name !== 'Danh sách Test Case')];
    for (const s of sheetsToAdjust) {
      s.columns = vnHeaders.map(h => ({ header: h, width: Math.max(20, Math.min(60, h.length + 10)) }));
    }

    await workbook.xlsx.writeFile(outPath);
    console.log('Tệp Excel đã được tạo:', outPath);
  } catch (err) {
    console.error('Lỗi khi tạo Excel:', err);
    process.exit(1);
  }
}

main();
