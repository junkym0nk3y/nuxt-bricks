# builder/auth/composables

| File                     | Purpose                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `useAuthSession.ts`      | The client session of database-auth: `isDatabaseMode`, `login`, `logout`, `fetchMe`                       |
| `useAuthLoginForm.ts`    | The form of the login page: vee-validate, mapping the errors by statusCode, the redirect                  |
| `useAuthProfile.ts`      | The session's profile (name, login, role, photo) and editing it: the name, the avatar, one's own password |
| `useAuthProfileModal.ts` | The mount latch and the openness of the profile modal — shared by the dashboard and the builder           |
| `useAuthAvatarCrop.ts`   | Cropping a photo: decoding the file, the scale, the shift, the frame in the pixels of the original        |
