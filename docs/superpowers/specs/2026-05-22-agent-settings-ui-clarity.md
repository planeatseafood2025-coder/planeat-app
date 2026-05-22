# Agent Settings UI Clarity — Design Spec

**Goal:** ทำให้หน้า agent-settings เข้าใจง่ายขึ้นโดยเพิ่มคำอธิบายและลิงก์ตรงจุด โดยไม่เปลี่ยน layout ใหญ่

**Architecture:** แก้ไขไฟล์เดียว `frontend/app/(app)/chat/agent-settings/page.tsx` — เพิ่ม helper text, badge, link, tooltip ใน JSX ไม่มี backend changes

**Tech Stack:** Next.js 14, React, inline styles (ตามแบบเดิม)

---

## Section 1: LLM Provider (ย้ายขึ้นมาเป็น section แรก)

- เพิ่ม badge "🚀 เริ่มตั้งค่าที่นี่ก่อน" สีเขียวติดหัว section
- ใต้ dropdown Provider เพิ่มคำอธิบาย 1 บรรทัดต่อ provider:
  - OpenRouter: "แนะนำ — รองรับหลาย model รวมถึง model ฟรี"
  - Anthropic: "Claude — ฉลาดที่สุด เหมาะกับงานซับซ้อน"
  - OpenAI: "GPT — ยอดนิยม เสถียร"
  - Google: "Gemini — context ยาว ราคาถูก"
- ใต้ช่อง API Key เพิ่มลิงก์ "รับ API Key ได้ที่นี่ →" ที่เปลี่ยนตาม provider:
  - OpenRouter → `https://openrouter.ai/keys`
  - Anthropic → `https://console.anthropic.com/keys`
  - OpenAI → `https://platform.openai.com/api-keys`
  - Google → `https://aistudio.google.com/app/apikey`

## Section 2: ข้อมูลพื้นฐาน (ย้ายลงมาเป็น section ที่ 2)

- ใต้ dropdown บุคลิก เพิ่มตัวอย่างประโยคที่ agent จะพูด:
  - Friendly: `"สวัสดีครับ! มีอะไรให้ช่วยไหมครับ? 😊"`
  - Formal: `"สวัสดีครับ ผมพร้อมให้บริการครับ"`
  - Concise: `"สวัสดี มีอะไรให้ช่วย?"`

## Section 3: Tools

- แต่ละ tool button เพิ่ม tooltip (title attribute) อธิบายว่าทำอะไร:
  - `getDeals` → "ดึงรายการ deals/โอกาสการขาย"
  - `getAccounts` → "ดึงรายชื่อบริษัท/ลูกค้า"
  - `getContacts` → "ดึงรายชื่อบุคคลติดต่อ"
  - `getActivities` → "ดูประวัติกิจกรรมและการติดต่อ"
  - `getReminders` → "ดูรายการ reminders"
  - `createReminder` → "สร้าง reminder ใหม่"
  - `logActivity` → "บันทึกกิจกรรม เช่น โทรหาลูกค้า"
  - `createContact` → "สร้างรายชื่อติดต่อใหม่"
  - `sendPreviewEmail` → "ดูตัวอย่างอีเมลก่อนส่ง"
  - `sendEmail` → "ส่งอีเมลจริง (ระวัง)"
- เพิ่ม note เล็กๆ ใต้ tools ว่า "hover บน tool เพื่อดูคำอธิบาย"

## ลำดับ Section ใหม่

```
1. 🚀 LLM Provider  ← เริ่มที่นี่
2. ข้อมูลพื้นฐาน
3. Tools
4. [บันทึกการตั้งค่า]
```

---

## Constraints

- ไม่เปลี่ยน layout ใหญ่ — ยังเป็น single page scroll
- ไม่เพิ่ม state ใหม่
- ใช้ inline style ตามแบบเดิมของโปรเจกต์
