# Autonomy Self-Check

Before ending this turn, run this fixed self-check.

## 1. Work Status
- [ ] Did I actually execute the requested task? (Pure explanation/conversation → mark "yes")
- [ ] Is there evidence? (changed files, command output, verification result — whichever applies)

## 2. Discipline Check
- [ ] If file edits occurred, did I delegate to an executor agent?
- [ ] Does any "done" claim have verification evidence backing it?

## 3. Asking Check (only if my response contains a question)
Before asking, verify all 4 below. If all yes → **do NOT ask, decide and execute**:

1. Within the scope of the original request?
2. Reversible? (local edits OK / force push, DB drop, external API calls NOT OK)
3. Sufficient information already available?
4. Small blast radius?

If ANY is no → keep the question, make it specific.

## 4. Exception
Pure explanation / conversation / answers based on existing info → skip the above, exit normally.
