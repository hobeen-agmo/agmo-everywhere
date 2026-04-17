---
name: save-plan
description: Fallback for when the plan skill's auto-save fails or is skipped. Use to manually save a plan to Obsidian vault. Triggers on "플랜 저장", "save plan".
---

> plan 스킬의 자동 저장이 누락되었을 때 수동 fallback으로 사용한다. 일반적으로 plan 스킬이 직접 vault에 저장하므로 이 스킬이 자동 트리거되지는 않는다.

# Save Plan — Plan to Obsidian Vault

## Process

Delegate to `archivist` agent (haiku):

1. **Identify project** — `scripts/identify-project.sh` → PROJECT, OWNER
2. **Read source** — Read the most recently modified `.md` file in `.plans/`. If none exists, collect from conversation context
3. **Ensure project index** — `scripts/ensure-project-index.sh PROJECT OWNER`
4. **Create tmpfile** — write to `/tmp/agmo-vault-{uuid}.md`:
   - Frontmatter (see `ref/frontmatter-schema.md` plan schema):
     ```yaml
     ---
     type: plan
     project: {PROJECT}
     issue: null
     issue-type: feature
     status: draft
     created: {YYYY-MM-DD}
     tags:
       - plan
       - {PROJECT}
     ---
     ```
   - Body: `> Project: [[{PROJECT}]]` then plan content
5. **Save** — `scripts/vault-save.sh --type plan --project {PROJECT} --title "{title}" --file /tmp/agmo-vault-{uuid}.md`
   - If `DUPLICATE:` → ask user
6. **Update index** — `scripts/vault-update.sh section-append --path {PROJECT}/{PROJECT}.md --section Plans --content "- [[{PROJECT}/plans/[Plan] {title}]]"`
7. **Issue link** — If TODO-Issue.md has issue number, `scripts/vault-update.sh property-set --path {NOTE_REL_PATH} --key issue --value "#{number}"`
8. **Cleanup** — `rm /tmp/agmo-vault-{uuid}.md`
9. **Report** — output saved file path, suggest `obsidian-to-issue` or implementation

## Vault Path

`${AGMO_VAULT_ROOT}/{PROJECT}/plans/[Plan] {title}.md`

## Title Derivation

Archivist MUST derive the title deterministically using these rules (in priority order):

1. **Orchestrator override** — if the orchestrator explicitly provides a title in the prompt, use it as-is
2. **Plan heading** — use the first `#` heading from the plan content (e.g., `# 인증 시스템 구현 계획` → "인증 시스템 구현 계획")
3. **Feature name** — from the conversation context, use the feature/task name being planned

Archivist MUST NOT invent a creative title. The title must be traceable to its source.

**CRITICAL: Do NOT include the type prefix in --title.** `vault-save.sh` adds the `[Plan]` prefix automatically. Passing `--title "[Plan] foo"` results in `[Plan]-[Plan]-foo`.

## Safety

- If a note with the same title exists, ask user before overwriting
- Never delete existing index entries (append only)

## Domain Keyword Update (MANDATORY post-save)

After the note is saved successfully, update the project-level domain keyword whitelist.

**Steps**:
1. Determine `PROJECT` from the saved note path (e.g., `{vault}/agmo-everywhere/...` → `agmo-everywhere`).
2. Extract keywords:
   - **tags**: every tag from the note's frontmatter. For each, generate Korean/English aliases (3~5 each).
   - **nouns**: pick **exactly 5 meaningful nouns** from the note body. Only domain-specific terms (tech names, concepts, system names). Exclude function words, pronouns, programming keywords.
   - For each noun, generate 한/영/동의어/유의어 aliases (3~5 each).
3. Call `scripts/domain-update.sh`:

```bash
scripts/domain-update.sh --project {PROJECT} --data - <<'JSON'
{
  "tags": [
    {"name": "tag1", "aliases": ["한글", "English", "synonym"]}
  ],
  "nouns": [
    {"name": "concept-name", "aliases": ["개념명", "concept name", "related-term", "유의어"]},
    {"name": "second-concept", "aliases": [...]},
    {"name": "third-concept", "aliases": [...]},
    {"name": "fourth-concept", "aliases": [...]},
    {"name": "fifth-concept", "aliases": [...]}
  ]
}
JSON
```

**Rules**:
- `name`: canonical kebab-case (prefer English)
- exactly 5 nouns (no more, no less)
- each noun has 3~5 aliases covering 한/영/동의어/유의어
- Do NOT skip this step — the whitelist is critical for vault-prehook
