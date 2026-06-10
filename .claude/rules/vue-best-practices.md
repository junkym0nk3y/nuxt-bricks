# Code Style Rules / Best Practices rules

### Separation of responsibilities

- ✅ **An SFC must not exceed 300–500 lines**: split it into smaller components
- ✅ **Controller components**: handle data, prop drilling, and catch emits from child components
- ✅ **Presentation components (Vue)**: UI only, minimal logic
- ✅ **Use composables for complex logic**: move business logic into `composables/`
- ✅ **Prop drilling > Pinia**: if prop drilling is enough, do NOT create a Pinia store
- ✅ **Comments**: JSDoc comments are required for all functions/methods.
- ❌ **Do NOT multiply stores**: use Pinia only for global state needed across different parts of the app

### Interaction pattern

**Page → Controller → Child components:**

1. **Page**: contains `fetch*` methods for working with the backend
2. **Controller component** (e.g., `FlatList`): handles data, prop drilling, and emits
3. **Child components**: UI only, emit events upward

**Sample of logic:**

<!-- pages/users.vue -->

```vue
<script setup lang="ts">
// #region Imports
// Types
// import type { IUser } from '~/types';
// Vue
import { ref, onMounted } from 'vue';
// #endregion

// #region Data
// Users list fetched from the backend
const users = ref<IUser[]>([]);
// #endregion

// #region Methods
/**
 * Fetches users from the backend API.
 */
async function fetchUsers(): Promise<void> {
    users.value = await $fetch('/api/users');
}

/**
 * Handles user update events coming from the controller component.
 */
async function handleUserUpdate(userId: number, data: IUser): Promise<void> {
    await $fetch(`/api/users/${userId}`, { method: 'PUT', body: data });
    await fetchUsers();
}
// #endregion

onMounted(() => {
    fetchUsers();
});
</script>

<template>
    <UserListController :users="users" @update-user="handleUserUpdate" />
</template>
```

<!-- components/UserListController.vue -->

```vue
<script setup lang="ts">
// #region Imports
// Types
// import type { IUser } from '~/types';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        users: IUser[];
    }>(),
    {}
);
// #endregion

// #region Emits
const emit = defineEmits<{
    'update-user': [userId: number, data: IUser];
}>();
// #endregion

// #region Methods
/**
 * Handles emits from child components and forwards them upward.
 */
function handleUserEdit(userId: number, data: IUser): void {
    emit('update-user', userId, data);
}
// #endregion
</script>

<template>
    <UserCard v-for="user in props.users" :key="user.id" :user="user" @edit="handleUserEdit" />
</template>
```

<!-- components/UserCard.vue -->

```vue
<script setup lang="ts">
// #region Imports
// Types
// import type { IUser } from '~/types';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        user: IUser;
    }>(),
    {}
);
// #endregion

// #region Emits
const emit = defineEmits<{
    edit: [userId: number, data: IUser];
}>();
// #endregion

// #region Methods
/**
 * Emits the edit event for the current user.
 */
function handleEdit(): void {
    emit('edit', props.user.id, props.user);
}
// #endregion
</script>

<template>
    <div :class="$style.UserCard">
        <h3>{{ props.user.name }}</h3>
        <button @click="handleEdit">Edit</button>
    </div>
</template>
```

## Method Naming

- `handle*` — data mutations: `handleToggle`, `handleUpdate`
- `on*` — event handlers: `onClick`, `onChange`
- `fetch*` — API calls: `fetchUser`, `fetchData`

### Comparisons

- ✅ **ALWAYS** use strict comparison `===` and `!==` (NOT `==` or `!=`)
- ✅ **REQUIRED** typing for: function arguments, return values, props, and store state

### Code structure

- ✅ Move "magic" numbers/strings into constants: `const ADULT_AGE = 18`
- ✅ Use mapping objects instead of `switch-case`: `Record<TStatus, string>`
- ✅ Use `enum` for lists of constants
- ✅ Keep shared types in the `types/` folder
- ✅ Keep non-reactive logic in `utils/`

### Best Practices

- ✅ Use **early returns** to improve readability (avoid deep nesting)
- ✅ Prefer **async/await** over `.then()` and always use `try/catch`
- ✅ Use **utility types**: `Omit<>`, `Pick<>`, `Partial<>`, `extends` for working with types
- ✅ **Single-responsibility functions**: each function does one thing
- ✅ Use **type guards** for type checks: `function isUser(item): item is IUser`
- ✅ Use **generics** for reusable logic: `IApiResponse<T>`
- ✅ Use **as const** for constant objects (narrow types instead of wide ones)
- ✅ Use **Promise.all** for parallel requests (NOT sequentially)
- ✅ Prefer **declarative array methods**: `.filter()`, `.map()`, `.reduce()` instead of loops
- ❌ **Do NOT mutate data** directly: use the spread operator `[...array]`, `{...object}`
- ✅ **Clean up resources** in `onUnmounted()`: timers (`clearInterval`), event listeners (`removeEventListener`)
- ✅ Use **IntersectionObserver** for lazy loading/infinite scroll
- ✅ Use **debounce/throttle** for frequent events (search, scroll, resize): use the ones from `@idaproject/core`
