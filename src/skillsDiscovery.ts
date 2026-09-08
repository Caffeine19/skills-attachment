import * as vscode from "vscode";
import * as path from "path";

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
  /** Optional argument hint for the skill */
  readonly argumentHint?: string;
  /** URI of the SKILL.md file */
  readonly uri: vscode.Uri;
  /** Storage type: 'workspace' or 'user' */
  readonly storage: "workspace" | "user";
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
  readonly sourceFolders: { uri: vscode.Uri; storage: "workspace" | "user" }[];
  /** Duration of the discovery process in milliseconds */
  readonly durationInMillis: number;
}

/**
 * Default skill source folders matching VS Code's built-in locations.
 */
const DEFAULT_SKILL_SOURCE_FOLDERS = [
  { path: ".agents/skills", storage: "workspace" as const },
  { path: ".github/skills", storage: "workspace" as const },
  { path: ".claude/skills", storage: "workspace" as const },
  { path: "~/.agents/skills", storage: "user" as const },
  { path: "~/.copilot/skills", storage: "user" as const },
  { path: "~/.claude/skills", storage: "user" as const },
];

/**
 * Parse YAML frontmatter from a Markdown file content.
 * Simple parser that handles key: value pairs at the beginning of the file.
 */
function parseFrontmatter(
  content: string,
): Record<string, string | boolean | undefined> {
  const result: Record<string, string | boolean | undefined> = {};

  // Check if content starts with frontmatter delimiter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return result;
  }

  const frontmatter = frontmatterMatch[1];
  const lines = frontmatter.split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (!key) {
      continue;
    }

    // Handle boolean values
    if (value === "true") {
      result[key] = true;
    } else if (value === "false") {
      result[key] = false;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Get the skill folder name from a SKILL.md URI.
 */
function getSkillFolderName(uri: vscode.Uri): string {
  const parts = uri.path.split("/");
  // SKILL.md is inside the skill folder, so go up one level
  return parts[parts.length - 2] || "";
}

/**
 * Read and parse a SKILL.md file.
 */
async function parseSkillFile(
  uri: vscode.Uri,
  storage: "workspace" | "user",
  workspaceFolder?: string,
): Promise<DiscoveredSkill | null> {
  try {
    const contentBytes = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(contentBytes).toString("utf-8");
    const frontmatter = parseFrontmatter(content);

    const folderName = getSkillFolderName(uri);
    const name = (frontmatter.name as string) || folderName;
    const description = frontmatter.description as string | undefined;
    const userInvocable = frontmatter["user-invocable"] !== false;
    const argumentHint = frontmatter["argument-hint"] as string | undefined;

    // Skip if user-invocable is explicitly false
    if (!userInvocable) {
      return null;
    }

    // Validate name matches folder name
    if (name !== folderName) {
      console.warn(
        `[SkillsDiscovery] Skill name "${name}" does not match folder name "${folderName}", using folder name: ${uri}`,
      );
      return {
        name: folderName,
        description,
        userInvocable,
        argumentHint,
        uri,
        storage,
        workspaceFolder,
        displayPath:
          storage === "user"
            ? uri.path.replace(/^\/Users\/[^/]+/, "~")
            : vscode.workspace.asRelativePath(uri),
      };
    }

    return {
      name,
      description,
      userInvocable,
      argumentHint,
      uri,
      storage,
      workspaceFolder,
      displayPath:
        storage === "user"
          ? uri.path.replace(/^\/Users\/[^/]+/, "~")
          : vscode.workspace.asRelativePath(uri),
    };
  } catch (error) {
    console.error(
      `[SkillsDiscovery] Failed to parse skill file: ${uri}`,
      error,
    );
    return null;
  }
}

/**
 * Resolve a skill source folder path to a URI.
 */
async function resolveSourceFolder(
  folderPath: string,
  storage: "workspace" | "user",
  workspaceFolder?: vscode.WorkspaceFolder,
): Promise<vscode.Uri | null> {
  try {
    let resolvedPath: string;

    if (folderPath.startsWith("~/")) {
      // User home path
      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      resolvedPath = path.join(homeDir, folderPath.slice(2));
    } else if (workspaceFolder) {
      // Workspace relative path
      resolvedPath = path.join(workspaceFolder.uri.fsPath, folderPath);
    } else {
      return null;
    }

    return vscode.Uri.file(resolvedPath);
  } catch (error) {
    console.error(
      `[SkillsDiscovery] Failed to resolve path: ${folderPath}`,
      error,
    );
    return null;
  }
}

/**
 * Scan a directory for SKILL.md files.
 */
async function scanDirectory(
  dirUri: vscode.Uri,
  storage: "workspace" | "user",
  workspaceFolder?: string,
): Promise<DiscoveredSkill[]> {
  const skills: DiscoveredSkill[] = [];

  try {
    // Check if directory exists
    await vscode.workspace.fs.stat(dirUri);

    // Read directory contents
    const entries = await vscode.workspace.fs.readDirectory(dirUri);

    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }

      const skillMdUri = vscode.Uri.joinPath(dirUri, name, "SKILL.md");

      try {
        // Check if SKILL.md exists
        await vscode.workspace.fs.stat(skillMdUri);

        const skill = await parseSkillFile(
          skillMdUri,
          storage,
          workspaceFolder,
        );
        if (skill) {
          skills.push(skill);
        }
      } catch {
        // SKILL.md doesn't exist in this subdirectory, skip
      }
    }
  } catch {
    // Directory doesn't exist or can't be read, skip
  }

  return skills;
}

/**
 * Discover all Skills from configured source folders.
 */
export async function discoverSkills(
  token?: vscode.CancellationToken,
): Promise<SkillDiscoveryResult> {
  const startTime = Date.now();
  const config = vscode.workspace.getConfiguration("chat");
  const skillsLocations = config.get<Record<string, boolean>>(
    "agentSkillsLocations",
    {},
  );

  // Build list of enabled paths
  const enabledPaths: { path: string; storage: "workspace" | "user" }[] = [];

  // Use configured paths, falling back to defaults if empty
  if (Object.keys(skillsLocations).length === 0) {
    enabledPaths.push(...DEFAULT_SKILL_SOURCE_FOLDERS);
  } else {
    for (const [path, enabled] of Object.entries(skillsLocations)) {
      if (enabled) {
        const storage = path.startsWith("~/") ? "user" : "workspace";
        enabledPaths.push({ path, storage });
      }
    }
  }

  // Resolve source folders
  const sourceFolders: { uri: vscode.Uri; storage: "workspace" | "user" }[] =
    [];
  const workspaceFolders = vscode.workspace.workspaceFolders || [];

  for (const enabledPath of enabledPaths) {
    if (enabledPath.storage === "user") {
      // User paths: resolve once
      const uri = await resolveSourceFolder(enabledPath.path, "user");
      if (uri) {
        sourceFolders.push({ uri, storage: "user" });
      }
    } else {
      // Workspace paths: resolve for each workspace folder
      for (const folder of workspaceFolders) {
        const uri = await resolveSourceFolder(
          enabledPath.path,
          "workspace",
          folder,
        );
        if (uri) {
          sourceFolders.push({ uri, storage: "workspace" });
        }
      }
    }
  }

  // Scan all source folders for skills
  const allSkills: DiscoveredSkill[] = [];
  const seenNames = new Map<string, DiscoveredSkill>();

  for (const { uri, storage } of sourceFolders) {
    if (token?.isCancellationRequested) {
      break;
    }

    // Determine workspace folder name for multi-root display
    let workspaceFolderName: string | undefined;
    if (storage === "workspace") {
      for (const folder of workspaceFolders) {
        if (uri.fsPath.startsWith(folder.uri.fsPath)) {
          workspaceFolderName = folder.name;
          break;
        }
      }
    }

    const skills = await scanDirectory(uri, storage, workspaceFolderName);

    for (const skill of skills) {
      // Deduplication: workspace > user
      const existing = seenNames.get(skill.name);
      if (existing) {
        if (skill.storage === "workspace" && existing.storage === "user") {
          // Workspace overrides user
          seenNames.set(skill.name, skill);
        }
        // Otherwise keep existing (higher priority)
      } else {
        seenNames.set(skill.name, skill);
      }
    }
  }

  // Convert map to sorted array
  for (const skill of seenNames.values()) {
    allSkills.push(skill);
  }

  // Sort by storage type (workspace first), then by name
  allSkills.sort((a, b) => {
    if (a.storage !== b.storage) {
      return a.storage === "workspace" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const durationInMillis = Date.now() - startTime;
  console.log(
    `[SkillsDiscovery] Found ${allSkills.length} skills in ${durationInMillis}ms`,
  );

  return {
    skills: allSkills,
    sourceFolders,
    durationInMillis,
  };
}
