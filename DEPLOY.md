# คู่มือขึ้นระบบจริง (Deploy)

สถาปัตยกรรม: **GitHub Pages** (โฮสต์หน้าเว็บ) + **Firebase** (เก็บรูป/เรียลไทม์) + **Google Sheet** (log)

```
มือถือภาคสนาม ──ถ่าย/ส่ง──►  Firebase (Firestore)  ──เรียลไทม์──►  คอมออฟฟิศ (office.html)
   (index.html)                     │
   ทั้งคู่โฮสต์บน GitHub Pages         └──log──►  Google Sheet
```

> **สำคัญ:** GitHub Pages เป็นโฮสต์ไฟล์นิ่ง (static) ไม่มีเซิร์ฟเวอร์ ดังนั้นถ้าอยากให้
> "มือถือภาคสนาม" กับ "คอมออฟฟิศ" เห็นข้อมูลเดียวกันแบบเรียลไทม์ **ต้องต่อ Firebase**
> (ถ้าไม่ต่อ จะเป็นโหมดเดโม เห็นเฉพาะในเครื่อง/เบราว์เซอร์เดียวกันเท่านั้น)

---

## 1) โฮสต์บน GitHub Pages

repo ถูก `git init` + commit ไว้ให้แล้ว เหลือแค่สร้าง repo บน GitHub แล้ว push

1. ไปที่ https://github.com/new → ตั้งชื่อ เช่น `car-photo-app` → เลือก **Public** → **Create repository**
   (อย่าเพิ่งติ๊ก add README/gitignore)
2. ในโฟลเดอร์โปรเจกต์นี้ รันคำสั่ง (แทน `<user>` และ `<repo>` ด้วยของคุณ):

   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git branch -M main
   git push -u origin main
   ```

3. ในหน้า repo → **Settings → Pages** → หัวข้อ *Build and deployment*
   - Source: **Deploy from a branch**
   - Branch: **main** / โฟลเดอร์ **/ (root)** → **Save**
4. รอ ~1 นาที จะได้ลิงก์:
   - แอปมือถือ:  `https://<user>.github.io/<repo>/`
   - หน้าจอออฟฟิศ: `https://<user>.github.io/<repo>/office.html`

Pages เป็น **HTTPS** อยู่แล้ว → กล้องมือถือ (getUserMedia) และ GPS ใช้งานได้ปกติ ✅

> ยังไม่มี `gh` CLI ในเครื่องนี้จึงสร้าง repo ให้อัตโนมัติไม่ได้ ถ้าติดตั้ง `gh` แล้วบอกผม
> เดี๋ยวผมสั่ง `gh repo create ... --push` + เปิด Pages ให้จบในทีเดียว

---

## 2) คลาวด์เก็บรูป — แนะนำ **Firebase (Firestore)**

**ทำไม Firebase:** โค้ด `sync.js` รองรับไว้ครบแล้ว (แค่ใส่ config) — ได้เรียลไทม์ทันที
(หน้าออฟฟิศอัปเดตสด), ไม่ต้องมีเซิร์ฟเวอร์ของตัวเอง, และ **แพ็กฟรี (Spark) ไม่ต้องผูกบัตร**

ทำไมเข้ากับงานนี้พอดี: แต่ละรูปถูกเขียนเป็นเอกสารแยก (เลี่ยงลิมิต 1MiB/doc) และมี
คอลเลกชันสถิติรายวันแยกไว้ → หน้าออฟฟิศทำ **ฟีดสด · กราฟ · ดาวน์โหลด ZIP · ลบรายวัน**
ได้ครบ และ workflow ที่ออกแบบไว้คือ *ดาวน์โหลดเก็บเครื่องก่อน แล้วลบวันเก่าออก* — ทำให้
พื้นที่ฟรีไม่เต็ม

### ตั้งค่า Firebase
1. https://console.firebase.google.com → **Add project** (ปิด Google Analytics ก็ได้)
2. เมนู **Build → Firestore Database → Create database** → เลือก region ใกล้ไทย (เช่น `asia-southeast1`)
3. **Project settings** (เฟือง) → เลื่อนลง **Your apps** → ไอคอน `</>` (Web) → ตั้งชื่อ → คัดลอกค่า config
4. เปิด `config.js` เอา `/* */` ออก แล้วใส่ค่า:

   ```js
   window.CARPHOTO_FIREBASE = {
     apiKey:     "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId:  "your-project",
     appId:      "1:...:web:...",
     collection: "car_photos"
   };
   ```
5. commit + push อีกครั้ง → ทั้งสองหน้าจะสลับเป็นโหมดออนไลน์เอง (badge เปลี่ยนเป็น "ออนไลน์ · Firebase")

### ⚠️ กฎความปลอดภัย (Firestore Rules)
ค่าเริ่มต้น test mode จะเปิดให้ใครก็เขียนได้ 30 วันแล้วปิด สำหรับใช้งานจริงควรตั้งกฎเอง
เช่น จำกัดเฉพาะผู้ล็อกอิน (ต้องเพิ่ม Firebase Auth) หรืออย่างน้อยกันการลบ:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /{doc=**} {
      allow read, create: if true;   // ให้ภาคสนามส่งเข้าได้
      allow update, delete: if false; // กันลบจากภายนอก (ลบผ่านหน้าออฟฟิศได้เพราะ...)
    }
  }
}
```
> หมายเหตุ: ปุ่ม "ลบออกจากคลาวด์" ในหน้าออฟฟิศต้องการสิทธิ์ delete ถ้าตั้ง `delete:false`
> ปุ่มนี้จะไม่ทำงาน — เลือกกฎให้ตรงกับวิธีใช้จริง (เช่น เปิด delete เฉพาะช่วง หรือทำ Auth ให้เจ้าหน้าที่ออฟฟิศ)

**เปลืองที่ไหม?** รูปถูกย่อ ~150–300KB/รูป × 3 = ~1MB/คัน แพ็กฟรีมี 1 GiB → ~1,000 คัน
ก่อนต้องเคลียร์ ถ้าปริมาณเยอะกว่านั้นมาก ค่อยอัปเกรดเป็นเก็บไฟล์รูปใน **Firebase Storage**
(ฟรี 5 GB) แล้วเก็บแค่ลิงก์ใน Firestore — บอกผมได้ถ้าจะไปทางนั้น เดี๋ยวปรับ `sync.js` ให้

### ทางเลือกอื่น (ถ้าไม่อยากใช้ Firebase)
- **Supabase** (Postgres + Realtime + Storage ฟรี) — เหมาะกับรูปเยอะ/ไฟล์ใหญ่ แต่ต้องแก้ `sync.js` เพิ่ม
- Cloudinary / S3 — เก็บรูปดี แต่ **ไม่มีเรียลไทม์** หน้าออฟฟิศจะไม่เด้งสด
- สรุป: งานนี้ **Firebase คุ้มสุด** เพราะโค้ดพร้อมและได้เรียลไทม์ฟรี

---

## 3) ต่อ Google Sheet (log อัตโนมัติ)

ชีตเป้าหมาย: `1Oi0RSergpxKflQxEnPbHvH2LcGCosgvki9V2ns9s_Us`

1. เปิดไฟล์ `google-apps-script.gs` ในโปรเจกต์นี้ แล้วทำตามขั้นตอนในหัวคอมเมนต์:
   เปิดชีต → **Extensions → Apps Script** → วางโค้ด → **Deploy → New deployment → Web app**
   (Execute as: **Me**, Who has access: **Anyone**) → คัดลอก URL ที่ลงท้าย `/exec`
2. วาง URL ใน `config.js`:

   ```js
   window.CARPHOTO_SHEET_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
   ```
3. commit + push — จากนั้นทุกครั้งที่กด "ส่งเข้าคลาวด์" จะมีแถวใหม่โผล่ในชีต
   (คอลัมน์: เวลาบันทึก · วันที่ · เวลา · จำนวนสะสมวันนั้น · ทะเบียน/หมายเหตุ · dateKey)

> Sheet เป็น **log เสริม** ทำงานคู่กับโหมดใดก็ได้ (local หรือ Firebase) — ตัวรูปจริงไม่ได้
> เก็บในชีต (ชีตเก็บแค่ข้อความ) รูปอยู่ที่ Firebase/ในเครื่อง

---

## สรุปลำดับที่แนะนำ
1. ต่อ **Firebase** ก่อน (ข้อ 2) — หัวใจของระบบ ทำให้ข้ามอุปกรณ์ได้
2. ต่อ **Google Sheet** (ข้อ 3) — ไว้สรุป/ส่งต่อฝ่ายอื่น
3. **push ขึ้น GitHub Pages** (ข้อ 1) — แจกลิงก์ให้ภาคสนามและออฟฟิศใช้

ทุกการตั้งค่าออนไลน์อยู่ที่ไฟล์เดียว: **`config.js`**
