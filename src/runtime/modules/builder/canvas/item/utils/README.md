# builder/canvas/item/utils

Pure helpers of a canvas item (with no reactivity).

| File                     | Purpose                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forceRenderSnapshot.ts` | A snapshot of the forceRender prop values for comparison between renders (pairs rather than an object — the prop names arrive out of a brick file)                                                         |
| `platform.ts`            | `isApplePlatform` — whether the shortcut captions of the context menu follow macOS (the client hint first, the user agent string as the fallback: `navigator.platform` is deprecated and sometimes frozen) |
