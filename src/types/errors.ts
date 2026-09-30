import { Data } from "effect";
import * as vscode from "vscode";

/** Error raised when a SKILL.md file cannot be read or parsed. */
export class SkillFileError extends Data.TaggedError("SkillFileError")<{
  readonly uri: vscode.Uri;
  readonly cause: unknown;
}> {}

/** Error raised when a skill source directory cannot be accessed. */
export class DirectoryAccessError extends Data.TaggedError(
  "DirectoryAccessError",
)<{
  readonly uri: vscode.Uri;
  readonly cause: unknown;
}> {}
