# AI Manager Redesign — Hub & Spoke Design Spec

**Goal:** Redesign หน้า AI Manager ให้เป็น Hub & Spoke ที่เห็นภาพทั้งหมดในหน้าเดียว ง่ายต่อการใช้งาน

**เข้าถึงได้:** IT Manager + Admin เท่านั้น

---

## ภาพรวม Layout

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER                                                      │
│  🧠 AI Manager Dashboard              [+ สร้าง Agent]       │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 💬 สั่ง AI Manager: "สร้าง AI สำหรับทีมขาย..."  [ส่ง]│   │
│  └───────────────────────────────────────────────────────┘   │
├────────────────────────┬────────────────────────────────────┤
│  LEFT — ORG CHART      │  RIGHT — SETTINGS PANEL            │
│  (40% width)           │  (60% width)                        │
│                        │                                     │
│  🧠 AI Manager         │  [กดที่ agent เพื่อตั้งค่า]        │
│  (ศูนย์กลาง)           │                                     │
│     │                  │                                     │
│     ├── 🤖 Sales AI    │                                     │
│     │   ● ทำงานอยู่    │                                     │
│     │                  │                                     │
│     ├── 📊 Report AI   │                                     │
│     │   ○ ว่าง         │                                     │
│     │                  │                                     │
│     └── 📧 Email AI    │                                     │
│         ○ ว่าง         │                                     │
│                        │                                     │
│  [+ เพิ่ม Agent]       │                                     │
├────────────────────────┴────────────────────────────────────┤
│  BOTTOM — LIVE ACTIVITY FEED                                 │
│  🤖 Sales AI   14:32  กำลังดึง deals จาก CRM...            │
│  🧠 AI Manager 14:30  สร้าง Email AI เรียบร้อยแล้ว         │
│  📧 Email AI   14:28  ส่งอีเมล follow-up 3 ฉบับ            │
└─────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 1: Header

- ชื่อหน้า "🧠 AI Manager Dashboard"
- ปุ่ม "+ สร้าง Agent" (เปิด modal ฟอร์ม)
- ช่อง chat สั่ง AI Manager โดยตรง เช่น "สร้าง AI สำหรับทีมขาย" หรือ "ลบ Email AI"

---

## ส่วนที่ 2: Org Chart (ซ้าย)

- แสดง AI Manager เป็น node บนสุด
- แต่ละ agent ลูกน้องแสดงเป็น card ขนาดเล็ก มี:
  - emoji + ชื่อ
  - สถานะ: `● ทำงานอยู่` (สีเขียว) หรือ `○ ว่าง` (สีเทา)
  - คลิกแล้วเปิด Settings Panel ทางขวา
- MANAGER badge บน AI Manager node
- ปุ่ม "+ เพิ่ม Agent" ด้านล่าง org chart

---

## ส่วนที่ 3: Settings Panel (ขวา)

เปิดเมื่อกด agent ใดๆ แสดงข้อมูล:

```
┌──────────────────────────────────────┐
│  🤖 Sales AI                [ลบ]    │
│  ID: sales_agent_1                   │
├──────────────────────────────────────┤
│  Provider  [OpenRouter ▼]            │
│  💡 แนะนำ — รองรับหลาย model        │
│                                      │
│  Model     [openai/gpt-4o-mini ▼]   │
│                                      │
│  API Key   [••••••••]               │
│            รับ key ได้ที่นี่ →      │
├──────────────────────────────────────┤
│  บุคลิก   [😊 Friendly ▼]           │
│  ตัวอย่าง: "สวัสดีครับ! 😊"        │
│                                      │
│  ชื่อ     [Sales AI         ]       │
│  Avatar   [🤖              ]        │
├──────────────────────────────────────┤
│  Skills                              │
│  [✓ sales] [✓ crm] [ report]        │
├──────────────────────────────────────┤
│  Tools                               │
│  [✓ getDeals] [✓ getContacts] ...   │
├──────────────────────────────────────┤
│  [บันทึกการตั้งค่า]                 │
└──────────────────────────────────────┘
```

---

## ส่วนที่ 4: Live Activity Feed (ล่าง)

- แสดง 10 รายการล่าสุดจากทุก agent
- แต่ละรายการ: `[emoji ชื่อ agent]  [เวลา]  [สิ่งที่ทำ]`
- สีต่างกันตาม agent
- Auto-refresh ทุก 10 วินาที (polling)

---

## สิ่งที่จะถูกลบออก

| หน้า | สถานะ |
|---|---|
| `/ai-manager` | Redesign ใหม่ทั้งหมด |
| `/ai-manager/skills` | ย้าย skills เข้า Settings Panel |
| `/chat/agent-settings` | ลบออก — ตั้งค่าใน Panel แทน |

---

## สิ่งที่ยังคงอยู่ (Backend)

- MongoDB collection `ai_agents` — ไม่เปลี่ยน
- MongoDB collection `ai_skills` — ไม่เปลี่ยน  
- API endpoints ทั้งหมด — ไม่เปลี่ยน
- แค่เปลี่ยน Frontend UI อย่างเดียว

---

## Activity Feed — ข้อมูลจากไหน?

ระยะแรก: ใช้ **polling** เรียก endpoint ใหม่ `GET /api/agent/activity` ที่ return log การทำงานล่าสุด
Backend เพิ่ม collection `agent_activity` บันทึกทุกครั้งที่ agent เรียก tool

---

## สรุป Tech Stack

- **Frontend:** Next.js 14, React, inline styles (แบบเดิม)
- **Backend:** เพิ่ม endpoint `GET /api/agent/activity` + collection `agent_activity`
- **ไม่มี** WebSocket — ใช้ polling ก่อน

---

## คำถามที่ยังต้องตอบ (ก่อน implement)

1. Activity feed — อยากเห็น "กำลังทำอะไรอยู่จริงๆ แบบ real-time" หรือ "ประวัติว่าทำอะไรไปแล้ว" ครับ?
