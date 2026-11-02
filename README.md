# ระบบจองเดินป่าผาแง่ม — phangamtrail.com

Cloudflare Worker ตัวเดียว: หน้าเว็บ + API + หลังบ้าน
- **ข้อมูล:** Durable Object (SQLite) — ทุกคำสั่งประมวลผลทีละคำสั่ง คิวไกด์จึงไม่ชนกัน
- **รูปภาพ/สลิป:** R2 bucket `phangamtrail-images` (สร้างในบัญชีแล้ว)
- **แจ้งเตือน:** LINE Messaging API (LINE OA) + อีเมลผ่าน Resend
- **งานอัตโนมัติ (ทุก 5 นาที):** ยกเลิกการจองที่ไม่ชำระใน 30 นาที · เตือนไกด์ 18:00 คืนก่อนเดินป่า

## ติดตั้งครั้งแรก (ทำครั้งเดียว ~10 นาที)

ต้องมี Node.js 18+ บนเครื่อง และโดเมน `phangamtrail.com` อยู่ในบัญชี Cloudflare เดียวกัน

```bash
cd phangamtrail
npm install
npx wrangler login                      # เปิดเบราว์เซอร์ให้ล็อกอิน Cloudflare
npx wrangler secret put ADMIN_PASSWORD  # ตั้งรหัสผ่านผู้ดูแลระบบคนแรก (อย่างน้อย 8 ตัว)
npx wrangler deploy
```

เสร็จแล้วเปิด https://phangamtrail.com/#admin → เข้าสู่ระบบด้วย `admin` + รหัสที่ตั้งไว้
(Cloudflare ผูกโดเมนและออกใบรับรอง HTTPS ให้อัตโนมัติ อาจใช้เวลาไม่กี่นาที)

## หลังเข้าสู่ระบบครั้งแรก
1. **ช่องทางรับชำระเงิน** — ใส่พร้อมเพย์/บัญชีธนาคาร/PayPal/Alipay/TrueMoney ที่ใช้จริง แล้วเปิดใช้ (ตอนเริ่มทุกช่องทางปิดอยู่ ลูกค้าจะยังจ่ายเงินไม่ได้)
2. **ตั้งค่าราคา/ระบบ** — ตรวจราคา ค่าเข้าอุทยาน 4 ประเภท ช่วงปิดฤดูกาล
3. **มอบหมายงานไกด์** — เพิ่มไกด์ + สร้างบัญชีเข้าระบบให้ไกด์
4. **จัดการผู้ใช้** — เพิ่มเจ้าหน้าที่ (บัญชี / ผู้จัดการไกด์ / ประสานงาน)
5. **จัดการเนื้อหาเว็บไซต์** — เปลี่ยนรูปตัวอย่างและข้อความเป็นของจริง
6. กด **เปลี่ยนรหัสผ่าน** ของ admin

## เปิดแจ้งเตือน LINE (แนะนำ)
1. สร้าง LINE Official Account + เปิด Messaging API ที่ https://developers.line.biz
2. ตั้งค่าใน Cloudflare:
   ```bash
   npx wrangler secret put LINE_CHANNEL_TOKEN    # Channel access token (long-lived)
   npx wrangler secret put LINE_CHANNEL_SECRET   # Channel secret
   ```
3. ใน LINE Developers → Messaging API → Webhook URL: `https://phangamtrail.com/line/webhook` → เปิด Use webhook
4. ไกด์แต่ละคนเพิ่มเพื่อน OA แล้ว **พิมพ์เบอร์โทรที่ลงทะเบียนไว้** → ระบบผูกบัญชีให้อัตโนมัติ (เห็นสถานะ “✓ ผูกแล้ว” ในหน้าแก้ไขไกด์)

## เปิดแจ้งเตือนอีเมล (ไม่บังคับ)
สมัคร https://resend.com และยืนยันโดเมน phangamtrail.com แล้ว
```bash
npx wrangler secret put RESEND_API_KEY
```
และแก้ `MAIL_FROM` ใน `wrangler.toml` (เช่น `ผาแง่ม <no-reply@phangamtrail.com>`) แล้ว `npx wrangler deploy`

## อัปเดตระบบภายหลัง
แก้ไฟล์แล้วรัน `npx wrangler deploy` — ข้อมูลเดิมอยู่ครบ

## ทดสอบบนเครื่องตัวเอง
```bash
echo "ADMIN_PASSWORD=TestAdmin2026" > .dev.vars
npx wrangler dev --test-scheduled       # เปิด http://localhost:8787
```

## สิ่งที่ยังไม่ได้เชื่อม
- **ยืนยันรับเงินแบบออโต้** ต้องเชื่อมบริการตรวจสลิป (เช่น SlipOK / EasySlip) หรือผู้ให้บริการรับชำระ (Omise / 2C2P / GB Prime Pay / PayPal Checkout) — ระหว่างนี้ทุกช่องทางรอเจ้าหน้าที่กด “ยืนยันรับเงิน”
- **สำรองข้อมูล:** Durable Object เก็บข้อมูลถาวรและกู้คืนย้อนหลังได้ 30 วันผ่าน Cloudflare (Point-in-time recovery)

## โครงสร้างไฟล์
```
wrangler.toml      ตั้งค่า Worker, โดเมน, R2, Durable Object, cron
src/worker.js      เส้นทาง: หน้าเว็บ, /api, /img (R2), /line/webhook, cron
src/engine.js      Durable Object: เก็บข้อมูล SQLite, ล็อกอิน (PBKDF2), เซสชัน, ส่ง LINE/อีเมล
src/core.js        กฎธุรกิจทั้งหมด: การจอง, ความจุ, คิวไกด์, ไม่ว่าง, ชำระเงิน, บัญชี, สิทธิ์
public/index.html  หน้าเว็บลูกค้า + หลังบ้าน
```
