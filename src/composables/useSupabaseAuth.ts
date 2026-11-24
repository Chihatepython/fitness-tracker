import type { Session } from '@supabase/supabase-js'
import { ref } from 'vue'

import { isGoogleSignInEnabled, isSupabaseConfigured, supabase } from '@/lib/supabase'

const session = ref<Session | null>(null)
const isInitializing = ref(false)
const isSigningInWithGoogle = ref(false)
const isSendingOtp = ref(false)
const isVerifyingOtp = ref(false)
const isSigningOut = ref(false)
const status = ref('')
const error = ref('')

let initializationPromise: Promise<void> | undefined
let hasAuthListener = false

async function initialize(): Promise<void> {
  if (!supabase) return

  initializationPromise ??= (async () => {
    isInitializing.value = true
    error.value = ''

    try {
      const redirectUrl = new URL(window.location.href)
      const isOAuthReturn =
        redirectUrl.searchParams.has('code') ||
        redirectUrl.searchParams.has('error_code') ||
        new URLSearchParams(redirectUrl.hash.slice(1)).has('error_code')
      const { error: callbackError } = await supabase.auth.initialize()
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) throw sessionError
      session.value = data.session
      if (callbackError || (isOAuthReturn && !data.session)) {
        error.value = '登录未完成，请在最初发起登录的浏览器或 PWA 中重试。'
      }

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

async function signInWithGoogle(redirectTo: string): Promise<void> {
  if (!supabase || isSigningInWithGoogle.value) return

  isSigningInWithGoogle.value = true
  status.value = ''
  error.value = ''

  try {
    if (!window.isSecureContext) {
      throw new Error('Google 登录需要 HTTPS，请使用正式网址或电脑上的 localhost。')
    }
    if (!(await isGoogleSignInEnabled())) {
      throw new Error('Google 登录尚未启用，暂时可以用邮箱验证码登录。')
    }

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
    if (signInError) throw signInError
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '无法打开 Google 登录'
  } finally {
    isSigningInWithGoogle.value = false
  }
}

async function sendEmailOtp(email: string): Promise<boolean> {
  if (!supabase) {
    error.value = '尚未配置 Supabase'
    return false
  }

  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail) {
    error.value = '请输入邮箱地址'
    return false
  }

  isSendingOtp.value = true
  status.value = ''
  error.value = ''

  try {
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    })

    if (signInError) throw signInError

    status.value = '六位登录验证码已发送，请返回这里输入验证码'
    return true
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '发送登录验证码失败'
    return false
  } finally {
    isSendingOtp.value = false
  }
}

async function verifyEmailOtp(email: string, token: string): Promise<boolean> {
  if (!supabase) {
    error.value = '尚未配置 Supabase'
    return false
  }

  const normalizedEmail = email.trim().toLowerCase()
  const normalizedToken = token.replace(/\D/g, '')

  if (!normalizedEmail) {
    error.value = '请输入接收验证码的邮箱地址'
    return false
  }

  if (normalizedToken.length < 6 || normalizedToken.length > 10) {
    error.value = '请输入邮件中的验证码'
    return false
  }

  isVerifyingOtp.value = true
  status.value = ''
  error.value = ''

  try {
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: 'email',
    })

    if (verifyError) throw verifyError
    if (!data.session) throw new Error('验证码已验证，但没有取得登录状态')

    session.value = data.session
    status.value = '登录成功，正在同步本机训练记录'
    return true
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : '验证码验证失败'
    return false
  } finally {
    isVerifyingOtp.value = false
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
    isSendingOtp,
    isSigningInWithGoogle,
    isSigningOut,
    isVerifyingOtp,
    sendEmailOtp,
    session,
    signInWithGoogle,
    signOut,
    status,
    verifyEmailOtp,
  }
}
