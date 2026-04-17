# Planeat Wiki — Schema & Instructions for LLM

## Purpose
This is a persistent knowledge wiki for the **planeat-app** project. The LLM owns this wiki — creates pages, updates them, maintains cross-references. The human curates sources and asks questions. The wiki accumulates knowledge across conversations so nothing is re-derived from scratch every time.

---

## Directory Structure

```
docs/
├── WIKI.md          ← this file — instructions for the LLM
├── index.md         ← catalog of ALL pages (update on every change)
├── log.md           ← append-only chronological log
├── raw/             ← immutable source documents (never modify)
│   └── assets/      ← images downloaded locally
└── pages/
    ├── overview.md  ← project overview (always keep current)
    ├── entities/    ← specific things: pages, APIs, collections, services
    ├── concepts/    ← patterns, architecture decisions, how things work
    └── analyses/    ← query results & explorations worth keeping
```

---

## Page Format

Every page in `pages/` should start with YAML frontmatter:

```yaml
---
title: <ชื่อหน้า>
type: entity | concept | analysis | overview
tags: [auth, line, crm, expense, infra, ...]
updated: YYYY-MM-DD
sources: [path/to/raw/source, ...]
---
```

Then content in markdown with Obsidian wikilinks: `[[page-name]]`.

---

## Operations

### Ingest a new source
1. User drops a file in `docs/raw/` or pastes content.
2. LLM reads it, discusses key takeaways with user.
3. LLM writes a summary page in `pages/` (or skips if trivial).
4. LLM updates all relevant entity/concept pages (cross-references, new facts, contradictions).
5. LLM updates `index.md` with any new pages.
6. LLM appends to `log.md`: `## [YYYY-MM-DD] ingest | <source name>`.

### Answer a query
1. Read `index.md` to find relevant pages.
2. Read those pages.
3. Synthesize answer with citations to wiki pages (not raw sources).
4. If the answer is substantial or likely to be asked again, file it as a new page in `pages/analyses/`.
5. Append to `log.md`: `## [YYYY-MM-DD] query | <question summary>`.

### Lint the wiki
Run periodically or when asked:
- Find contradictions between pages (flag them, don't auto-resolve).
- Find orphan pages (no inbound wikilinks).
- Find concepts mentioned but lacking their own page.
- Suggest new sources to look for based on gaps.
- Append to `log.md`: `## [YYYY-MM-DD] lint | <findings summary>`.

---

## Conventions

- **ภาษา**: เขียน content เป็นภาษาไทยได้ (เพื่อให้ทีมอ่านง่าย) แต่ tag, frontmatter, filenames เป็นอังกฤษเสมอ
- **Filenames**: lowercase, hyphenated, no spaces — e.g. `line-system.md`, `expense-control.md`
- **Wikilinks**: ใช้ `[[filename-without-extension]]` เสมอ (Obsidian format)
- **Cross-reference**: ทุกครั้งที่กล่าวถึง entity สำคัญ ให้ wikilink ไปหน้านั้น
- **index.md**: อัปเดตทุกครั้งที่เพิ่ม/ลบ/เปลี่ยนชื่อหน้า — หน้าที่ไม่อยู่ใน index ถือว่าสูญหาย
- **log.md**: append-only, ห้ามแก้ไข entry เก่า
- **raw/**: อ่านได้อย่างเดียว — ห้ามแก้ไขไฟล์ต้นฉบับ

---

## Tags ที่ใช้ในโปรเจคนี้

| Tag | ความหมาย |
|-----|----------|
| `auth` | Authentication, JWT, roles |
| `line` | LINE OA, Webhook, Flex Message, Login |
| `crm` | Customer management, segments, import |
| `expense` | Expense control, categories, daily |
| `infra` | Docker, Redis, MongoDB, ARQ |
| `api` | Backend endpoints |
| `frontend` | Next.js pages, components |
| `deploy` | Deployment, CI/CD, VPS |
| `backlog` | งานที่ยังค้างอยู่ |
