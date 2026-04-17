---
name: save-impl
description: Use to save implementation summary to Obsidian vault. Auto-triggered after execute completes. Triggers on "구현 저장", "작업 정리", "save impl".
---

# Save Implementation — Summary to Obsidian Vault

## Process

Delegate to `archivist` agent (haiku):

1. **Identify project** — `scripts/identify-project.sh` → PROJECT, OWNER
2. **Collect git info** — `scripts/collect-git-info.sh` → branch, issue, PR, changed files (JSON)
3. **Ensure project index** — `scripts/ensure-project-index.sh PROJECT OWNER`
4. **Find related Plan** — `scripts/vault-search.sh --query "issue: \"{ISSUE_NUM}\"" --project {PROJECT}` or search by feature name in `{PROJECT}/plans/`
5. **Create tmpfile** — write to `/tmp/agmo-vault-{uuid}.md`:
   - Frontmatter (see `ref/frontmatter-schema.md` impl schema, `ref/impl-template.md` for body template)
   - Link to plan: `plan: "[[{PROJECT}/plans/[Plan] {plan title}]]"`
   - Body includes: implementation summary, changed files, key implementation details, design decisions
6. **Save** — `scripts/vault-save.sh --type impl --project {PROJECT} --title "{title}" --file /tmp/agmo-vault-{uuid}.md`
   - If `CREATED:` → proceed to step 7
   - If `DUPLICATE:{path}` → **return to orchestrator** with the duplicate path and new content summary. Orchestrator will ask user whether to update or skip.
     - If user approves update:
       a. `scripts/vault-update.sh section-ensure --path {IMPL_REL_PATH} --section "추가 구현"`
       b. `scripts/vault-update.sh section-append --path {IMPL_REL_PATH} --section "추가 구현" --content "{new implementation summary in markdown}"`
       c. `scripts/vault-update.sh property-set --path {IMPL_REL_PATH} --key status --value done`
       d. Skip steps 7-8 (index already has this entry), proceed to step 9-10
     - If user skips → proceed to step 9-10 without modifying the existing note
7. **Bidirectional link** — if Plan note exists:
   - `scripts/vault-update.sh section-ensure --path {PLAN_REL_PATH} --section Implementations`
   - `scripts/vault-update.sh section-append --path {PLAN_REL_PATH} --section Implementations --content "- Impl: [[{IMPL_REL_PATH}]]"`
   - `scripts/vault-update.sh property-set --path {PLAN_REL_PATH} --key status --value done`
8. **Update index** — `scripts/vault-update.sh section-append --path {PROJECT}/{PROJECT}.md --section Implementations --content "- [[{IMPL_REL_PATH}]]"`
9. **Set properties** — if issue/PR available:
   - `scripts/vault-update.sh property-set --path {IMPL_REL_PATH} --key issue --value "#{N}"`
   - `scripts/vault-update.sh property-set --path {IMPL_REL_PATH} --key pr --value "#{N}"`
10. **Cleanup** — `rm /tmp/agmo-vault-{uuid}.md`
11. **Report** — output saved path, index update, plan backlink status

## Vault Path

`${AGMO_VAULT_ROOT}/{PROJECT}/implementations/[Impl] {title}.md`

## Title Derivation

Archivist MUST derive the title deterministically using these rules (in priority order):

1. **Orchestrator override** — if the orchestrator explicitly provides a title in the prompt, use it as-is
2. **Related Plan title** — strip the `[Plan]` prefix from the related plan's title (e.g., Plan "TODO 태그 시스템" → Impl "TODO 태그 시스템")
3. **Feature/branch name** — from `collect-git-info.sh` result, use the feature name

Archivist MUST NOT invent a creative title. The title must be traceable to its source.

**CRITICAL: Do NOT include the type prefix in --title.** `vault-save.sh` adds the `[Impl]` prefix automatically. Passing `--title "[Impl] foo"` results in `[Impl]-[Impl]-foo`.

## Safety

- On `DUPLICATE:`, return to orchestrator for user confirmation before updating. If user approves, use update mode (section-append) instead of overwriting. Never replace existing content.
- Do not modify any note outside the target project's directory.

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
