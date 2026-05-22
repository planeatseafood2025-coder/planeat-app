# AI Manager + Multi-Agent System Design

**Date:** 2026-05-22  
**Status:** Approved

---

## Goal

สร้างระบบ AI Manager ตัวเดียวที่เป็นทั้ง superagent (คุยได้ผ่านแชท) และ dashboard (จัดการระบบ AI ทั้งหมด) พร้อม skill system และ MCP layer ที่ครอบ API ทั้งหมดของ PlaNeat เพื่อให้ AI และมนุษย์ทำงานร่วมกันในทีมเดียวกันได้จริง

---

## Architecture Overview

```
User / Human
    │
    ▼
Chat UI (Next.js)
    │
    ├── AI Manager (superagent)
    │       ├── สร้าง/จัดการ agents อื่น
    │       ├── assign skills ให้ agents
    │       ├── จัดการ permissions
    │       └── ตอบสนองผ่านแชทโดยตรง
    │
    ├── Team Chat (Group Chat)
    │       ├── Human members
    │       ├── AI agents (tagged in by @mention)
    │       └── Router: ดูว่าใครถูก mention → ส่งให้ agent นั้น
    │
    └── MCP Layer
            ├── wrap ทุก API endpoint ของ PlaNeat
            └── AI เรียก tools ผ่าน MCP เท่านั้น
```

---

## Section 1: AI Manager

### บทบาท
AI Manager = ตัวเดียวที่มีสิทธิ์สูงสุดในระบบ AI ทั้งหมด ทำได้:
- **สร้าง agent ใหม่** — กำหนดชื่อ, avatar, provider, model, personality
- **Assign skills** ให้ agent แต่ละตัว
- **กำหนด permission** ว่า agent แต่ละตัวเข้าถึง tool ไหนได้บ้าง
- **เพิ่ม agent เข้า group chat**
- **ตอบแชท** — ผู้ใช้คุยกับ AI Manager โดยตรงในแชทปกติได้เลย
- **ดู dashboard** — เห็น agent ทั้งหมด, skills, สถิติการใช้งาน

### Dashboard (IT Manager เข้าได้)
- รายการ agents ทั้งหมด + สถานะ
- สร้าง/แก้ไข/ลบ agent
- จัดการ skills ของแต่ละ agent
- กำหนด permission per agent
- ดู chat logs

### ข้อจำกัด
- AI Manager **ไม่แก้ไขโค้ดเบส** — ทุกอย่างทำผ่าน MongoDB config
- IT human ยังคงเป็นผู้ควบคุมสูงสุด (สร้าง AI Manager ได้จาก dashboard)

---

## Section 2: Team Chat Model

### หลักการ
AI agents เป็นสมาชิกในทีมเหมือนมนุษย์ — ไม่ใช่ระบบ automation ที่รันอยู่เบื้องหลัง

### Group Chat
- ทุกคน (มนุษย์ + AI) อยู่ใน chat เดียวกัน
- `@AgentName` เพื่อ mention agent ตัวใดตัวหนึ่ง
- ถ้าไม่ได้ mention ใคร → AI Manager ตอบ (เป็น default)
- AI ตอบใน chat thread เดียวกัน มองเห็นบทสนทนาทั้งหมดก่อนหน้า

### Routing Rules
```
message มี @mention?
  └─ yes → ส่งให้ agent ที่ถูก mention
  └─ no  → AI Manager ตอบ

agent ถูก mention แต่ไม่มีสิทธิ์ทำสิ่งนั้น?
  └─ บอก user ว่าทำไม่ได้ + แนะนำว่าควรถามใคร
```

### Human-AI Handoff
- AI ทำงานแล้ว escalate ให้มนุษย์ได้ (mention @ชื่อคน)
- มนุษย์ก็ assign งานให้ AI ได้ (@AgentName ช่วยทำ X)
- ประวัติ chat ทั้งหมดเห็นได้ทั้งสองฝ่าย

---

## Section 3: Skill System

### นิยาม
Skill = unit ที่เพิ่ม capability ให้ agent ประกอบด้วย:
1. **System prompt snippet** — เพิ่มความสามารถเฉพาะทาง (เช่น "เชี่ยวชาญด้านการวิเคราะห์ต้นทุน")
2. **Tool list** — tools ที่ skill นี้อนุญาตให้ใช้ได้

### Storage (Phase 1 — MongoDB)
```json
{
  "skill_id": "crm_sales_expert",
  "name": "CRM Sales Expert",
  "description": "วิเคราะห์ deals, accounts, contacts",
  "prompt_snippet": "คุณเชี่ยวชาญด้านการวิเคราะห์ข้อมูล CRM...",
  "allowed_tools": ["getDeals", "getAccounts", "getContacts"],
  "created_by": "admin",
  "created_at": "..."
}
```

### การทำงาน
เมื่อ agent ถูก assign skill:
- system prompt = base personality + skill prompt snippets ทุกตัวที่ assign
- allowed tools = union ของ tools จากทุก skill ที่ assign

### Phase 1 Scope
- Skills เก็บใน MongoDB (ไม่ใช่ไฟล์)
- IT/Admin สร้าง/แก้ไข skill ผ่าน AI Manager dashboard
- ไม่รองรับ hot-reload หรือ plugin marketplace ในรอบนี้

---

## Section 4: MCP Layer

### ทำไมต้อง MCP
- ปัจจุบัน agent tools มีแค่ 10 tools (CRM เท่านั้น)
- PlaNeat มี 70+ API endpoints: expenses, inventory, customers, budget, reports, users, LINE, etc.
- MCP = thin wrapper ที่ทำให้ AI เรียก API เหล่านี้ได้ผ่าน tool call

### Architecture
```
AI Agent (tool call)
    │
    ▼
MCP Router (backend/app/mcp/)
    │  รู้จัก tool name → map ไป endpoint
    ▼
Existing FastAPI Router (/api/expenses, /api/inventory, ...)
    │
    ▼
MongoDB
```

### MCP Tool Definition Format
```python
{
  "name": "createExpense",
  "description": "สร้างรายการค่าใช้จ่ายใหม่",
  "input_schema": {
    "type": "object",
    "properties": {
      "amount": {"type": "number"},
      "category": {"type": "string"},
      "description": {"type": "string"}
    },
    "required": ["amount", "category"]
  }
}
```

### Phase 1 Scope: 20 Priority Tools
ครอบ API groups ที่ใช้บ่อยที่สุด:

| Group | Tools |
|---|---|
| CRM | getDeals, getAccounts, getContacts (มีแล้ว) |
| Expenses | getExpenses, createExpense, approveExpense |
| Inventory | getInventory, updateInventoryItem |
| Customers | getCustomers, getCustomerById |
| Reports | getSalesReport, getExpenseReport |
| Users | getUsers, getUserById |
| Reminders | getReminders, createReminder, completeReminder |
| Budget | getBudgets, getBudgetSummary |

---

## Section 5: Data Model Changes

### Collections ใหม่

**`ai_agents`** (มีแล้ว แต่เพิ่ม fields)
```json
{
  "id": "agent_sales_1",
  "name": "Sales AI",
  "avatar": "💼",
  "provider": "openrouter",
  "model": "openai/gpt-4o-mini",
  "skill_ids": ["crm_sales_expert"],
  "role_permissions": {...},
  "created_by": "admin",
  "is_manager": false
}
```

**`ai_skills`** (ใหม่)
```json
{
  "skill_id": "crm_sales_expert",
  "name": "CRM Sales Expert",
  "prompt_snippet": "...",
  "allowed_tools": ["getDeals"],
  "created_by": "admin"
}
```

**`chat_rooms`** (ใหม่)
```json
{
  "room_id": "room_123",
  "name": "Sales Team Chat",
  "members": [
    {"type": "human", "username": "john"},
    {"type": "ai", "agent_id": "agent_sales_1"}
  ],
  "created_by": "admin"
}
```

**`chat_messages`** (ใหม่)
```json
{
  "room_id": "room_123",
  "sender_type": "human|ai",
  "sender_id": "john|agent_sales_1",
  "content": "...",
  "mentions": ["agent_sales_1"],
  "created_at": "..."
}
```

---

## Section 6: Implementation Phases

### Phase 1 — AI Manager Core (สำคัญที่สุด)
1. AI Manager agent สร้างจาก config (is_manager=true)
2. AI Manager มีสิทธิ์เรียก admin tools: createAgent, listAgents, updateAgentSkills
3. Dashboard IT สำหรับจัดการ agents + skills
4. Skill system (CRUD) เก็บใน MongoDB

### Phase 2 — MCP Layer
1. MCP router ใน backend
2. Tools 20 อันแรก (expense, inventory, customers, etc.)
3. Permission gate: agent เรียก tool ได้เฉพาะที่ skill อนุญาต

### Phase 3 — Group Chat
1. chat_rooms collection + API
2. Frontend group chat UI
3. @mention routing ไปยัง agent ที่ถูก mention
4. Human + AI ใน chat เดียวกัน

---

## ข้อจำกัดที่ยอมรับได้ (Out of Scope)

- ❌ AI แก้ไขโค้ดเบสเอง
- ❌ Plugin marketplace / ClawHub
- ❌ Multi-modal (ภาพ/ไฟล์ ใน group chat)
- ❌ AI-to-AI private messaging
- ❌ Real-time streaming ใน group chat (Phase 1 ใช้ polling)
