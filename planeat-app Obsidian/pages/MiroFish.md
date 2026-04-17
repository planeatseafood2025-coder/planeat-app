# MiroFish

> Swarm Intelligence Engine — จำลองโลกดิจิทัลเพื่อทำนายอนาคต

- **Source**: [GitHub](https://github.com/666ghj/MiroFish)
- **สนับสนุนโดย**: Shanda Group
- **Engine หลัก**: [OASIS](https://github.com/camel-ai/oasis) โดย CAMEL-AI

---

## แนวคิดหลัก

MiroFish รับ "seed" จากโลกจริง (ข่าว, นโยบาย, สัญญาณการเงิน) แล้วสร้าง **parallel digital world** ที่มี agent หลายพันตัว — แต่ละตัวมีบุคลิก, ความทรงจำระยะยาว, และ logic พฤติกรรมเป็นของตัวเอง agent เหล่านี้ interact กันอย่างอิสระ จนเกิด social evolution ขึ้นเอง

ผู้ใช้มองจาก "God's-eye view" และ inject ตัวแปรได้แบบ real-time เพื่อดูว่าอนาคตจะเป็นอย่างไร

---

## Workflow

1. **Graph Building** — ดึง seed, inject ความทรงจำเข้า agent, สร้าง GraphRAG
2. **Environment Setup** — extract entity relationships, generate personas, inject config
3. **Simulation** — dual-platform parallel simulation, parse prediction requirements, update temporal memory
4. **Report Generation** — ReportAgent สรุปผลพร้อม toolset ให้ interact กับโลกที่จำลองไว้
5. **Deep Interaction** — คุยกับ agent ตัวใดก็ได้ในโลก simulation หรือคุยกับ ReportAgent

---

## Use Cases

| ระดับ | ตัวอย่าง |
|---|---|
| Macro | ทดสอบนโยบาย, PR crisis simulation แบบ zero-risk |
| Micro | ทำนายตอนจบนิยาย, สำรวจ "what if" scenarios |
| การเงิน | Financial prediction (กำลังพัฒนา) |
| การเมือง | Political news prediction (กำลังพัฒนา) |

ตัวอย่างที่ทำแล้ว: จำลอง public opinion มหาวิทยาลัยอู่ฮั่น, ทำนายตอนจบ Dream of the Red Chamber

---

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Node.js 18+, port 3000 |
| Backend | Python 3.11–3.12, uv, port 5001 |
| LLM | รองรับ OpenAI-compatible API (แนะนำ Qwen-plus ผ่าน Alibaba Bailian) |
| Memory | Zep Cloud (long-term agent memory) |
| Deploy | Docker Compose |

---

## ข้อสังเกต

- ใช้ LLM token เยอะมาก — แนะนำเริ่มจาก simulation < 40 รอบ
- Zep Cloud มี free quota รายเดือน เพียงพอสำหรับ simple usage
- กำลังเปิดรับ full-time/internship สาย multi-agent + LLM

---

## หน้าที่เกี่ยวข้อง

- [[MiroFish — อธิบายสำหรับคนทั่วไป]]
