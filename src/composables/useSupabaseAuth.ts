import type { Session } from '@supabase/supabase-js'
import { ref } from 'vue'

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const session = ref<Session | null>(null)
const isInitializing = ref(false)
const isSendingLink = ref(false)
const isSigningOut = ref(false)
const status = ref('')
const error = ref('')

let initializationPromise: Promise<void> | undefined
let hasAuthListener = false

function getEmailRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}

async function initialize(): Promise<void> {
  if (!supabase) return

  initializationPromise ??= (async () => {
    isInitializing.value = true
    error.value = ''

    try {
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) throw sessionError
      session.value = data.session

      if (!hasAuthListener) {
        supabase.auth.onAuthStateChange((_event, nextSession) => {
          session.value = nextSession
        })
        hasAuthListener = true
      }
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '读取登录状态失败'
    } finally {
      isInitializing.value = false
    }
  })()

  await initializationPromise
}

async function sendMagicLink(email: string): Promise<boolean> {
  if (!supabase) {
    error.value = '尚未配置 Supabase'
    return false
  }

  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail) {
    error.value = '请输入邮箱地址'
    return false
  }

  isSendingLink.value = true
  status.value = ''
  error.value = ''

  try {
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: getEmailRedirectUrl(),
        shouldCreateUser: true,
      },
    })

    if (signInError) throw signInError

    status.value = '登录链接已发送，请前往邮箱打开'
    return true
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '发送登录链接失败'
    return false
  } finally {
    isSendingLink.value = false
  }
}

async function signOut(): Promise<void> {
  if (!supabase) return

  isSigningOut.value = true
  status.value = ''
  error.value = ''

  try {
    const { error: signOutError } = await supabase.auth.signOut()

    if (signOutError) throw signOutError
    session.value = null
    status.value = '已退出云同步账户，本地数据仍然保留'
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '退出登录失败'
  } finally {
    isSigningOut.value = false
  }
}

export function useSupabaseAuth() {
  return {
    error,
    initialize,
    isConfigured: isSupabaseConfigured,
    isInitializing,
    isSendingLink,
    isSigningOut,
    sendMagicLink,
    session,
    signOut,
    status,
  }
}
