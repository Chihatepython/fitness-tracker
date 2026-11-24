import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          persistSession: true,
          storageKey: 'fitness-tracker:supabase-auth',
        },
      })
    : undefined

// During the rollout, avoid navigating away to an unconfigured provider's error page.
export async function isGoogleSignInEnabled(): Promise<boolean> {
  if (!supabaseUrl || !supabasePublishableKey) return false

  const response = await fetch(new URL('/auth/v1/settings', supabaseUrl), {
    headers: { apikey: supabasePublishableKey },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('暂时无法读取登录设置，请稍后再试。')

  const settings: { external?: { google?: boolean } } = await response.json()
  return settings.external?.google === true
}
