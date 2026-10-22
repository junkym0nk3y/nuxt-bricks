# builder/app/utils

| File                        | Purpose                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `componentLibraryItems.ts`  | A library card out of a manifest entry: the description, the slots and the `defaultProps` out of `values`               |
| `componentLibraryPolicy.ts` | Recognizing the SSR deadline error of the manifest request (degradation instead of a failed load)                       |
| `draftStorageNotice.ts`     | A once-per-session message about the drafts storage being unavailable (latched by token, put out when the page is left) |
| `sessionGuards.ts`          | Actions only into a consistent session: the handler wrapper and the wait for readiness before a save                    |
| `sessionLock.ts`            | What the loader, the refused bootstrap and an unready session close: the toolbar with the pointer, or the working area  |
