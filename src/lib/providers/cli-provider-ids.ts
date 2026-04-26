/**
 * Client-safe CLI provider identifiers.
 *
 * This module is intentionally free of Node.js-only imports (child_process, fs,
 * etc.) so it can be imported from Client Components. The heavy CLI utilities
 * remain in ./cli-utils.ts (server-only).
 */

/** Human-readable descriptions of what each CLI provider excels at. */
export const CLI_PROVIDER_CAPABILITIES: Record<string, string> = {
  'claude-cli': 'multi-file code editing, refactoring, debugging, code review',
  'codex-cli': 'code generation, file creation, automated coding tasks',
  'opencode-cli': 'code analysis, generation across multiple LLM backends',
  'gemini-cli': 'code generation, analysis with Gemini models',
  'copilot-cli': 'code generation, analysis, multi-model support via GitHub Copilot',
  'droid-cli': 'code generation, refactoring, and automation via Factory Droid with configurable autonomy',
  'cursor-cli': 'full-agent coding workflows, multi-file edits, project-aware code changes',
  'qwen-code-cli': 'terminal-native coding workflows, code generation, review, and automation',
  goose: 'agentic coding workflows with extensions, tools, and runtime-managed execution',
}

/** Check if a provider ID is a CLI-based provider. */
export function isCliProvider(providerId: string): boolean {
  return providerId in CLI_PROVIDER_CAPABILITIES
}
