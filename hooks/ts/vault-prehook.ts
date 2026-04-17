#!/usr/bin/env bun
import type { HookInput, HookOutput } from "./types.ts";
import { classify, shouldSearchVault, extractKeywords } from "./classify.ts";

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

function emit(output: HookOutput): void {
  console.log(JSON.stringify(output));
}

function silent(): void {
  emit({ continue: true, suppressOutput: true });
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    if (!raw.trim()) return silent();

    let input: HookInput;
    try {
      input = JSON.parse(raw);
    } catch {
      return silent();
    }

    const prompt = (input.prompt ?? "").trim();
    if (!prompt) return silent();

    const category = classify(prompt);
    if (!shouldSearchVault(category, prompt)) return silent();

    const keywords = extractKeywords(prompt, input.cwd);
    if (keywords.length === 0) return silent();

    const hint = [
      `[vault-prehook]`,
      `Prompt classified as "${category}". Consider invoking \`agmo:vault-search\` with keywords: ${keywords.join(", ")}`,
      `If relevant past notes exist, incorporate them before proceeding.`,
    ].join("\n");

    emit({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: hint,
      },
    });
  } catch {
    silent();
  }
}

main();
