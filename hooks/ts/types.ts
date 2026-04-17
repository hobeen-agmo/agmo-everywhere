export interface HookInput {
  session_id?: string;
  cwd?: string;
  prompt?: string;
}

export interface HookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
  };
}

export type PromptCategory =
  | "chat"        // greetings, single-word replies
  | "question"    // asking for info/explanation
  | "design"      // architecture, approach questions
  | "fix"         // bug-fix requests
  | "implement"   // new feature/code
  | "command";    // direct action ("run this", "commit")
