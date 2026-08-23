# builder/auth/utils

| File                  | Purpose                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `redirects.ts`        | `sanitizeRedirectPath()` — internal paths only, a guard against an open redirect                                             |
| `validationSchema.ts` | Yup schema factories for the login, the profile and the change of one's own password (the messages are functions over `t()`) |
| `avatarCropFrame.ts`  | The pure math of the crop frame: the clamps, the ceiling on the scale, the minimum side                                      |
| `profileErrors.ts`    | The refusals of the profile endpoints → i18n keys (an avatar is told apart by status, a password by the refusal code)        |
