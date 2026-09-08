import * as vscode from "vscode";
import {
  DiscoveredSkill,
  discoverSkills,
  SkillDiscoveryResult,
} from "./skillsDiscovery.js";

/**
 * ChatAttachContextProvider implementation for Skills.
 * Provides Skills as native attachments in the Cmd+/ picker.
 */
export class SkillsAttachProvider implements vscode.ChatAttachContextProvider {
  private _onDidChangeSkills = new vscode.EventEmitter<void>();
  private _cachedResult: SkillDiscoveryResult | null = null;
  private _refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    console.error("SKILLS-ATTACHMENT: SkillsAttachProvider constructor called");

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("chat.agentSkillsLocations")) {
        console.error("SKILLS-ATTACHMENT: config changed, refreshing skills");
        this._refreshSkills();
      }
    });

    // Listen for workspace folder changes
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      console.error("SKILLS-ATTACHMENT: workspace folders changed, refreshing");
      this._refreshSkills();
    });

    // Listen for file system changes in skill directories
    this._setupFileSystemWatchers();

    // Initial discovery
    this._refreshSkills();
  }

  /**
   * Set up file system watchers for skill directories.
   */
  private _setupFileSystemWatchers(): void {
    // Watch for changes in common skill locations
    const patterns = [
      "**/.agents/skills/*/SKILL.md",
      "**/.github/skills/*/SKILL.md",
      "**/.claude/skills/*/SKILL.md",
    ];

    for (const pattern of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(() => this._scheduleRefresh());
      watcher.onDidCreate(() => this._scheduleRefresh());
      watcher.onDidDelete(() => this._scheduleRefresh());
    }
  }

  /**
   * Schedule a debounced refresh of skills.
   */
  private _scheduleRefresh(): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._refreshTimer = setTimeout(() => {
      this._refreshSkills();
    }, 500); // 500ms debounce
  }

  /**
   * Refresh the skills cache.
   */
  private async _refreshSkills(): Promise<void> {
    try {
      console.error("SKILLS-ATTACHMENT: _refreshSkills starting...");
      this._cachedResult = await discoverSkills();
      console.error(
        "SKILLS-ATTACHMENT: _refreshSkills done, got",
        this._cachedResult.skills.length,
        "skills",
      );
      this._onDidChangeSkills.fire();
    } catch (error) {
      console.error("SKILLS-ATTACHMENT: _refreshSkills FAILED:", error);
    }
  }

  /**
   * Provide a list of chat context items that a user can choose from.
   * These context items are shown as options when the user explicitly attaches context.
   */
  async provideAttachChatContext(
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatContextItem[]> {
    console.error("SKILLS-ATTACHMENT: provideAttachChatContext called");

    // Ensure we have fresh data
    if (!this._cachedResult) {
      await this._refreshSkills();
    }

    const skills = this._cachedResult?.skills || [];
    console.error("SKILLS-ATTACHMENT: providing", skills.length, "skills");
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

    console.error("SKILLS-ATTACHMENT: returning", items.length, "items");
    return items;
  }

  /**
   * Resolve a chat context item to get its full value.
   * This is called when the user selects a skill from the picker.
   * Only provides the SKILL.md path - the agent should read it on its own.
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

    return {
      ...context,
      value: skillUri.fsPath,
      modelDescription:
        skill?.description || `Agent Skill: ${skill?.name || "Unknown"}`,
    };
  }

  /**
   * Create a tooltip for a skill.
   */
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

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this._onDidChangeSkills.dispose();
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
  }
}
