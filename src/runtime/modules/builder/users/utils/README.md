# builder/users/utils

| File                   | Purpose                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `userErrors.ts`        | Telling the refusals of the account endpoints apart: a code → a text, the signs of a taken login and of a stale list             |
| `userFormatting.ts`    | The label of an account (the name or the login), the creation date and the relative date of the last login                       |
| `passwordGenerator.ts` | A password generator over Web Crypto: an alphabet with no visually indistinguishable characters, with no skew of the frequencies |
| `validationSchema.ts`  | The yup schemas of the section's forms: the bounds of the login, the name and the password come out of the shared constants      |
