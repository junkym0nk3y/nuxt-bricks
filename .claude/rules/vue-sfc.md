# Vue 3 / Nuxt 3 Composition API Guidelines

## Script Section Order (strict)

```vue
<script setup lang="ts">
// #region Imports
// Types
// Example - typings interfaces in *d.ts
import type { IProps, IUser } from '../types';

// Utils
// Example - local utilities with reusable logic
import { formatDate } from '../utils';

// Vue
// Example - Vue hooks
import { ref, computed, onMounted } from 'vue';

// Pinia
// Example - store
import { useUserStore } from '../stores/user';

// Components
// Example - Vue SFC components that don't have auto-import via nuxt-components
import UserCard from '../components/UserCard.vue';
// #endregion

// #region Interfaces
// Example - very rarely, but interfaces should preferably be stored in *d.ts files
// interface ILocalData {
//     count: number;
//     items: string[];
// }
// #endregion

// #region Props
// Example - example. withDefaults is required, as well as the props constant
const props = withDefaults(defineProps<IProps>(), {
    isActive: true,
});
// #endregion

// #region Emits
// Example - example using defineEmits, also required
const emit = defineEmits<IEmits>();
// #endregion

// #region Data
// Example - storing constants and reactive data
const user = ref<IUser | null>(null);
const isLoading = ref(false);
// #endregion

// #region Computed
// Example - computed methods. They can be above or below the Methods section,
// the main thing is not to break the rule of using something before it's declared
const fullName = computed(() =>
    user.value ? `${user.value.firstName} ${user.value.lastName}` : ''
);
// #endregion

// #region Methods
// Example - methods. Use non-arrow functions. With typing and a short logic description.
// Complex logic with variables, etc. should be documented in jsDoc format.
/**
 * Loads user data from API
 */
async function loadUser(): Promise<void> {
    isLoading.value = true;
    try {
        user.value = await $fetch(`/api/users/${props.userId}`);
        emit('update', user.value);
    } finally {
        isLoading.value = false;
    }
}
// #endregion

// #region Lifecycle
onMounted(() => {
    loadUser();
});
// #endregion
</script>
```

### Important rules:

1. #region comments are required for code grouping, but remove empty #region blocks.
2. The #region order is strictly fixed: Imports → Interfaces → Props → Emits → Data. But you Computed - They can be above or below the Methods section.
3. If a section isn’t used (e.g., there are no Props), remove that #region block entirely.
4. CRITICALLY IMPORTANT: In the template, always use props.propertyName to access props, NOT just propertyName. This prevents the ESLint error: "props" is assigned a value but never used.
