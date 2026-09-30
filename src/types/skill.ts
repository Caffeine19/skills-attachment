import * as vscode from "vscode";

/**
 * Where a skill was loaded from.
 * Mirrors VS Code's `ChatResourceSource`: workspace dirs (local), user home dirs,
 * extension-contributed, plugin, and built-in skills.
 */
export type SkillStorage =
  | "workspace"
  | "user"
  | "extension"
  | "plugin"
  | "builtin";

/**
 * Represents a discovered Skill with its metadata.
 */
export interface DiscoveredSkill {
  /** Skill name (from SKILL.md frontmatter or folder name) */
  readonly name: string;
  /** Human-readable description */
  readonly description?: string;
  /** Whether the skill can be invoked by users */
  readonly userInvocable: boolean;
  /** If true, the skill should not be automatically loaded by the agent */
  readonly disableModelInvocation: boolean;
  /** Optional argument hint for the skill */
  readonly argumentHint?: string;
  /** URI of the SKILL.md file */
  readonly uri: vscode.Uri;
  /** Storage type: where the skill was loaded from */
  readonly storage: SkillStorage;
  /** Workspace folder name (for multi-root workspaces) */
  readonly workspaceFolder?: string;
  /** Full path for display purposes */
  readonly displayPath: string;
}

/**
 * Result of skill discovery with metadata about the discovery process.
 */
export interface SkillDiscoveryResult {
  /** All discovered skills */
  readonly skills: DiscoveredSkill[];
  /** Source folders that were searched */
  readonly sourceFolders: { uri: vscode.Uri; storage: SkillStorage }[];
  /** Duration of the discovery process in milliseconds */
  readonly durationInMillis: number;
}
