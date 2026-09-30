/*---------------------------------------------------------------------------------------------
 *  Minimal subset of vscode.proposed.chatPromptFiles.d.ts for skill discovery.
 *--------------------------------------------------------------------------------------------*/

declare module "vscode" {
  /** Where the chat resource was loaded from. */
  export type ChatResourceSource =
    "local" | "user" | "extension" | "plugin" | "builtin";

  /** Represents a skill resource. */
  export interface ChatSkill {
    /** Uri to the skill resource. Typically a `SKILL.md` file. */
    readonly uri: Uri;

    /** Display name of the skill. */
    readonly name: string;

    /** Optional description of the skill. */
    readonly description?: string;

    /** Where the skill was loaded from. */
    readonly source: ChatResourceSource;

    /** Optional session types that describe when the skill should be offered. */
    readonly sessionTypes?: readonly string[];

    /** The contributing extension identifier when {@link source} is `extension`. */
    readonly extensionId?: string;

    /** The contributing plugin URI when {@link source} is `plugin`. */
    readonly pluginUri?: Uri;

    /** Whether this skill should be shown to users as invocable. */
    readonly userInvocable?: boolean;

    /**
     * Whether this skill should be excluded from model invocation. When true,
     * the skill can only be triggered manually via `/name`.
     */
    readonly disableModelInvocation: boolean;
  }

  export namespace chat {
    /**
     * Provide the list of currently available skills. These are `SKILL.md`
     * files from all sources (workspace, user, extension-provided, plugin, and
     * builtin).
     *
     * @param token A cancellation token.
     */
    export function getSkills(
      token: CancellationToken,
    ): Thenable<readonly ChatSkill[]>;

    /** An event that fires when the list of skills changes. */
    export const onDidChangeSkills: Event<void>;
  }
}
