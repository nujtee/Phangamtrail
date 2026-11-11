# คู่มือ Deploy ระบบจองเดินป่าผาแง่ม ขึ้น phangamtrail.com (ละเอียดทีละขั้น)

ใช้เวลาประมาณ 15–20 นาที ทำบนคอมพิวเตอร์ (Windows หรือ Mac) ครั้งเดียว

---

## ขั้นที่ 1 · ติดตั้ง Node.js (ถ้ายังไม่มี)
1. เข้า https://nodejs.org → กดดาวน์โหลดรุ่น **LTS**
2. ติดตั้งแบบกด Next ไปเรื่อย ๆ
3. ตรวจว่าติดตั้งแล้ว: เปิดโปรแกรมพิมพ์คำสั่ง แล้วพิมพ์
   ```
   node -v
   ```
   ต้องขึ้นเลข v20 ขึ้นไป (เช่น v22.x.x)

**วิธีเปิดโปรแกรมพิมพ์คำสั่ง**
- Windows: กดปุ่ม Windows → พิมพ์ `cmd` → เปิด **Command Prompt**
- Mac: กด ⌘ + Space → พิมพ์ `Terminal` → Enter

---

## ขั้นที่ 2 · เตรียมโดเมนใน Cloudflare (สำคัญ — ทำก่อน deploy)
1. เข้า https://dash.cloudflare.com → เลือกโดเมน **phangamtrail.com**
2. เมนูซ้าย **DNS → Records**
3. ถ้ามีรายการชื่อ `phangamtrail.com` (หรือ `@`) หรือ `www` ที่เป็นประเภท **A / AAAA / CNAME** อยู่แล้ว → **ลบออก**
   (ถ้าไม่ลบ ตอน deploy จะขึ้น error ว่าโดเมนมี DNS record อยู่แล้ว)
   ห้ามลบรายการประเภท MX / TXT (ใช้กับอีเมล)

---

## ขั้นที่ 3 · แตกไฟล์โปรเจกต์
1. ดาวน์โหลด `phangamtrail.zip` แล้วแตกไฟล์ (คลิกขวา → Extract All / ดับเบิลคลิกบน Mac)
2. จะได้โฟลเดอร์ `phangamtrail` — แนะนำวางไว้ที่ Desktop
3. ในโปรแกรมพิมพ์คำสั่ง เข้าโฟลเดอร์:
   - Windows: `cd %USERPROFILE%\Desktop\phangamtrail`
   - Mac: `cd ~/Desktop/phangamtrail`

---

## ขั้นที่ 4 · ติดตั้งเครื่องมือ
```
npm install
```
รอ 1–2 นาทีจนขึ้น `added ... packages`

> Windows ถ้าใช้ PowerShell แล้วขึ้น "running scripts is disabled" → ใช้ **Command Prompt (cmd)** แทน

---

## ขั้นที่ 5 · ล็อกอิน Cloudflare
```
npx wrangler login
```
- เบราว์เซอร์จะเปิดหน้า Cloudflare → กด **Allow**
- กลับมาที่หน้าคำสั่ง ต้องขึ้น `Successfully logged in`
- ตรวจว่าเป็นบัญชีที่ถูกต้อง: `npx wrangler whoami` (ต้องเป็นบัญชีที่มีโดเมน phangamtrail.com)

---

## ขั้นที่ 6 · Deploy
```
npx wrangler deploy
```
- ถ้าเป็นครั้งแรกในบัญชีนี้ อาจถามให้ตั้งชื่อ **workers.dev subdomain** → พิมพ์ชื่ออะไรก็ได้ เช่น `phangam` แล้ว Enter
- สำเร็จจะขึ้นประมาณ:
  ```
  Uploaded phangamtrail
  Deployed phangamtrail triggers
    phangamtrail.com (custom domain)
    www.phangamtrail.com (custom domain)
    schedule: */5 * * * *
  ```

---

## ขั้นที่ 7 · ตั้งรหัสผ่านผู้ดูแลระบบคนแรก
```
npx wrangler secret put ADMIN_PASSWORD
```
- พิมพ์รหัสผ่าน (อย่างน้อย 8 ตัว ตัวอักษรจะไม่แสดงบนจอ) → Enter
- ขึ้น `Success! Uploaded secret ADMIN_PASSWORD`
- **จดรหัสนี้ไว้** — ใช้เข้าสู่ระบบครั้งแรก

---

## ขั้นที่ 8 · ตรวจว่าเว็บขึ้นแล้ว
1. รอ 1–5 นาที (Cloudflare กำลังออกใบรับรอง HTTPS)
2. เปิด https://phangamtrail.com → ต้องเห็นหน้าแรก "ผาแง่ม"
3. เปิด https://phangamtrail.com/#admin → ชื่อผู้ใช้ `admin` + รหัสจากขั้นที่ 7

---

## ขั้นที่ 9 · ตั้งค่าครั้งแรกในหลังบ้าน (เรียงตามนี้)
1. **🔑 เปลี่ยนรหัสผ่าน** ของ admin
2. **💳 ช่องทางรับชำระเงิน** → ใส่พร้อมเพย์/บัญชีจริง → ติ๊ก "เปิดให้ลูกค้าใช้" → บันทึก
   (ก่อนทำข้อนี้ ลูกค้าจองได้แต่จ่ายเงินไม่ได้)
3. **⚙️ ตั้งค่าราคา/ระบบ** → ตรวจราคา ค่าเข้าอุทยาน 4 ประเภท จองล่วงหน้า ฤดูกาลปิด
4. **🧭 มอบหมายงานไกด์** → เพิ่มไกด์ทีละคน + ตั้งรหัสผ่านบัญชีไกด์ (ไกด์ใช้เบอร์โทรเป็นชื่อผู้ใช้)
5. **👥 จัดการผู้ใช้** → เพิ่มเจ้าหน้าที่ (บัญชี / ผู้จัดการไกด์ / ประสานงาน)
6. **🌐 จัดการเนื้อหาเว็บไซต์** → เปลี่ยนรูปตัวอย่าง ข้อความ บ้านพัก ผังผู้บริหาร
7. ทดลองจองจริง 1 รายการด้วยเบอร์ตัวเอง → แนบสลิป → ยืนยันรับเงิน → ดูว่าไกด์ได้งาน

---

## ขั้นที่ 10 · เปิดแจ้งเตือน LINE ให้ไกด์ (แนะนำ)
1. เข้า https://developers.line.biz → ล็อกอินด้วย LINE → สร้าง **Provider** → สร้าง **Messaging API channel** (จะได้ LINE OA ใหม่ หรือเลือกเชื่อม OA ที่มีอยู่)
2. แท็บ **Basic settings** → คัดลอก **Channel secret**
3. แท็บ **Messaging API** → ล่างสุด **Channel access token (long-lived)** → กด Issue → คัดลอก
4. ใส่ลงระบบ:
   ```
   npx wrangler secret put LINE_CHANNEL_SECRET
   npx wrangler secret put LINE_CHANNEL_TOKEN
   ```
5. กลับไปแท็บ **Messaging API**:
   - Webhook URL: `https://phangamtrail.com/line/webhook` → กด **Verify** (ต้องขึ้น Success)
   - เปิด **Use webhook**
6. ที่ https://manager.line.biz → OA ของคุณ → ตั้งค่า → **ปิด** "ข้อความตอบกลับอัตโนมัติ" (ไม่ให้ตอบซ้อนกับระบบ)
7. ให้ไกด์ทุกคน **เพิ่มเพื่อน OA** (สแกน QR ของ OA) แล้ว **พิมพ์เบอร์โทรของตัวเอง** ในแชท → ระบบตอบ "ผูกบัญชีสำเร็จ ✅"
8. ตรวจในหลังบ้าน → มอบหมายงานไกด์ → แก้ไขไกด์ → ต้องขึ้น "✓ ผูกแล้ว" → กด "ทดสอบแจ้งเตือน"

---

## ขั้นที่ 11 · แจ้งเตือนอีเมล (ไม่บังคับ)
1. สมัคร https://resend.com → **Domains** → เพิ่ม `phangamtrail.com` → ทำตามที่บอกให้เพิ่ม DNS records ใน Cloudflare → รอสถานะ Verified
2. **API Keys** → สร้าง key → คัดลอก
3. ```
   npx wrangler secret put RESEND_API_KEY
   ```
4. เปิดไฟล์ `wrangler.toml` → หาบรรทัด `# MAIL_FROM = ...` → ลบ `#` ข้างหน้า → บันทึก
5. `npx wrangler deploy` อีกครั้ง

---

## การอัปเดตระบบภายหลัง
แก้ไฟล์แล้วรัน `npx wrangler deploy` — ข้อมูลการจอง ไกด์ ผู้ใช้ รูปภาพ อยู่ครบ ไม่หาย

## ดูการใช้งาน / ข้อผิดพลาด
- Cloudflare Dashboard → **Workers & Pages → phangamtrail → Metrics / Logs**
- ดู log สด: `npx wrangler tail`

---

## ปัญหาที่พบบ่อย
| ข้อความ | วิธีแก้ |
|---|---|
| `Hostname ... already has externally managed DNS records` | ลบ A/AAAA/CNAME ของ phangamtrail.com และ www ใน DNS (ขั้นที่ 2) แล้ว deploy ใหม่ |
| `Could not find zone for phangamtrail.com` | โดเมนอยู่คนละบัญชีกับที่ล็อกอิน → `npx wrangler logout` แล้ว `login` ใหม่ด้วยบัญชีที่มีโดเมน |
| `R2 bucket 'phangamtrail-images' not found` | ล็อกอินผิดบัญชี (bucket สร้างไว้ในบัญชีที่มีโดเมน) หรือสร้างใหม่: `npx wrangler r2 bucket create phangamtrail-images` |
| หน้าเข้าสู่ระบบขึ้น "ระบบยังไม่มีผู้ดูแล" | ยังไม่ได้ทำขั้นที่ 7 → ทำแล้วโหลดหน้าใหม่ |
| ลืมรหัส admin | ผู้ดูแลระบบสูงสุดคนอื่นตั้งให้ใหม่ได้ที่ "จัดการผู้ใช้" — ถ้าไม่มีใครเลย ติดต่อผู้พัฒนา |
| เว็บขึ้น 522 / ใบรับรองไม่ถูกต้อง | รอ 5–10 นาทีหลัง deploy ครั้งแรก |
| `node: command not found` / `npm` ไม่รู้จัก | ติดตั้ง Node.js (ขั้นที่ 1) แล้วปิด-เปิดหน้าคำสั่งใหม่ |
| LINE Verify ไม่ผ่าน | ตรวจว่าใส่ LINE_CHANNEL_SECRET แล้ว และ URL ลงท้าย `/line/webhook` |

## ค่าใช้จ่าย
ทั้งหมดอยู่ในแผนฟรีของ Cloudflare (Workers, Durable Objects SQLite, R2) สำหรับปริมาณงานระดับชุมชน ถ้าเกินโควตาฟรี ระบบจะหยุดรับคำสั่งชั่วคราวจนถึง 07:00 น. (เวลาไทย) ไม่เก็บเงินเพิ่มเอง — ถ้าธุรกิจโตค่อยอัปเกรดแผน Workers Paid

---

## ตรวจสลิปกับธนาคาร (EasySlip) — แนะนำ
ระบบตรวจทุกสลิปเองอยู่แล้ว (ต้องเป็น QR สลิปธนาคารจริง + ไม่ซ้ำ) — EasySlip เพิ่มการตรวจกับธนาคารว่ามีรายการโอนจริง ยอดเงิน บัญชีผู้รับ และเวลาโอน
1. https://developer.easyslip.com → เข้าสู่ระบบ → คัดลอก **API Key** (Access token)
2. Cloudflare → Workers & Pages → phangamtrail → Settings → Variables and Secrets → Add
   - Type: **Secret** · Name: `EASYSLIP_API_KEY` · Value: API Key จากข้อ 1 → Deploy
3. หลังบ้าน → บัญชี → ช่องทางรับชำระเงิน → การ์ด 🛡️ ต้องขึ้น "เชื่อม EasySlip แล้ว"
4. (ถ้าต้องการยืนยันอัตโนมัติ) เลือก "ออโต้" ให้พร้อมเพย์/โอนเข้าบัญชี → บันทึก
- ผลตรวจ: ยอดน้อยกว่ายอดที่ต้องจ่าย → ปฏิเสธทันที · ไม่พบรายการที่ธนาคาร / บัญชีผู้รับไม่ใช่ของเรา / โอนก่อนเวลาจอง / เคยตรวจสลิปนี้แล้ว → รับไว้ ขึ้น ⚠ และไม่ยืนยันอัตโนมัติ
- ถ้าตั้งทั้ง EasySlip และ SlipOK ระบบใช้ EasySlip

## ตรวจสลิปอัตโนมัติ (SlipOK) — ทางเลือก (ใช้เมื่อไม่ได้ตั้ง EasySlip)
ใช้กับช่องทางที่ตั้ง "การยืนยันรับเงิน" เป็น **ออโต้** — สลิปผ่านการตรวจและยอดถูกต้อง → ระบบยืนยันการจองทันที, ไม่ผ่าน → รอเจ้าหน้าที่ตรวจ
1. สมัคร https://slipok.com → สร้างสาขา (Branch) → ตั้งบัญชีผู้รับเงินให้ตรงกับบัญชีจริง
2. Cloudflare → Workers & Pages → phangamtrail → Settings → Variables and Secrets → Add (Type: Secret)
   - `SLIPOK_API_KEY` = API key ของ SlipOK
   - `SLIPOK_BRANCH_ID` = รหัสสาขา (ตัวเลขใน URL API)
3. หลังบ้าน → ช่องทางรับชำระเงิน → เลือก "ออโต้" ให้ช่องทางพร้อมเพย์/โอนบัญชี → บันทึก

## อีเมลแจ้งลูกค้า
ระบบส่งอีเมลให้ลูกค้า 2 ครั้ง: เมื่อได้รับสลิป และเมื่อการจองเสร็จสมบูรณ์ (ยืนยันรับเงินแล้ว) — ต้องตั้งค่า Resend ตามขั้นที่ 11 ก่อน ระหว่างยังไม่ตั้งค่า ดูรายการได้ที่หลังบ้าน → การแจ้งเตือน (สถานะ "ยังไม่ได้ตั้งค่าอีเมล")
