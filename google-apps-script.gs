/**
 * Google Apps Script สำหรับรับข้อมูลจากแอป "ระบบเก็บข้อมูลรูปรถ"
 * แล้วบันทึกลง Google Sheet ของคุณอัตโนมัติ (วันที่/เวลา/จำนวนรถ/ทะเบียน)
 *
 * ────────── วิธีใช้ ──────────
 * 1) เปิดชีต: https://docs.google.com/spreadsheets/d/1Oi0RSergpxKflQxEnPbHvH2LcGCosgvki9V2ns9s_Us/edit
 * 2) เมนู  Extensions → Apps Script
 * 3) ลบโค้ดเดิมทั้งหมด แล้ววางไฟล์นี้แทน → กด Save (ไอคอนแผ่นดิสก์)
 * 4) กด  Deploy → New deployment
 *      - เลือกชนิด (เฟือง ⚙️) →  Web app
 *      - Execute as:      Me (บัญชีคุณ)
 *      - Who has access:  Anyone
 *      - กด Deploy → อนุญาตสิทธิ์ (Authorize) → คัดลอก "Web app URL" ที่ลงท้ายด้วย /exec
 * 5) วาง URL นั้นใน config.js ที่บรรทัด  window.CARPHOTO_SHEET_URL = "...";
 *
 * แก้โค้ดแล้วต้อง Deploy → Manage deployments → แก้ deployment เดิม → Version: New version
 * ทุกครั้ง มิฉะนั้น URL เดิมจะยังรันโค้ดเวอร์ชันเก่า
 */

var SHEET_ID   = '1Oi0RSergpxKflQxEnPbHvH2LcGCosgvki9V2ns9s_Us';
var SHEET_NAME = '';   // เว้นว่าง = ใช้ชีตแรก (gid=0) หรือใส่ชื่อแท็บที่ต้องการ

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
    if (!sh) sh = ss.getSheets()[0];

    // ใส่หัวตารางครั้งแรกครั้งเดียว
    if (sh.getLastRow() === 0) {
      sh.appendRow(['เวลาบันทึก', 'วันที่', 'เวลา', 'จำนวนสะสมวันนั้น', 'ทะเบียน/หมายเหตุ', 'dateKey']);
    }

    sh.appendRow([
      new Date(),
      data.date    || '',
      data.time    || '',
      data.count   || '',
      data.plate   || '',
      data.dateKey || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// เปิด URL /exec ด้วย GET เพื่อทดสอบว่า deploy สำเร็จ (ควรเห็นข้อความ OK)
function doGet() {
  return ContentService.createTextOutput('CarPhoto Sheet endpoint OK');
}
