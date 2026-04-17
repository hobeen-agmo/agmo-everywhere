import type { PromptCategory } from "./types.ts";
import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

const SKIP_PATTERNS = [
  /^(응|아니|네|예|ok|yes|no|thanks|고마워)[.!?\s]*$/i,
  /^\s*$/,  // empty
];

const CODE_BLOCK_RE = /```[\s\S]*?```|`[^`]+`/;
const FILE_PATH_RE = /[\w\-./]+\.(ts|tsx|js|jsx|py|md|json|sh|rs|go|java|kt|swift|c|cpp|h|rb|php|sql|yml|yaml|toml)\b/;

export function isSimpleChat(prompt: string): boolean {
  if (prompt.length < 5) return true;
  if (SKIP_PATTERNS.some((re) => re.test(prompt.trim()))) return true;
  return false;
}

const DESIGN_HINTS = ["어떻게", "어떤 방식", "뭐가 좋을", "어느 쪽", "추천", "접근", "전략", "설계", "architecture", "approach", "which is better", "should i"];
const FIX_HINTS = ["버그", "안 돼", "오류", "에러", "왜 안", "bug", "error", "fail", "broken", "not working"];
const IMPLEMENT_HINTS = ["구현", "만들어", "생성", "implement", "create", "add feature", "build"];
const QUESTION_HINTS = ["뭐지", "뭐야", "어떻게 되", "what is", "how does", "why does"];
const COMMAND_HINTS = ["실행", "돌려", "커밋", "푸시", "run", "execute", "commit", "push", "deploy"];

function countHits(prompt: string, hints: string[]): number {
  const lower = prompt.toLowerCase();
  return hints.filter((h) => lower.includes(h.toLowerCase())).length;
}

export function classify(prompt: string): PromptCategory {
  if (isSimpleChat(prompt)) return "chat";

  const scores = {
    design: countHits(prompt, DESIGN_HINTS),
    fix: countHits(prompt, FIX_HINTS),
    implement: countHits(prompt, IMPLEMENT_HINTS),
    question: countHits(prompt, QUESTION_HINTS),
    command: countHits(prompt, COMMAND_HINTS),
  };

  const max = Math.max(...Object.values(scores));
  if (max === 0) return "question";  // default

  const category = (Object.keys(scores) as PromptCategory[]).find(
    (k) => scores[k as keyof typeof scores] === max
  );
  return category ?? "question";
}

export function shouldSearchVault(category: PromptCategory, prompt: string): boolean {
  // Skip for chat, command, pure short questions
  if (category === "chat" || category === "command") return false;

  // Skip if prompt is dominated by code/paths (active coding context)
  if (CODE_BLOCK_RE.test(prompt)) return false;
  if ((prompt.match(FILE_PATH_RE) ?? []).length >= 2) return false;

  // design/fix/implement/question with substance → worth searching
  return prompt.length >= 15;
}

interface Pattern {
  name: string;
  aliases: string[];
  count?: number;
}

function getVaultRoot(): string | null {
  const env = process.env.AGMO_VAULT_ROOT;
  if (env) return env;
  const cfg = join(homedir(), ".agmo", "config");
  if (!existsSync(cfg)) return null;
  try {
    const data = JSON.parse(readFileSync(cfg, "utf-8"));
    return data.vault_root ?? null;
  } catch {
    return null;
  }
}

function getProjectName(cwd: string): string {
  // fallback: use basename of cwd
  return basename(cwd);
}

function loadDomainPatterns(cwd: string): Pattern[] {
  const vault = getVaultRoot();
  if (!vault) return [];
  const project = getProjectName(cwd);
  const path = join(vault, project, "domain-keywords.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return (data.patterns ?? []) as Pattern[];
  } catch {
    return [];
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function matchConfidence(promptLower: string, trigger: string): number {
  const t = trigger.toLowerCase();
  if (promptLower.includes(t)) return 100;
  // fuzzy on whole prompt split by whitespace
  const words = promptLower.split(/\s+/).filter(w => w.length > 0);
  let best = 0;
  for (const word of words) {
    if (word === t) return 100;
    if (word.length > 0 && t.length > 0) {
      if (word.includes(t) || t.includes(word)) best = Math.max(best, 80);
      const d = levenshtein(word, t);
      const maxLen = Math.max(word.length, t.length);
      if (maxLen > 0) {
        const sim = ((maxLen - d) / maxLen) * 100;
        if (sim >= 70) best = Math.max(best, Math.round(sim));
      }
    }
  }
  return best;
}

export function extractKeywords(prompt: string, cwd?: string): string[] {
  const patterns = loadDomainPatterns(cwd ?? process.cwd());
  if (patterns.length === 0) return [];

  const promptLower = prompt.toLowerCase();
  const THRESHOLD = 60;

  const scored: Array<{ name: string; conf: number }> = [];

  for (const p of patterns) {
    const triggers = [p.name, ...(p.aliases ?? [])];
    let maxScore = 0;
    for (const t of triggers) {
      const s = matchConfidence(promptLower, t);
      if (s > maxScore) maxScore = s;
    }
    if (maxScore >= THRESHOLD) {
      scored.push({ name: p.name, conf: maxScore });
    }
  }

  return scored
    .sort((a, b) => b.conf - a.conf)
    .slice(0, 3)
    .map(s => s.name);
}
