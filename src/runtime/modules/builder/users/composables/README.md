# builder/users/composables

| File                      | Purpose                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `useUsersData.ts`         | The accounts list: the read from the server (an SSR seed), the state of the section, the counter, the point edits of the rows      |
| `useUsersList.ts`         | The view of the list: the debounced search, the segment filter by whether logging in is possible, the filter counters              |
| `useUsersActions.ts`      | The operations on someone else's account: the role, logging in, deletion — with the confirmations, the toasts and the busy state   |
| `useUsersCreateForm.ts`   | The account creation form: the validation, the password generator, telling the refusals apart (a taken login goes under the field) |
| `useUsersPasswordForm.ts` | The "set a password for someone else" form: one input, the generator, the request with its sending state                           |
| `useUsersRowLabels.ts`    | The texts of an account row: the label, the meta line of dates, the available button names and the reasons behind the bans         |
