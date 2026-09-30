import * as vscode from "vscode";
import { Effect } from "effect";
import { discoverSkills } from "./skillsDiscovery.js";
import type { DiscoveredSkill, SkillDiscoveryResult } from "./types/skill.js";
import { logger } from "./utils/logger.js";

/**
 * ChatAttachContextProvider implementation for Skills. Provides Skills as
 * native attachments in the Cmd+/ picker.
 */
export class SkillsAttachProvider implements vscode.ChatAttachContextProvider {
  private _onDidChangeSkills = new vscode.EventEmitter<void>();
  private _cachedResult: SkillDiscoveryResult | null = null;
  private _refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    logger.log("SkillsAttachProvider constructor called");

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("chat.agentSkillsLocations")) {
        logger.log("config changed, refreshing skills");
        this._refreshSkills();
      }
    });

    // Listen for workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      logger.log("workspace folders changed, refreshing");
      this._refreshSkills();
    });

    // Listen for file system changes in skill directories
    this._setupFileSystemWatchers();

    // Initial discovery
    this._refreshSkills();
  }

  /** Set up file system watchers for skill directories. */
  private _setupFileSystemWatchers(): void {
    // Watch for changes in common skill locations
    const patterns = [
      "**/.agents/skills/*/SKILL.md",
      "**/.github/skills/*/SKILL.md",
      "**/.claude/skills/*/SKILL.md",
    ];

    patterns.forEach((pattern) => {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(() => this._scheduleRefresh());
      watcher.onDidCreate(() => this._scheduleRefresh());
      watcher.onDidDelete(() => this._scheduleRefresh());
    });
  }

  /** Schedule a debounced refresh of skills. */
  private _scheduleRefresh(): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._refreshTimer = setTimeout(() => {
      this._refreshSkills();
    }, 500); // 500ms debounce
  }

  /** Refresh the skills cache. */
  private async _refreshSkills(): Promise<void> {
    await Effect.runPromise(
      Effect.tryPromise({
        try: () => discoverSkills(),
        catch: (cause) => cause,
      }).pipe(
        Effect.tap((result) => {
          this._cachedResult = result;
          logger.log(
            "_refreshSkills done, got",
            result.skills.length,
            "skills",
          );
          this._onDidChangeSkills.fire();
          return Effect.void;
        }),
        Effect.catchAll((error) => {
          logger.error("_refreshSkills FAILED:", error);
          return Effect.void;
        }),
      ),
    );
  }

  /**
   * Provide a list of chat context items that a user can choose from. These
   * context items are shown as options when the user explicitly attaches
   * context.
   */
  async provideAttachChatContext(
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatContextItem[]> {
    logger.log("provideAttachChatContext called");

    // Ensure we have fresh data
    if (!this._cachedResult) {
      await this._refreshSkills();
    }

    const skills = this._cachedResult?.skills || [];
    logger.log("providing", skills.length, "skills");
    const items: vscode.ChatContextItem[] = [];

    for (const skill of skills) {
      if (token.isCancellationRequested) {
        break;
      }

      items.push({
        label: skill.name,
        iconPath: new vscode.ThemeIcon("lightbulb"),
        resourceUri: skill.uri,
        modelDescription: skill.description || `Skill: ${skill.name}`,
        tooltip: this._createTooltip(skill),
      });
    }

    logger.log("returning", items.length, "items");
    return items;
  }

  /**
   * Resolve a chat context item to get its full value. This is called when the
   * user selects a skill from the picker. Dynamically checks
   * github.copilot.chat.skillTool.enabled to determine whether to instruct the
   * agent to use the skill tool or read the file.
   */
  async resolveAttachChatContext(
    context: vscode.ChatContextItem,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatContextItem> {
    if (context.value) {
      return context;
    }

    const skillUri = context.resourceUri;
    if (!skillUri) {
      return context;
    }

    const skill = this._cachedResult?.skills.find(
      (s) => s.uri.toString() === skillUri.toString(),
    );

    const skillName = skill?.name || "Unknown";
    const skillDesc = skill?.description || "";

    // Check if the skill tool is enabled
    const config = vscode.workspace.getConfiguration("github.copilot.chat");
    const skillToolEnabled = config.get<boolean>("skillTool.enabled", false);

    const loadInstruction = skillToolEnabled
      ? `Use the skill tool with the skill name "${skillName}" to load this skill.`
      : `Use the readFile tool to read the SKILL.md file at: ${skillUri.fsPath}`;

    return {
      ...context,
      value: [
        `The user has explicitly chosen to load the skill "${skillName}".`,
        `You MUST NOT respond to the user's message until you have read and loaded the following skill.`,
        ``,
        `SKILL NAME: ${skillName}`,
        `SKILL FILE: ${skillUri.fsPath}`,
        skillDesc ? `SKILL DESCRIPTION: ${skillDesc}` : "",
        ``,
        `INSTRUCTIONS:`,
        `- STOP. Do not generate any response yet.`,
        `- ${loadInstruction}`,
        `- ABSORB the contents — it contains your behavioral directives for this task.`,
        `- ONLY THEN proceed to respond to the user, following the skill's instructions exactly.`,
        ``,
        `Failure to load the skill before responding will result in an incorrect and unhelpful answer.`,
        `This skill was deliberately selected by the user and takes precedence over default behavior.`,
      ]
        .filter(Boolean)
        .join("\n"),
      modelDescription:
        skill?.description || `Agent Skill: ${skill?.name || "Unknown"}`,
    };
  }

  /** Create a tooltip for a skill. */
  private _createTooltip(skill: DiscoveredSkill): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${skill.name}**\n\n`);

    if (skill.description) {
      tooltip.appendMarkdown(`${skill.description}\n\n`);
    }

    tooltip.appendMarkdown(
      `*Storage*: ${skill.storage === "workspace" ? "Workspace" : "User"}\n`,
    );

    if (skill.workspaceFolder) {
      tooltip.appendMarkdown(`*Workspace*: ${skill.workspaceFolder}\n`);
    }

    tooltip.appendMarkdown(`*Path*: \`${skill.displayPath}\``);

    if (skill.argumentHint) {
      tooltip.appendMarkdown(`\n\n*Arguments*: \`${skill.argumentHint}\``);
    }

    return tooltip;
  }

  /** Dispose of resources. */
  dispose(): void {
    this._onDidChangeSkills.dispose();
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
  }
}
