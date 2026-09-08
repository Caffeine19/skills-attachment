// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { SkillsAttachProvider } from "./skillsProvider.js";
import { discoverSkills } from "./skillsDiscovery.js";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.error("========== SKILLS-ATTACHMENT: activate() CALLED ==========");
  console.error("SKILLS-ATTACHMENT: vscode version:", vscode.version);
  console.error("SKILLS-ATTACHMENT: chat namespace exists?", !!vscode.chat);
  console.error(
    "SKILLS-ATTACHMENT: registerChatAttachContextProvider exists?",
    typeof vscode.chat?.registerChatAttachContextProvider,
  );

  try {
    // Register the Skills attach context provider
    const skillsProvider = new SkillsAttachProvider();
    console.error("SKILLS-ATTACHMENT: SkillsAttachProvider created");

    const disposable = vscode.chat.registerChatAttachContextProvider(
      "skills",
      skillsProvider,
    );
    console.error(
      "SKILLS-ATTACHMENT: registerChatAttachContextProvider SUCCESS",
    );
    context.subscriptions.push(disposable);
  } catch (e) {
    console.error(
      "SKILLS-ATTACHMENT: registerChatAttachContextProvider FAILED:",
      e,
    );
  }

  // Register command to open SKILL.md when attachment chip is clicked
  const openSkillCommand = vscode.commands.registerCommand(
    "skills-attachment.openSkill",
    async (skillUri: vscode.Uri) => {
      console.error(
        "SKILLS-ATTACHMENT: openSkill command triggered:",
        skillUri?.toString(),
      );
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
      console.error("SKILLS-ATTACHMENT: refreshSkills command triggered");
      vscode.window.showInformationMessage("Skills refreshed!");
    },
  );
  context.subscriptions.push(refreshCommand);

  const showSkillsCommand = vscode.commands.registerCommand(
    "skills-attachment.showSkills",
    async () => {
      console.error("SKILLS-ATTACHMENT: showSkills command triggered");
      const result = await discoverSkills();
      console.error(
        "SKILLS-ATTACHMENT: discovered",
        result.skills.length,
        "skills",
      );
      vscode.window.showInformationMessage(
        `Found ${result.skills.length} skills`,
      );
    },
  );
  context.subscriptions.push(showSkillsCommand);

  console.error("========== SKILLS-ATTACHMENT: activate() DONE ==========");
}

// This method is called when your extension is deactivated
export function deactivate() {
  console.error("SKILLS-ATTACHMENT: deactivate() called");
}
