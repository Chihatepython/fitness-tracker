<script setup lang="ts">
import { computed, ref } from 'vue'

import { useSupabaseAuth } from '@/composables/useSupabaseAuth'
import { useTrainingSync } from '@/composables/useTrainingSync'

const email = ref('')
const otp = ref('')
const isAwaitingOtp = ref(false)

const {
  error,
  isConfigured,
  isInitializing,
  isSendingOtp,
  isSigningOut,
  isVerifyingOtp,
  sendEmailOtp,
  session,
  signOut,
  status,
  verifyEmailOtp,
} = useSupabaseAuth()

const {
  error: syncError,
  isSyncing,
  lastSyncedAt,
  pendingCount,
  status: syncStatus,
  syncNow,
} = useTrainingSync()

const accountEmail = computed(() => session.value?.user.email ?? '已登录账户')
const lastSyncLabel = computed(() => {
  if (!lastSyncedAt.value) return '尚未完成同步'

  return `上次同步 ${new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(lastSyncedAt.value)}`
})

async function submitEmail(): Promise<void> {
  const wasSent = await sendEmailOtp(email.value)

  if (wasSent) {
    isAwaitingOtp.value = true
    otp.value = ''
  }
}

async function submitOtp(): Promise<void> {
  const wasVerified = await verifyEmailOtp(email.value, otp.value)

  if (wasVerified) {
    isAwaitingOtp.value = false
    otp.value = ''
  }
}
</script>

<template>
  <section class="dashboard-section" aria-labelledby="cloud-sync-title">
    <header class="dashboard-section-heading">
      <h2 id="cloud-sync-title">云同步</h2>
    </header>

    <div class="dashboard-card cloud-sync-card">
      <div v-if="session" class="cloud-status-row">
        <span class="cloud-status-pill">已登录</span>
      </div>
      <p class="cloud-sync-description">
        训练记录优先保存在本机；断网时可正常使用，联网后自动与云端同步。
      </p>

      <p v-if="!isConfigured" class="cloud-sync-error" role="alert">
        尚未配置 Supabase，现有本地功能不受影响。
      </p>

      <p v-else-if="isInitializing" class="cloud-sync-message" role="status">正在读取登录状态…</p>

      <template v-else-if="session">
        <p class="cloud-account">{{ accountEmail }}</p>
        <div class="cloud-sync-summary">
          <span>{{ lastSyncLabel }}</span>
          <span v-if="pendingCount">待同步 {{ pendingCount }} 项</span>
          <span v-else>本机与云端一致</span>
        </div>
        <button class="cloud-primary-button" type="button" :disabled="isSyncing" @click="syncNow">
          {{ isSyncing ? '同步中…' : '立即同步' }}
        </button>
        <button
          class="cloud-secondary-button"
          type="button"
          :disabled="isSigningOut"
          @click="signOut"
        >
          {{ isSigningOut ? '退出中…' : '退出登录' }}
        </button>
      </template>

      <div v-else-if="isConfigured" class="cloud-login-form">
        <form @submit.prevent="submitEmail">
          <label for="cloud-email">邮箱</label>
          <div class="cloud-login-row">
            <input
              id="cloud-email"
              v-model="email"
              autocomplete="email"
              inputmode="email"
              name="email"
              placeholder="name@example.com"
              type="email"
              :disabled="isSendingOtp || isVerifyingOtp"
              required
            />
            <button type="submit" :disabled="isSendingOtp || isVerifyingOtp">
              {{ isSendingOtp ? '发送中…' : isAwaitingOtp ? '重新发送' : '发送验证码' }}
            </button>
          </div>
        </form>

        <form v-if="isAwaitingOtp" class="cloud-otp-form" @submit.prevent="submitOtp">
          <label for="cloud-otp">邮件验证码</label>
          <div class="cloud-login-row">
            <input
              id="cloud-otp"
              v-model="otp"
              autocomplete="one-time-code"
              inputmode="numeric"
              maxlength="10"
              name="otp"
              pattern="[0-9]{6,10}"
              placeholder="邮件验证码"
              type="text"
              :disabled="isVerifyingOtp"
              required
            />
            <button type="submit" :disabled="isVerifyingOtp">
              {{ isVerifyingOtp ? '验证中…' : '确认登录' }}
            </button>
          </div>
        </form>
      </div>

      <p v-if="!session && pendingCount" class="cloud-sync-message" role="status">
        本机有 {{ pendingCount }} 项修改，登录后将自动上传。
      </p>

      <p v-if="status" class="cloud-sync-message" role="status">{{ status }}</p>
      <p v-if="error" class="cloud-sync-error" role="alert">{{ error }}</p>
      <p v-if="syncStatus" class="cloud-sync-message" role="status">{{ syncStatus }}</p>
      <p v-if="syncError" class="cloud-sync-error" role="alert">{{ syncError }}</p>
    </div>
  </section>
</template>

<style scoped>
.cloud-sync-card {
  color: #263a2d;
}

.cloud-status-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.cloud-status-pill {
  padding: 5px 10px;
  border-radius: var(--radius-pill);
  background: #edf4e9;
  color: #46634d;
  font-size: var(--text-caption);
  font-weight: 800;
}

.cloud-sync-description {
  margin: 0;
  color: #718078;
  font-size: var(--text-body);
  line-height: 1.55;
}

.cloud-login-form,
.cloud-account {
  margin-top: 14px;
}

.cloud-login-form label {
  display: block;
  margin-bottom: 7px;
  color: #52635a;
  font-size: var(--text-body);
  font-weight: 800;
}

.cloud-otp-form {
  margin-top: 12px;
}

#cloud-otp {
  letter-spacing: 0.14em;
  font-variant-numeric: tabular-nums;
}

.cloud-login-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.cloud-login-row input,
.cloud-login-row button,
.cloud-primary-button,
.cloud-secondary-button {
  min-height: 44px;
  border: 1px solid #d5ddd1;
  border-radius: var(--radius-control);
  font: inherit;
}

.cloud-login-row input {
  min-width: 0;
  padding: 0 12px;
  background: #f8faf6;
  color: #263a2d;
}

.cloud-login-row button,
.cloud-primary-button,
.cloud-secondary-button {
  padding: 0 14px;
  background: #edf4e9;
  color: #46634d;
  font-size: var(--text-body);
  font-weight: 800;
  cursor: pointer;
}

.cloud-secondary-button {
  width: 100%;
  background: #fff;
}

.cloud-primary-button {
  width: 100%;
  margin-bottom: 8px;
  border-color: #b9cbb6;
}

.cloud-login-row button:disabled,
.cloud-primary-button:disabled,
.cloud-secondary-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.cloud-account {
  margin-bottom: 10px;
  font-size: var(--text-body);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.cloud-sync-summary {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: -2px 2px 12px;
  color: #718078;
  font-size: var(--text-caption);
}

.cloud-sync-message,
.cloud-sync-error {
  margin: 10px 2px 0;
  font-size: var(--text-body);
  text-align: center;
}

.cloud-sync-message {
  color: #46634d;
}

.cloud-sync-error {
  color: #a52d2d;
}

@media (max-width: 420px) {
  .cloud-login-row {
    grid-template-columns: 1fr;
  }
}
</style>
