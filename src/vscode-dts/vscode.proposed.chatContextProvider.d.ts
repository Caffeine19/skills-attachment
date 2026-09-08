/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module "vscode" {
  // https://github.com/microsoft/vscode/issues/271104 @alexr00

  export type TabSelector = { uri: DocumentSelector } | { viewType: string };

  export namespace chat {
    /**
     * Register a chat workspace context provider. Workspace context is automatically included in all chat requests.
     */
    export function registerChatWorkspaceContextProvider(
      id: string,
      provider: ChatWorkspaceContextProvider,
    ): Disposable;

    /**
     * Register a chat explicit context provider. Explicit context items are shown as options when the user explicitly attaches context use the "Add Context" action in the chat input box.
     */
    export function registerChatAttachContextProvider(
      id: string,
      provider: ChatAttachContextProvider,
    ): Disposable;

    /**
     * @deprecated
     */
    export function registerChatExplicitContextProvider(
      id: string,
      provider: any,
    ): Disposable;

    /**
     * Register a chat resource context provider. Resource context is provided for a specific resource.
     */
    export function registerChatTabContextProvider(
      selector: TabSelector,
      id: string,
      provider: ChatTabContextProvider,
    ): Disposable;

    /**
     * @deprecated
     */
    export function registerChatResourceContextProvider(
      selector: DocumentSelector,
      id: string,
      provider: any,
    ): Disposable;
  }

  export interface ChatContextItem {
    iconPath?: IconPath;
    label?: string;
    resourceUri?: Uri;
    modelDescription?: string;
    tooltip?: MarkdownString;
    value?: string;
    command?: Command;
  }

  export interface ChatWorkspaceContextProvider<
    T extends ChatContextItem = ChatContextItem,
  > {
    onDidChangeWorkspaceChatContext?: Event<void>;
    provideWorkspaceChatContext(token: CancellationToken): ProviderResult<T[]>;
  }

  export interface ChatAttachContextProvider<
    T extends ChatContextItem = ChatContextItem,
  > {
    provideAttachChatContext(token: CancellationToken): ProviderResult<T[]>;
    resolveAttachChatContext(
      context: T,
      token: CancellationToken,
    ): ProviderResult<ChatContextItem>;
  }

  export interface ChatTabContextProvider<
    T extends ChatContextItem = ChatContextItem,
  > {
    provideChatTabContext(
      options: { tab: Tab },
      token: CancellationToken,
    ): ProviderResult<T | undefined>;
    resolveChatTabContext(
      context: T,
      token: CancellationToken,
    ): ProviderResult<ChatContextItem>;
  }
}
