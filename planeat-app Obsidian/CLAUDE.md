# Wiki Schema — planeat-app Obsidian

## CRITICAL: อ่านก่อนทำอะไรทุกครั้ง

**ขั้นตอนแรกเสมอ**: อ่าน `hotcache.md` ก่อน — มี context ล่าสุดของ wiki นี้ครบ ไม่ต้อง browse ไฟล์อื่นก่อน ถ้าคำตอบอยู่ใน hotcache ให้ตอบได้เลย

---

## โครงสร้าง

```
planeat-app Obsidian/
├── raw/          ← source ของผู้ใช้ — ห้ามแก้ไขเด็ดขาด
├── pages/        ← LLM เขียนและดูแลทั้งหมด
├── hotcache.md   ← อ่านก่อนทุกครั้ง
├── index.md      ← สารบัญ
├── log.md        ← history ของ operations
└── CLAUDE.md     ← ไฟล์นี้
```

---

## Workflows

### 1. เมื่อเริ่ม session ใหม่
1. อ่าน `hotcache.md`
2. ถ้าต้องการข้อมูลเพิ่ม ค่อยอ่าน `index.md` แล้ว drill ลงไปที่หน้าที่เกี่ยวข้อง

### 2. Ingest source ใหม่
1. อ่าน source ใน `raw/`
2. สร้าง/อัปเดตหน้าใน `pages/` (technical + อธิบายสำหรับคนทั่วไป ถ้าเหมาะสม)
3. อัปเดต `index.md`
4. append entry ใน `log.md`
5. อัปเดต `hotcache.md`

### 3. ตอบคำถาม (Query)
1. อ่าน `hotcache.md`
2. ถ้าคำตอบไม่ครบ → อ่าน `index.md` → drill ไปหน้าที่เกี่ยวข้อง
3. ตอบคำถาม
4. ถ้าคำตอบมีคุณค่า → บันทึกเป็นหน้าใหม่ใน `pages/` และอัปเดต hotcache

### 4. อัปเดต Hotcache
อัปเดต `hotcache.md` หลัง ingest ทุกครั้ง และเมื่อ preferences หรือโครงสร้างเปลี่ยน
เก็บไว้ไม่เกิน 500 คำ — ตัดส่วนที่ล้าสมัยออก

---

## สไตล์การเขียน pages

- **ภาษา**: ไทยเป็นหลัก
- **สไตล์**: conversational, เริ่มด้วยคำถาม hook, มีหัวข้อย่อยชัดเจน, จบด้วย one-liner สรุป
- **คนทั่วไป**: ใช้ analogy แทนศัพท์ tech เสมอ
- **Technical pages**: แยกเป็นอีกไฟล์ต่างหาก ไม่ปนกัน

---

## กฎสำคัญ

- ห้ามแก้ไขไฟล์ใน `raw/` เด็ดขาด
- cross-reference ระหว่างหน้าด้วย `[[page name]]` หรือ `[text](path)`
- ถ้า source ใหม่ขัดแย้งกับ page เก่า ให้ flag ไว้ในหน้านั้นทันที

---

## กฎ VPS — จำไว้เสมอ

### 1. ตรวจ Memory ทุกครั้งที่ SSH เข้า VPS
```bash
free -h && docker stats --no-stream
```
ถ้า memory สูงผิดปกติ → สงสัย image เก่าค้างอยู่ → rebuild เป็นเวอร์ชันล่าสุด (DB ปลอดภัยเสมอ)

### 2. Deploy ขึ้น 3002/8002 เสมอ
- **3002/8002** = dev/test — อัพขึ้นที่นี่เสมอ
- **3001/8001** = production — เจ้าของจัดการเองเท่านั้น ห้ามแตะ

### 3. Git = Backup เท่านั้น
- ห้าม push ขึ้น git เว้นแต่เจ้าของสั่ง
- workflow: เครื่องหลัก → อัพ VPS โดยตรง (ไม่ผ่าน git)
