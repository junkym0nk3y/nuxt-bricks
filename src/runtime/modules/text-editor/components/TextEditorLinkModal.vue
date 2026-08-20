<script setup lang="ts">
/**
 * @description Форма ссылки для выделения в TipTap-редакторе.
 *
 * Монтируется каждой поверхностью редактора отдельно (панель свойств,
 * развёрнутая модалка, inline-оверлей канваса), а не одним экземпляром на
 * приложение: у каждой поверхности свой инстанс редактора, и общая модалка
 * применяла бы ссылку к тому, который к моменту подтверждения уже уничтожен.
 */

// #region Imports
// Types
import type { ITextEditorLinkModalProps, ITextEditorLinkModalEmits } from './types.d.ts';

// Utils
import { normalizeLinkHref } from '../utils/linkHref';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../ui/base/button/BricksButton.vue';
import BricksCheckbox from '../../ui/base/checkbox/BricksCheckbox.vue';
import BricksFieldHint from '../../ui/inputs/BricksFieldHint.vue';
import BricksInput from '../../ui/inputs/BricksInput.vue';
import BricksModal from '../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../ui/base/modal/BricksModalHeader.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITextEditorLinkModalProps>(), {
    canRemove: false,
    layer: 'modal',
});
// #endregion

// #region Emits
const emit = defineEmits<ITextEditorLinkModalEmits>();
// #endregion

// #region Data
/** Потолок длины адреса: дефолт поля (120) режет обычный URL с query. */
const HREF_MAX_LENGTH = 2048;

const { t } = useI18n();

const href = ref<string>('');
const openInNewTab = ref<boolean>(false);

/** Ошибка показывается после попытки применить, а не на каждом набранном символе. */
const isValidationVisible = ref<boolean>(false);
// #endregion

// #region Computed
/** Нормализованный адрес; null — политика ссылок его не пропускает. */
const normalizedHref = computed<string | null>(() => normalizeLinkHref(href.value));

const errorMessage = computed<string | null>(() =>
    isValidationVisible.value && !normalizedHref.value
        ? t('bricks.textEditor.linkModal.invalidUrl')
        : null
);
// #endregion

// #region Methods
/**
 * Применяет ссылку. Пустой или запрещённый адрес показывает ошибку и оставляет
 * форму открытой: молчаливое закрытие читалось бы как «ссылка поставлена».
 */
function handleApply(): void {
    if (!normalizedHref.value) {
        isValidationVisible.value = true;
        return;
    }

    emit('apply', { href: href.value, openInNewTab: openInNewTab.value });
}

/**
 * Снимает ссылку с выделения.
 */
function handleRemove(): void {
    emit('remove');
}

/**
 * Закрывает форму без изменений.
 */
function handleClose(): void {
    emit('close');
}
// #endregion

// #region Lifecycle
// Форма наполняется на каждом открытии: адрес прошлой ссылки, оставшийся в
// полях, применился бы к следующему выделению одним нажатием кнопки
watch(
    () => [props.isOpen, props.value] as const,
    ([isOpen, value]) => {
        if (!isOpen) {
            return;
        }

        href.value = value.href;
        openInNewTab.value = value.openInNewTab;
        isValidationVisible.value = false;
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.textEditor.linkModal.title')"
        :layer="props.layer"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TextEditorLinkModal">
            <BricksModalHeader @close="handleClose" />

            <form :class="$style.form" novalidate @submit.prevent="handleApply">
                <BricksInput
                    :label="t('bricks.textEditor.linkModal.url')"
                    :value="href"
                    :placeholder="t('bricks.textEditor.linkModal.urlPlaceholder')"
                    :error-message="errorMessage"
                    :max-length="HREF_MAX_LENGTH"
                    autocomplete="off"
                    @update:value="(value: string) => (href = value)"
                />

                <BricksCheckbox
                    :value="openInNewTab"
                    :label="t('bricks.textEditor.linkModal.newTab')"
                    name="bricks-link-new-tab"
                    @update:value="(value: boolean) => (openInNewTab = value)"
                />

                <BricksFieldHint>{{ t('bricks.textEditor.linkModal.hint') }}</BricksFieldHint>

                <BricksModalFooter variant="inline">
                    <BricksButton
                        v-if="props.canRemove"
                        size="md"
                        variant="ghost"
                        type="button"
                        @click="handleRemove"
                    >
                        {{ t('bricks.textEditor.linkModal.remove') }}
                    </BricksButton>

                    <BricksButton size="md" variant="primary" type="submit">
                        {{ t('bricks.textEditor.linkModal.apply') }}
                    </BricksButton>
                </BricksModalFooter>
            </form>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TextEditorLinkModal {
    display: flex;
    flex-direction: column;
    width: 44rem;
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.form {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.6rem;
}
</style>
