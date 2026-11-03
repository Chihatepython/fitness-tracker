<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { useSupabaseAuth } from '@/composables/useSupabaseAuth'
import {
  getExerciseProfile,
  saveExerciseProfile,
  type ExerciseProfileField,
} from '@/services/exerciseProfiles'

type MuscleWeightItem = {
  muscle: string
  weight: number
}

const props = defineProps<{
  isOpen: boolean
  exerciseId: string
  exerciseName: string
  weights: MuscleWeightItem[]
}>()

const emit = defineEmits<{
  close: []
}>()

const dialog = ref<HTMLDialogElement>()
const description = ref('')
const fields = ref<ExerciseProfileField[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const profileError = ref('')
const profileStatus = ref('')
const { initialize, isConfigured, session } = useSupabaseAuth()

function createEmptyField(): ExerciseProfileField {
  return {
    id: crypto.randomUUID(),
    label: '',
    value: '',
  }
}

async function loadProfile(): Promise<void> {
  description.value = ''
  fields.value = []
  profileError.value = ''
  profileStatus.value = ''

  if (!isConfigured) {
    profileError.value = '尚未配置云端动作备注'
    return
  }

  isLoading.value = true

  try {
    await initialize()

    if (!session.value) {
      profileStatus.value = '登录云同步账户后，可以读取和保存动作备注。'
      return
    }

    if (!navigator.onLine) {
      profileError.value = '当前离线，动作备注暂时无法读取。'
      return
    }

    const profile = await getExerciseProfile(session.value.user.id, props.exerciseId)
    description.value = profile.description
    fields.value = profile.fields
  } catch (error: unknown) {
    profileError.value = error instanceof Error ? error.message : '读取动作备注失败'
  } finally {
    isLoading.value = false
  }
}

function addField(): void {
  fields.value.push(createEmptyField())
}

function removeField(fieldId: string): void {
  fields.value = fields.value.filter((field) => field.id !== fieldId)
}

async function saveProfile(): Promise<void> {
  profileError.value = ''
  profileStatus.value = ''

  if (!session.value) {
    profileError.value = '请先登录云同步账户'
    return
  }

  if (!navigator.onLine) {
    profileError.value = '当前离线，暂时无法保存动作备注。'
    return
  }

  isSaving.value = true

  try {
    await saveExerciseProfile(session.value.user.id, props.exerciseId, {
      description: description.value,
      fields: fields.value,
    })
    fields.value = fields.value.filter((field) => field.label.trim() || field.value.trim())
    profileStatus.value = '动作备注已保存'
  } catch (error: unknown) {
    profileError.value = error instanceof Error ? error.message : '保存动作备注失败'
  } finally {
    isSaving.value = false
  }
}

function requestClose(): void {
  if (isSaving.value) return
  if (dialog.value?.open) dialog.value.close()
  emit('close')
}

function handleDialogClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) requestClose()
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    await nextTick()

    if (isOpen && !dialog.value?.open) {
      dialog.value?.showModal()
      void loadProfile()
    } else if (!isOpen && dialog.value?.open) {
      dialog.value.close()
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <dialog
    ref="dialog"
    class="exercise-weights-dialog"
    @cancel.prevent="requestClose"
    @click="handleDialogClick"
  >
    <div class="exercise-weights-content">
      <header>
        <div>
          <h2>{{ exerciseName }}</h2>
          <p>动作详情</p>
        </div>
        <button type="button" aria-label="关闭动作详情" @click="requestClose">×</button>
      </header>

      <section class="exercise-detail-section">
        <h3>肌肉分权</h3>
        <div class="exercise-weight-lines">
          <p v-for="item in weights" :key="item.muscle">
            <span>{{ item.muscle }}</span>
            <strong>×{{ item.weight }}</strong>
          </p>
        </div>
      </section>

      <section class="exercise-detail-section profile-section">
        <div class="section-title-row">
          <h3>我的备注</h3>
          <span v-if="isLoading">读取中…</span>
        </div>

        <template v-if="session">
          <label>
            <span>说明</span>
            <textarea
              v-model="description"
              rows="3"
              placeholder="例如：保持肩胛稳定，座椅略低"
              :disabled="isLoading || isSaving"
            />
          </label>

          <div class="profile-fields">
            <div v-for="field in fields" :key="field.id" class="profile-field-row">
              <input
                v-model="field.label"
                aria-label="参数名称"
                placeholder="参数，例如靠背位置"
                :disabled="isLoading || isSaving"
              />
              <input
                v-model="field.value"
                aria-label="参数值"
                placeholder="值，例如3"
                :disabled="isLoading || isSaving"
              />
              <button
                type="button"
                aria-label="删除这一行参数"
                :disabled="isSaving"
                @click="removeField(field.id)"
              >
                ×
              </button>
            </div>
          </div>

          <button
            class="add-profile-field"
            type="button"
            :disabled="isLoading || isSaving"
            @click="addField"
          >
            ＋ 添加参数
          </button>

          <button
            class="save-profile-button"
            type="button"
            :disabled="isLoading || isSaving"
            @click="saveProfile"
          >
            {{ isSaving ? '保存中…' : '保存备注' }}
          </button>
        </template>

        <p v-if="profileStatus" class="profile-message" role="status">{{ profileStatus }}</p>
        <p v-if="profileError" class="profile-error" role="alert">{{ profileError }}</p>
      </section>
    </div>
  </dialog>
</template>

<style scoped>
.exercise-weights-dialog {
  width: min(calc(100% - 40px), 380px);
  max-height: min(82dvh, 720px);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 20px;
  outline: none;
  background: #f8faf5;
  color: #17211a;
  box-shadow: 0 24px 80px rgb(13 31 20 / 30%);
}

.exercise-weights-dialog::backdrop {
  background: rgb(11 22 15 / 55%);
  backdrop-filter: blur(3px);
}

.exercise-weights-content {
  max-height: min(82dvh, 720px);
  overflow-y: auto;
  padding: 22px;
}

.exercise-weights-content header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.exercise-weights-content h2 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: -0.03em;
}

.exercise-weights-content header p {
  margin: 5px 0 0;
  color: #718078;
  font-size: 0.78rem;
  font-weight: 700;
}

.exercise-weights-content header button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  padding: 0 0 2px;
  border: 1px solid #d5ddd1;
  border-radius: 50%;
  background: #fff;
  color: #536158;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.exercise-detail-section {
  margin-top: 18px;
}

.exercise-detail-section h3 {
  margin: 0 0 10px;
  color: #405148;
  font-size: 0.82rem;
}

.exercise-weight-lines p {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
  padding: 6px 2px;
  color: #536158;
  font-size: 0.9rem;
}

.exercise-weight-lines strong {
  flex: none;
  color: #214c30;
  font-variant-numeric: tabular-nums;
}

.profile-section {
  padding-top: 16px;
  border-top: 1px solid #dce3d8;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title-row span,
.profile-message,
.profile-error {
  margin: 0;
  font-size: 0.78rem;
}

.section-title-row span,
.profile-message {
  color: #718078;
}

.profile-section label {
  display: grid;
  gap: 7px;
  color: #536158;
  font-size: 0.78rem;
  font-weight: 700;
}

.profile-section textarea,
.profile-section input {
  width: 100%;
  border: 1px solid #d5ddd1;
  border-radius: 11px;
  outline: none;
  background: #fff;
  color: #17211a;
  font: inherit;
}

.profile-section textarea {
  resize: vertical;
  min-height: 82px;
  padding: 10px 12px;
  line-height: 1.45;
}

.profile-section input {
  min-width: 0;
  min-height: 42px;
  padding: 8px 10px;
}

.profile-section textarea:focus,
.profile-section input:focus {
  border-color: #3f704e;
  box-shadow: 0 0 0 3px rgb(63 112 78 / 13%);
}

.profile-fields {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.profile-field-row {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr) 32px;
  gap: 7px;
}

.profile-field-row button {
  width: 32px;
  height: 32px;
  align-self: center;
  padding: 0 0 2px;
  border: 0;
  background: transparent;
  color: #89938d;
  font-size: 1.15rem;
}

.add-profile-field,
.save-profile-button {
  width: 100%;
  min-height: 42px;
  margin-top: 10px;
  border-radius: 11px;
  font: inherit;
  font-weight: 800;
}

.add-profile-field {
  border: 1px dashed #bfcbb9;
  background: #f4f7f1;
  color: #536158;
}

.save-profile-button {
  border: 0;
  background: #183f2b;
  color: #fff;
}

.add-profile-field:disabled,
.save-profile-button:disabled,
.profile-field-row button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.profile-message,
.profile-error {
  margin-top: 10px;
}

.profile-error {
  color: #a52d2d;
}

@media (max-width: 430px) {
  .exercise-weights-dialog {
    width: calc(100% - 28px);
    max-height: calc(100dvh - 28px);
  }

  .exercise-weights-content {
    max-height: calc(100dvh - 28px);
  }
}
</style>
