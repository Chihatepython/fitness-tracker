import { supabase } from '@/lib/supabase'

export interface ExerciseProfileField {
  id: string
  label: string
  value: string
}

export interface ExerciseProfile {
  description: string
  fields: ExerciseProfileField[]
}

interface ExerciseProfileRow {
  description: string | null
  fields: unknown
}

function createFieldId(): string {
  return crypto.randomUUID()
}

function normalizeFields(value: unknown): ExerciseProfileField[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []

    const record = item as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label : ''
    const fieldValue = typeof record.value === 'string' ? record.value : ''

    if (!label && !fieldValue) return []

    return [
      {
        id: typeof record.id === 'string' && record.id ? record.id : createFieldId(),
        label,
        value: fieldValue,
      },
    ]
  })
}

export async function getExerciseProfile(
  userId: string,
  exerciseId: string,
): Promise<ExerciseProfile> {
  if (!supabase) throw new Error('尚未配置 Supabase')

  const { data, error } = await supabase
    .from('exercise_profiles')
    .select('description,fields')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .maybeSingle()

  if (error) throw error

  const row = data as ExerciseProfileRow | null

  return {
    description: row?.description ?? '',
    fields: normalizeFields(row?.fields),
  }
}

export async function saveExerciseProfile(
  userId: string,
  exerciseId: string,
  profile: ExerciseProfile,
): Promise<void> {
  if (!supabase) throw new Error('尚未配置 Supabase')

  const fields = profile.fields
    .map((field) => ({
      id: field.id || createFieldId(),
      label: field.label.trim(),
      value: field.value.trim(),
    }))
    .filter((field) => field.label || field.value)

  const { error } = await supabase.from('exercise_profiles').upsert(
    {
      user_id: userId,
      exercise_id: exerciseId,
      description: profile.description.trim(),
      fields,
    },
    { onConflict: 'user_id,exercise_id' },
  )

  if (error) throw error
}
