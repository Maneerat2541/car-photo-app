// ─────────────────────────────────────────────────────────────────────────
// ตั้งค่าปลายทางออนไลน์ของแอป (แก้ไฟล์นี้ไฟล์เดียว ใช้ได้ทั้ง index.html และ office.html)
//
//   • ปล่อยเป็น null ทั้งคู่ = โหมดเดโมในเครื่อง (localStorage + ข้ามแท็บ)
//   • ใส่ค่า = ออนไลน์จริง ข้ามอุปกรณ์ (มือถือภาคสนาม ↔ คอมออฟฟิศ)
//
// ดูขั้นตอนการตั้งค่าแบบละเอียดใน DEPLOY.md
// ─────────────────────────────────────────────────────────────────────────

// 1) Firebase — เก็บรูป + เรียลไทม์ (แนะนำ ดู DEPLOY.md ข้อ "คลาวด์")
//    เอา /* */ ออกแล้วใส่ค่าจาก Firebase Console → Project settings → Web app
window.CARPHOTO_FIREBASE = {
  apiKey:            "AIzaSyDlcjRrj4G1zb41fE1ZUkRDBNZQsATMm7c",
  authDomain:        "car-photo-app-ac2f2.firebaseapp.com",
  projectId:         "car-photo-app-ac2f2",
  storageBucket:     "car-photo-app-ac2f2.firebasestorage.app",
  messagingSenderId: "769657688200",
  appId:             "1:769657688200:web:4e567b2f1fbaa0a8b88f3d",
  collection:        "car_photos"   // ชื่อคอลเลกชันใน Firestore
};

// 2) Google Sheet — ส่ง วันที่/เวลา/จำนวนรถ/ทะเบียน ลงชีตอัตโนมัติ (ตัวเลือกเสริม)
//    วาง URL ที่ได้จากการ Deploy Apps Script (ลงท้าย /exec) — ดู google-apps-script.gs
window.CARPHOTO_SHEET_URL = "https://script.google.com/macros/s/AKfycbyVQAqfD8Bcdnr0b0LQNi8hhXTcG7B-kvfo1nTon0FX4WYw2Wt7lt3TnaZyTDfjKyofow/exec";
