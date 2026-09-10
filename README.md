# Skills Attachment

![Skills Attachment icon](images/icon.png)

Adds native Skills support to the Copilot Chat `Cmd+/` attachment picker. Uses the `chatContextProvider` Proposed API — VS Code Insiders only.

> Icon source: [ray.so](https://ray.so/8yWRyUF)

## Usage

1. Open Chat and press `Cmd+/` or click the `+` button
2. Select **Skills...**
3. Pick a skill from the list
4. The skill path and description are attached to the Chat request as context

## Skills Discovery

The extension automatically scans these directories for Skills:

- `.agents/skills/`
- `.github/skills/`
- `.claude/skills/`
- `~/.agents/skills/`
- `~/.copilot/skills/`
- `~/.claude/skills/`

Customize paths via the `chat.agentSkillsLocations` VS Code setting.

## Known Issues

### Skills Position in the Attachment Picker

Skills currently appear **below Screenshot Window** instead of directly under **Instructions**.

**Cause**: The `chatContext` contribution point schema does not expose an `ordinal` attribute, so extensions cannot control sort order. VS Code uses `ordinal` internally (Open Editors: 800, Instructions: 0, Tools: -500), but this is not available to third-party extensions. Items with the same `ordinal` sort alphabetically by label, placing Skills (S) after Screenshot Window (S).

**Fix**: Add `ordinal` support to the `chatContext` schema in `chatContext.contribution.ts` and pass the value through to `ChatContextPickService` in `chatContextService.ts`.

Relevant source files:

- `vscode/src/vs/workbench/contrib/chat/browser/contextContrib/chatContext.contribution.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/attachments/chatContextPickService.ts`

## Development

```bash
npm install
npm run compile
```

Open in VS Code Insiders, press `Cmd+Shift+D` → select "Run Extension" → click ▶️.

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

- Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
- Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
- Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

- [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
- [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
