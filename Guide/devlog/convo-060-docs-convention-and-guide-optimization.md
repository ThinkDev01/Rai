# Convo 060 — Devlog TL;DR convention + Guide/ docs taxonomy & optimization pass

**Date:** 4 June 2026

---

> **TL;DR**
> - **Where we are:** Locked a devlog TL;DR-header convention (new devlogs only), a memory-model understanding (selective, important-only, local-not-cloud, default behavior unchanged), and a `Guide/` docs taxonomy — **Reference** (evergreen, generic names) vs **Journey** (dated, version-prefixed). Then ran a full structural + fact-fix optimization across all 12 `Guide/` docs.
> - **Done this convo:** deleted `rebuild-blueprint.md`; renamed `Rai-Info → overview`; rebuilt README into Reference/Journey/History buckets; reframed `testing.md` (v2 parked / v1 archived); killed every ASCII banner; stripped the stale `docs/` link prefix; enforced one H1 per doc; fixed verified facts (Jest→Vitest, rbac TBDs, dead `v2-rapid-fire.md` links).
> - **State:** all 12 docs at-bar — zero banners, one H1 each, no dead internal links; nothing dropped (v1 content kept, marked archived).
> - **What's next:** user reviews the optimized docs manually, then decides any further merges / `team/` folder work. New taxonomy saved to memory so future doc work follows it.

---

## Why this convo

Started from the standing CLAUDE.md ground rules (devlog TL;DR header + doc-style bar) and turned into three discussions then an execution pass:

1. Demonstrate the devlog TL;DR-header convention on a sample.
2. Clarify how Claude's memory actually works across sessions (the user wasn't sure what persists when convos aren't saved).
3. Settle a `Guide/` docs reorganization, then optimize all docs to the agreed structure.

## Discussion 1 — Devlog TL;DR header convention

- Applied a **TL;DR header** (3–5 line blockquote: where-we-are + what's-next) to the latest devlog (convo-059) as the sample bar. Nothing below it changed.
- **Clarified the rule:** *"don't retrofit old ones"* means don't bolt the header onto already-written devlog **files** — it does **not** mean excluding historical context from a new devlog. New devlogs still reference prior state; the header just summarizes it.
- **Locked:** new devlogs open with the TL;DR header; convo-001…059 stay as-is.

## Discussion 2 — How memory works (clarified, not changed)

The user probed what Claude retains across sessions. Conclusions:

- **Selective, not a running transcript.** Claude writes a memory file only when something durable/important comes up (proactively or on request) — there's no auto-summary of every convo.
- **Devlog ≠ recall.** convo-059 "remembers" its hydrating-bug fix because it was written to a devlog, not because Claude recalls the chat. Unsaved-convo context = zero recall next session unless it lands in a memory file.
- **Local, not cloud.** Memory files live under `~/.claude/.../memory/` on this machine only — not synced to another person/PC. For cross-PC continuity, the user commits docs/devlogs (which they do anyway).
- **Default behavior unchanged.** The user explicitly asked NOT to narrow Claude's default memory-saving — it's been on point. Default save behavior continues; *"remember it"* = high-priority save; *"bye/see you"* = capture session state before close.

## Discussion 3 — Guide/ docs taxonomy

The user wanted to declutter `Guide/` without over-complicating (no deep subfolders). Landed on a two-bucket model, flat folder, grouped only in the README index:

- **Reference** — answers *"how X works / what X is"*. Evergreen, **generic name, no version**: `overview`, `rbac`, `standards`, `notifications`, `scalability`, `deployment`, `testing`, `upgrades`.
- **Journey** — answers *"what we're building, when, why"*. Dated, **keep the version prefix** (the version is the information; v3 adds `v3-plans.md` alongside): `v2-plans`, `v2-decisions`, `product-decisions`. `devlog/` is the granular form.
- **Naming rule:** generic-noun = Reference; version-prefixed = Journey. This is what resolved the user's "rename vs keep" confusion — only Journey docs carry versions, and they *should*.

### Key decisions locked

- **Delete `rebuild-blueprint.md`** — v1-stale (self-built JWT/bcrypt, SERIAL ids, `role_type`), contradicted live v2 docs, and duplicated content that rots. A wrong doc is worse than no doc.
- **`LLD-SELF-STUDY.md` lives at repo root** (user moved it there for personal study) — not a `Guide/` project doc; dropped from the index.
- **No subfolders** beyond `devlog/`. Buckets are shown via README section headers, not directories.
- **2 small merges:** scalability's testing section → `testing.md`; overview §7 pointer index → README.

## The optimization pass (executed)

Ran structural + verified-fact fixes across all 12 docs. Principle held throughout: **lose nothing** — v1 content kept and marked archived (Was/Now), never deleted.

| Doc | Change |
|---|---|
| **README** | Rebuilt into Reference / Journey / History buckets; folded in the canonical "where to find things" pointer index; dropped deleted/moved docs; `team/` pointer preserved |
| **overview** (was `Rai-Info`) | Renamed; §7 pointer index collapsed to a one-line pointer to README |
| **testing** | Reframed: v2 stance up top (tests **parked until feature freeze**) + scalability's plan folded in as canonical; existing §1–§11 + manual checklist marked **v1 archived** (suite now at `backend/tests/v1-archive/`); ASCII banner removed; heading hierarchy fixed |
| **scalability** | Testing section → pointer to `testing.md`; verified fix **Jest → Vitest** (backend `package.json`) |
| **rbac** | Stale "TBD" intro corrected — the tables were already locked (project-delete = owner/admin ³, ticket-delete = PM+admin ⁵, archive = PM-in/PM-on-public) |
| **v2-plans** | ASCII banners removed; A1/A2/A3 merged-doc appendices re-leveled to clean `## → ### → ####`; redundant inner doc-title H1s dropped |
| **deployment** | Quickstart appendix: ASCII banner + emoji-H1 + redundant H1 removed; subsections demoted to `###` |
| **v2-decisions** | 2 dead `v2-rapid-fire.md` links → repointed to `v2-plans § A3` (file was already merged there); second H1 (`Edge-case decisions`) demoted to `##` |
| **6 docs** (rbac, upgrades, notifications, standards, v2-plans, v2-decisions) | Stale `docs/` path prefix stripped — folder is `Guide/`, so same-folder links are bare filenames |
| **all 12** | Exactly one H1 each; zero ASCII banners; no dead internal links (only intentional `_(was …)_` provenance notes remain) |

### Facts verified against the live repo

- Backend test runner is **Vitest** (`backend/package.json`) — `scalability.md`'s "Jest" was wrong.
- **Zero active v2 tests** — all 11 test files are under `backend/tests/v1-archive/`, confirming the "parked until freeze" stance and that `testing.md` was documenting the now-archived v1 suite.
- `LLD-SELF-STUDY.md` exists only at repo root (`find`/`ls`/`test` agree).
- `v2-rapid-fire.md` no longer exists as a file — it was merged into `v2-plans.md` appendix A3.

## Memory written

- New: `project_guide_docs_taxonomy.md` — the Reference/Journey split, naming rules, and the no-banner / one-H1 / bare-link conventions, so future doc work classifies and names new docs consistently. Indexed in `MEMORY.md`.

## What's next

- **User manual review** of the optimized docs (the user will eyeball all 12 later).
- After review: decide any **further merges** and whether the `team/` folder gets built out.
- Convention going forward: every new devlog opens with the TL;DR header; new docs classified per the taxonomy.

## Files touched

```
DELETED  Guide/rebuild-blueprint.md
RENAMED  Guide/Rai-Info.md → Guide/overview.md
Guide/README.md                  rebuilt: Reference/Journey/History + pointer index
Guide/overview.md                §7 → pointer to README
Guide/testing.md                 v2 stance + v1-archived reframe; banner + hierarchy fix
Guide/scalability.md             testing → pointer; Jest → Vitest
Guide/rbac.md                    TBD intro fix; docs/ prefix stripped
Guide/v2-plans.md                appendix banners removed + re-leveled; docs/ prefix stripped
Guide/v2-decisions.md            dead links repointed; H1 demote; docs/ prefix stripped
Guide/deployment.md              quickstart appendix banner/H1 fix
Guide/notifications.md           docs/ prefix stripped
Guide/standards.md               docs/ prefix stripped
Guide/upgrades.md                docs/ prefix stripped
Guide/devlog/convo-059-*.md      TL;DR header sample added
memory/project_guide_docs_taxonomy.md   NEW
memory/MEMORY.md                 index line added
```
