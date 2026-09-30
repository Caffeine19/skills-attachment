import * as vscode from "vscode";
import * as path from "path";
import { Effect } from "effect";
import { logger } from "./utils/logger.js";
import { DirectoryAccessError, SkillFileError } from "./types/errors.js";
import type {
  DiscoveredSkill,
  SkillDiscoveryResult,
  SkillStorage,
} from "./types/skill.js";

/** Default skill source folders matching VS Code's built-in locations. */
const DEFAULT_SKILL_SOURCE_FOLDERS = [
  { path: ".agents/skills", storage: "workspace" as const },
  { path: ".github/skills", storage: "workspace" as const },
  { path: ".claude/skills", storage: "workspace" as const },
  { path: "~/.agents/skills", storage: "user" as const },
  { path: "~/.copilot/skills", storage: "user" as const },
  { path: "~/.claude/skills", storage: "user" as const },
];

/**
 * Parse YAML frontmatter from a Markdown file content. Simple parser that
 * handles key: value pairs at the beginning of the file.
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

/** Get the skill folder name from a SKILL.md URI. */
/**
 * Extract a string value from frontmatter, returning undefined if the value is
 * not a string.
 */
function getStringValue(
  frontmatter: Record<string, string | boolean | undefined>,
  key: string,
): string | undefined {
  const value = frontmatter[key];
  return typeof value === "string" ? value : undefined;
}

function getSkillFolderName(uri: vscode.Uri): string {
  const parts = uri.path.split("/");
  // SKILL.md is inside the skill folder, so go up one level
  return parts[parts.length - 2] || "";
}

/**
 * Read and parse a SKILL.md file (Effect version). Fails with SkillFileError on
 * read failure; succeeds with null when the skill should be skipped (not
 * user-invocable).
 */
const parseSkillFileEffect = (
  uri: vscode.Uri,
  storage: "workspace" | "user",
  workspaceFolder?: string,
): Effect.Effect<DiscoveredSkill | null, SkillFileError> =>
  Effect.gen(function* () {
    const contentBytes = yield* Effect.tryPromise({
      try: () => vscode.workspace.fs.readFile(uri),
      catch: (cause) => new SkillFileError({ uri, cause }),
    });
    const content = Buffer.from(contentBytes).toString("utf-8");
    const frontmatter = parseFrontmatter(content);

    const folderName = getSkillFolderName(uri);
    const name = getStringValue(frontmatter, "name") || folderName;
    const description = getStringValue(frontmatter, "description");
    const userInvocable = frontmatter["user-invocable"] !== false;
    const disableModelInvocation =
      frontmatter["disable-model-invocation"] === true;
    const argumentHint = getStringValue(frontmatter, "argument-hint");

    // Skip if user-invocable is explicitly false
    if (!userInvocable) {
      return null;
    }

    // Validate name matches folder name
    if (name !== folderName) {
      logger.warn(
        `Skill name "${name}" does not match folder name "${folderName}", using folder name: ${uri}`,
      );
      return {
        name: folderName,
        description,
        userInvocable,
        disableModelInvocation,
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
      disableModelInvocation,
      argumentHint,
      uri,
      storage,
      workspaceFolder,
      displayPath:
        storage === "user"
          ? uri.path.replace(/^\/Users\/[^/]+/, "~")
          : vscode.workspace.asRelativePath(uri),
    };
  });

/**
 * Resolve a skill source folder path to a URI. Logs and returns null on
 * failure.
 */
async function resolveSourceFolder(
  folderPath: string,
  storage: "workspace" | "user",
  workspaceFolder?: vscode.WorkspaceFolder,
): Promise<vscode.Uri | null> {
  return Effect.runPromise(
    Effect.try({
      try: () => {
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
      },
      catch: (cause) => cause,
    }).pipe(
      Effect.catchAll((cause) => {
        logger.error(`Failed to resolve path: ${folderPath}`, cause);
        return Effect.succeed(null);
      }),
    ),
  );
}

/**
 * Scan a directory for SKILL.md files (Effect version). Missing directories or
 * missing SKILL.md files are treated as empty results.
 */
const scanDirectoryEffect = (
  dirUri: vscode.Uri,
  storage: "workspace" | "user",
  workspaceFolder?: string,
): Effect.Effect<DiscoveredSkill[], DirectoryAccessError> =>
  Effect.gen(function* () {
    // Check if directory exists
    yield* Effect.tryPromise({
      try: () => vscode.workspace.fs.stat(dirUri),
      catch: (cause) => new DirectoryAccessError({ uri: dirUri, cause }),
    });

    // Read directory contents
    const entries = yield* Effect.tryPromise({
      try: () => vscode.workspace.fs.readDirectory(dirUri),
      catch: (cause) => new DirectoryAccessError({ uri: dirUri, cause }),
    });

    const skills: DiscoveredSkill[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }

      const skillMdUri = vscode.Uri.joinPath(dirUri, name, "SKILL.md");

      // Check if SKILL.md exists; missing files are skipped
      const stat = yield* Effect.tryPromise({
        try: () => vscode.workspace.fs.stat(skillMdUri),
        catch: (cause) => new DirectoryAccessError({ uri: skillMdUri, cause }),
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
      if (!stat) {
        continue;
      }

      const skill = yield* parseSkillFileEffect(
        skillMdUri,
        storage,
        workspaceFolder,
      ).pipe(
        // Parse failures are logged and skipped
        Effect.catchAll((error) => {
          logger.error(`Failed to parse skill file: ${error.uri}`, error.cause);
          return Effect.succeed(null);
        }),
      );
      if (skill) {
        skills.push(skill);
      }
    }

    return skills;
  });

/**
 * Scan a directory for SKILL.md files. Returns an empty array when the
 * directory is missing or unreadable.
 */
async function scanDirectory(
  dirUri: vscode.Uri,
  storage: "workspace" | "user",
  workspaceFolder?: string,
): Promise<DiscoveredSkill[]> {
  const emptyResult: DiscoveredSkill[] = [];
  return Effect.runPromise(
    scanDirectoryEffect(dirUri, storage, workspaceFolder).pipe(
      Effect.catchAll(() =>
        // Directory doesn't exist or can't be read, skip
        Effect.succeed(emptyResult),
      ),
    ),
  );
}

/**
 * Map a VS Code ChatSkill (from vscode.chat.getSkills) to our DiscoveredSkill.
 * This is the preferred discovery path as it covers all 5 sources: local
 * (workspace), user, extension, plugin, and builtin.
 */
function mapChatSkill(skill: vscode.ChatSkill): DiscoveredSkill {
  const storage: SkillStorage =
    skill.source === "local" ? "workspace" : skill.source;
  return {
    name: skill.name,
    description: skill.description,
    userInvocable: skill.userInvocable !== false,
    disableModelInvocation: skill.disableModelInvocation,
    argumentHint: undefined,
    uri: skill.uri,
    storage,
    workspaceFolder: undefined,
    displayPath:
      storage === "user"
        ? skill.uri.path.replace(/^\/Users\/[^/]+/, "~")
        : vscode.workspace.asRelativePath(skill.uri),
  };
}

/**
 * Discover skills using VS Code's built-in discovery API
 * (vscode.chat.getSkills). Covers all sources: workspace, user,
 * extension-contributed, plugin, and builtin. Returns undefined when the API is
 * not available (proposed API not enabled).
 */
async function discoverSkillsViaApi(
  token?: vscode.CancellationToken,
): Promise<DiscoveredSkill[] | undefined> {
  if (typeof vscode.chat?.getSkills !== "function") {
    return undefined;
  }
  const chatSkills = await vscode.chat.getSkills(
    token ?? new vscode.CancellationTokenSource().token,
  );
  return chatSkills.map(mapChatSkill);
}

/**
 * Discover all Skills from configured source folders. Prefers VS Code's
 * built-in discovery API (covers builtin/extension/plugin skills), falling back
 * to disk scanning when the API is unavailable.
 */
export async function discoverSkills(
  token?: vscode.CancellationToken,
): Promise<SkillDiscoveryResult> {
  const startTime = Date.now();

  // Preferred path: VS Code's own skill discovery (covers all 5 sources)
  try {
    const apiSkills = await discoverSkillsViaApi(token);
    if (apiSkills !== undefined) {
      const durationInMillis = Date.now() - startTime;
      logger.log(
        `[api] Found ${apiSkills.length} skills in ${durationInMillis}ms`,
      );
      return {
        skills: sortSkills(apiSkills),
        sourceFolders: [],
        durationInMillis,
      };
    }
    logger.log("[api] getSkills unavailable, falling back to disk scan");
  } catch (error) {
    logger.error("[api] getSkills failed, falling back to disk scan:", error);
  }

  // Fallback: scan skill directories on disk
  return discoverSkillsFromDisk(token);
}

/**
 * Sort skills by storage priority (workspace > user > plugin > extension >
 * builtin), then by name.
 */
function sortSkills(skills: DiscoveredSkill[]): DiscoveredSkill[] {
  const priority: Record<SkillStorage, number> = {
    workspace: 0,
    user: 1,
    plugin: 2,
    extension: 3,
    builtin: 4,
  };
  return [...skills].sort((a, b) => {
    const p = priority[a.storage] - priority[b.storage];
    return p !== 0 ? p : a.name.localeCompare(b.name);
  });
}

/**
 * Discover Skills by scanning the filesystem (fallback path). Only covers
 * workspace and user directories.
 */
async function discoverSkillsFromDisk(
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

  // Sort by storage priority (workspace first), then by name
  const sorted = sortSkills(allSkills);

  const durationInMillis = Date.now() - startTime;
  logger.log(`[disk] Found ${sorted.length} skills in ${durationInMillis}ms`);

  return {
    skills: sorted,
    sourceFolders,
    durationInMillis,
  };
}
