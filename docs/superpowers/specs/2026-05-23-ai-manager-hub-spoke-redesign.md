# AI Manager Hub & Spoke — Full Redesign Spec

**Goal:** ลบหน้า AI เดิมทั้งหมดแล้วสร้างใหม่เป็น Hub & Spoke dashboard ที่เห็นภาพทั้งหมดในหน้าเดียว

**เข้าถึงได้:** IT Manager + Admin เท่านั้น

---

## สิ่งที่จะถูกลบออก

| หน้า | action |
|---|---|
| `frontend/app/(app)/ai-manager/page.tsx` | ลบ — สร้างใหม่ทั้งหมด |
| `frontend/app/(app)/ai-manager/skills/page.tsx` | ลบ — ย้าย skills เข้า settings panel |
| `frontend/app/(app)/chat/agent-settings/page.tsx` | ลบ — ย้ายเข้า settings panel |

---

## Setup: เพิ่ม Tailwind CSS

ติดตั้ง Tailwind เข้า Next.js 14 project:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

`tailwind.config.js`:
```js
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'ai-primary': '#004ac6',
        'ai-primary-dark': '#003ea8',
        'ai-surface': '#f7f9fb',
        'ai-surface-bright': '#ffffff',
        'ai-border': '#e2e8f0',
        'ai-active': '#10b981',
        'ai-idle': '#94a3b8',
        'ai-text': '#191c1e',
        'ai-text-muted': '#64748b',
        'ai-error': '#ba1a1a',
        'ai-primary-container': '#dbe1ff',
      },
      borderRadius: {
        'card': '14px',
      }
    }
  },
  plugins: [],
}
```

เพิ่มใน `app/globals.css` (ต่อท้าย):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Layout หน้า `/ai-manager`

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (h-16, bg-white, border-bottom)                      │
│  🧠 AI Manager Dashboard   [chat input................] [ส่ง] [+ สร้าง Agent] │
├────────────────────────┬────────────────────────────────────┤
│  LEFT PANEL (w-[40%])  │  RIGHT PANEL (w-[60%])             │
│  bg-ai-surface         │  bg-white                           │
│                        │                                     │
│  🧠 AI Manager         │  (เมื่อยังไม่กด agent)             │
│  [MANAGER badge]       │  "เลือก agent เพื่อตั้งค่า"        │
│       │                │                                     │
│  ├── 🤖 Sales AI ●    │  (เมื่อกด agent)                   │
│  ├── 📊 Report AI ○   │  [settings form]                    │
│  └── 📧 Email AI ○    │                                     │
│                        │                                     │
│  [+ เพิ่ม Agent]       │                                     │
├────────────────────────┴────────────────────────────────────┤
│  ACTIVITY FEED (h-12, fixed bottom, bg-white, border-top)   │
│  ● Live  🤖 Sales AI [14:32] ดึง deals...  📧 Email AI...  │
└─────────────────────────────────────────────────────────────┘
```

---

## ส่วนที่ 1: Header

```tsx
// สิ่งที่มีใน header:
// 1. icon memory + "AI Manager Dashboard" (สี #004ac6)
// 2. chat input กว้าง — placeholder "สั่ง AI Manager: 'สร้าง AI สำหรับทีมขาย...'"
//    - onSubmit: เรียก POST /api/chat (agentId = 'ai_manager') แล้ว reload agents
// 3. ปุ่ม "+ สร้าง Agent" — เปิด modal ฟอร์ม
```

---

## ส่วนที่ 2: Left Panel — Org Chart

### AI Manager Node (root)
```tsx
// card กลาง: icon + "AI Manager" + badge "MANAGER"
// border: 1px solid #e2e8f0, shadow: 0 4px 12px rgba(0,74,198,0.1)
// ต่อเส้นลงมาถึง agent nodes
```

### Agent Node (ลูกน้อง)
```tsx
// card แต่ละตัวมี:
// - emoji/icon + ชื่อ agent
// - status dot: ● สีเขียว (#10b981) = active, ○ สีเทา (#94a3b8) = idle
// - เมื่อ selected: border 2px solid #004ac6
// - คลิกแล้ว setSelectedAgent(agent)
// - opacity-70 เมื่อ idle
```

### ปุ่ม "+ เพิ่ม Agent"
```tsx
// dashed border, เมื่อคลิก setShowCreateModal(true)
```

---

## ส่วนที่ 3: Right Panel — Settings Panel

### เมื่อยังไม่เลือก agent
```tsx
// แสดงข้อความ "เลือก agent ทางซ้ายเพื่อตั้งค่า"
```

### เมื่อเลือก agent แล้ว (3 groups)

**Group 1: Identity & Base**
- Name (input)
- Avatar Icon (input emoji)
- Personality (select: Friendly/Formal/Concise) + ตัวอย่างประโยค

**Group 2: Model Configuration**
- Provider (select: OpenRouter/Anthropic/OpenAI/Google) + คำอธิบาย
- Model (input หรือ dropdown สำหรับ OpenRouter)
- API Key (password input) + ลิงก์รับ key

**Group 3: Capabilities**
- Skills: แสดง chip ✓ สำหรับ skill ที่มี + ปุ่ม "+ เพิ่ม" เปิด dropdown เลือก skill จาก `ai_skills`
- Tools: chip toggle เปิด/ปิด แต่ละ tool

**Footer:**
- ปุ่ม "บันทึกการตั้งค่า" — เรียก `PUT /api/agent/config/{id}` ด้วย full config
- ปุ่ม "ลบ" (icon trash, สีแดง) — แสดงเฉพาะ agent ที่ไม่ใช่ manager

---

## ส่วนที่ 4: Create Agent Modal

ฟอร์มสร้าง agent ใหม่:
- ID (input, unique)
- ชื่อ (input)
- Avatar (input emoji, default 🤖)
- Provider + Model + API Key
- Personality

Submit: POST `/api/agent/create` → reload agent list → auto-select agent ใหม่

---

## ส่วนที่ 5: Activity Feed

```tsx
// fixed bottom, h-12, bg-white, border-top
// แสดง log เลื่อนแบบ marquee (CSS animation)
// ข้อมูลจาก: GET /api/agent/activity (polling ทุก 10 วินาที)
// แต่ละ item: [emoji agent] [HH:MM:SS] [ข้อความ]
// ถ้ายังไม่มี activity endpoint: ใช้ mock data ก่อน
```

---

## Backend: เพิ่ม Activity Endpoint

**Collection ใหม่:** `agent_activity`
```python
# document structure:
{
  "agent_id": "sales_agent_1",
  "agent_name": "Sales AI",
  "agent_avatar": "🤖",
  "message": "ดึงข้อมูล deals จาก CRM",
  "timestamp": datetime,
}
```

**Endpoint:** `GET /api/agent/activity?limit=20`
- return 20 รายการล่าสุด sort by timestamp desc
- IT roles only

**บันทึก activity:** เพิ่มใน `agent_service.py` ตอน tool execution สำเร็จ

---

## สีพิเศษหน้า AI Manager

หน้านี้ใช้สีต่างจากหน้าอื่น:
- Primary: `#004ac6` (ไม่ใช่ `#2563eb` ของหน้าอื่น)
- Background: `#f7f9fb`
- Card: `#ffffff` border `#e2e8f0` radius `14px`

---

## Files

**ลบ:**
- `frontend/app/(app)/ai-manager/page.tsx`
- `frontend/app/(app)/ai-manager/skills/page.tsx`  
- `frontend/app/(app)/chat/agent-settings/page.tsx`

**สร้าง/แก้ไข:**
- `frontend/app/(app)/ai-manager/page.tsx` — สร้างใหม่ทั้งหมด
- `frontend/tailwind.config.js` — สร้างใหม่
- `frontend/postcss.config.js` — สร้างใหม่ (ถ้ายังไม่มี)
- `frontend/app/globals.css` — เพิ่ม Tailwind directives
- `backend/app/routers/agent.py` — เพิ่ม GET /api/agent/activity
- `backend/app/services/agent_service.py` — เพิ่ม log_activity()

---

## Tech Stack

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind CSS (ใหม่)
- **Backend:** FastAPI + Motor + MongoDB (เดิม)
- **ไม่มี** WebSocket — ใช้ polling 10s
