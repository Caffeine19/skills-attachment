// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SkillsAttachProvider } from "./skillsProvider.js";
import { discoverSkills } from "./skillsDiscovery.js";
import { logger } from "./logger.js";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  logger.log("activate() called");
  logger.log("vscode version:", vscode.version);
  logger.log("chat namespace exists?", !!vscode.chat);
  logger.log(
    "registerChatAttachContextProvider exists?",
    typeof vscode.chat?.registerChatAttachContextProvider,
  );

  try {
    // Register the Skills attach context provider
    const skillsProvider = new SkillsAttachProvider();
    logger.log("SkillsAttachProvider created");

    const disposable = vscode.chat.registerChatAttachContextProvider(
      "skills",
      skillsProvider,
    );
    logger.log("registerChatAttachContextProvider SUCCESS");
    context.subscriptions.push(disposable);
  } catch (e) {
    logger.error("registerChatAttachContextProvider FAILED:", e);
  }

  // Register command to open SKILL.md when attachment chip is clicked
  const openSkillCommand = vscode.commands.registerCommand(
    "skills-attachment.openSkill",
    async (skillUri: vscode.Uri) => {
      logger.log("openSkill command triggered:", skillUri?.toString());
      if (skillUri) {
        await vscode.commands.executeCommand("vscode.open", skillUri);
      }
    },
  );
  context.subscriptions.push(openSkillCommand);

  // Register commands
  const refreshCommand = vscode.commands.registerCommand(
    "skills-attachment.refreshSkills",
    async () => {
      logger.log("refreshSkills command triggered");
      vscode.window.showInformationMessage("Skills refreshed!");
    },
  );
  context.subscriptions.push(refreshCommand);

  const showSkillsCommand = vscode.commands.registerCommand(
    "skills-attachment.showSkills",
    async () => {
      logger.log("showSkills command triggered");
      const result = await discoverSkills();
      logger.log("discovered", result.skills.length, "skills");
      vscode.window.showInformationMessage(
        `Found ${result.skills.length} skills`,
      );
    },
  );
  context.subscriptions.push(showSkillsCommand);

  logger.log("activate() done");
}

// This method is called when your extension is deactivated
export function deactivate() {
  logger.log("deactivate() called");
}
