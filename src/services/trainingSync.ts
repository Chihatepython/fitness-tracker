import {
  TRAINING_DATA_SYNCED_EVENT,
  applyRemoteTrainingSet,
  claimUnassignedTrainingSetOutboxEntries,
  createTrainingSetId,
  createTrainingSetSyncMetaKey,
  ensureLocalTrainingSetsQueuedForSync,
  getAllTrainingSetSyncMeta,
  getAllTrainingSetOutboxEntries,
  recordTrainingSetOutboxFailure,
  removeTrainingSetOutboxEntryIfUnchanged,
  setSyncState,
  type TrainingSet,
  type TrainingSetOutboxEntry,
  type TrainingSetSyncMeta,
} from '@/database'
import { supabase } from '@/lib/supabase'

const CLOUD_COLUMNS =
  'id,user_id,exercise_id,training_date,weight_kg,reps,rir,performed_at,created_at,updated_at,deleted_at,version,device_id'
const DEVICE_ID_KEY = 'fitness-tracker:sync-device-id'
const INSERT_BATCH_SIZE = 100
const READ_PAGE_SIZE = 500

interface CloudTrainingSetRow {
  id: string
  user_id: string
  exercise_id: string
  training_date: string
  weight_kg: number | string
  reps: number
  rir: number
  performed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  version: number | string
  device_id: string | null
}

interface CloudTrainingSetWrite {
  id: string
  user_id: string
  exercise_id: string
  training_date: string
  weight_kg: number
  reps: number
  rir: number
  performed_at: string | null
  created_at: string
  deleted_at: string | null
  device_id: string
}

export interface TrainingSyncResult {
  pulled: number
  pushed: number
  conflicts: number
  pending: number
  lastSyncedAt: number
}

function getDeviceId(): string {
  const existingDeviceId = localStorage.getItem(DEVICE_ID_KEY)

  if (existingDeviceId) return existingDeviceId

  const deviceId = createTrainingSetId()
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
  return deviceId
}

function asCloudRows(value: unknown): CloudTrainingSetRow[] {
  if (!Array.isArray(value)) return []
  return value as CloudTrainingSetRow[]
}

function getRemoteVersion(row: CloudTrainingSetRow): number {
  return Number(row.version)
}

function getRemoteMeta(row: CloudTrainingSetRow): TrainingSetSyncMeta {
  return {
    key: createTrainingSetSyncMetaKey(row.user_id, row.id),
    accountId: row.user_id,
    entityId: row.id,
    remoteVersion: getRemoteVersion(row),
    remoteUpdatedAt: row.updated_at,
    remoteDeletedAt: row.deleted_at ?? undefined,
    remoteDeviceId: row.device_id ?? undefined,
  }
}

function getLocalTrainingSet(row: CloudTrainingSetRow): TrainingSet | undefined {
  if (row.deleted_at) return undefined

  const performedAt = row.performed_at ?? row.created_at
  const createdAt = Date.parse(performedAt)

  return {
    id: row.id,
    date: row.training_date,
    exerciseId: row.exercise_id as TrainingSet['exerciseId'],
    weightKg: Number(row.weight_kg),
    reps: Number(row.reps),
    rir: Number(row.rir),
    ...(Number.isFinite(createdAt) ? { createdAt } : {}),
  }
}

function areCloudAndLocalRecordsEqual(row: CloudTrainingSetRow, trainingSet: TrainingSet): boolean {
  if (row.deleted_at) return false

  const remoteCreatedAt = Date.parse(row.performed_at ?? row.created_at)

  return (
    row.exercise_id === trainingSet.exerciseId &&
    row.training_date === trainingSet.date &&
    Number(row.weight_kg) === trainingSet.weightKg &&
    Number(row.reps) === trainingSet.reps &&
    Number(row.rir) === trainingSet.rir &&
    (!trainingSet.createdAt || remoteCreatedAt === trainingSet.createdAt)
  )
}

function toCloudInsert(
  trainingSet: TrainingSet,
  accountId: string,
  deviceId: string,
): CloudTrainingSetWrite {
  const performedAt = trainingSet.createdAt ? new Date(trainingSet.createdAt).toISOString() : null

  return {
    id: trainingSet.id,
    user_id: accountId,
    exercise_id: trainingSet.exerciseId,
    training_date: trainingSet.date,
    weight_kg: trainingSet.weightKg,
    reps: trainingSet.reps,
    rir: trainingSet.rir,
    performed_at: performedAt,
    created_at: performedAt ?? new Date().toISOString(),
    deleted_at: null,
    device_id: deviceId,
  }
}

function toCloudUpdate(trainingSet: TrainingSet, deviceId: string) {
  return {
    exercise_id: trainingSet.exerciseId,
    training_date: trainingSet.date,
    weight_kg: trainingSet.weightKg,
    reps: trainingSet.reps,
    rir: trainingSet.rir,
    performed_at: trainingSet.createdAt ? new Date(trainingSet.createdAt).toISOString() : null,
    deleted_at: null,
    device_id: deviceId,
  }
}

async function fetchAllCloudTrainingSets(accountId: string): Promise<CloudTrainingSetRow[]> {
  if (!supabase) throw new Error('尚未配置 Supabase')

  const rows: CloudTrainingSetRow[] = []

  for (let start = 0; ; start += READ_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('training_sets')
      .select(CLOUD_COLUMNS)
      .eq('user_id', accountId)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + READ_PAGE_SIZE - 1)

    if (error) throw error

    const page = asCloudRows(data)
    rows.push(...page)

    if (page.length < READ_PAGE_SIZE) break
  }

  return rows
}

async function applyRemoteWinner(
  row: CloudTrainingSetRow,
  expectedOutboxMutationAt?: number,
): Promise<boolean> {
  return applyRemoteTrainingSet({
    accountId: row.user_id,
    entityId: row.id,
    trainingSet: getLocalTrainingSet(row),
    meta: getRemoteMeta(row),
    expectedOutboxMutationAt,
  })
}

async function pullRemoteWinners(
  remoteRows: CloudTrainingSetRow[],
  accountId: string,
): Promise<{ pulled: number; conflicts: number }> {
  const outbox = await getAllTrainingSetOutboxEntries(accountId)
  const syncMeta = await getAllTrainingSetSyncMeta(accountId)
  const outboxByEntityId = new Map(outbox.map((entry) => [entry.entityId, entry]))
  const syncMetaByEntityId = new Map(syncMeta.map((meta) => [meta.entityId, meta]))
  let pulled = 0
  let conflicts = 0

  for (const row of remoteRows) {
    const pendingEntry = outboxByEntityId.get(row.id)

    if (!pendingEntry) {
      if (syncMetaByEntityId.get(row.id)?.remoteVersion === getRemoteVersion(row)) continue
      if (await applyRemoteWinner(row)) pulled += 1
      continue
    }

    const remoteVersion = getRemoteVersion(row)

    if (pendingEntry.baseVersion !== undefined && remoteVersion <= pendingEntry.baseVersion) {
      continue
    }

    if (
      pendingEntry.baseVersion === undefined &&
      pendingEntry.operation === 'upsert' &&
      pendingEntry.record &&
      areCloudAndLocalRecordsEqual(row, pendingEntry.record)
    ) {
      if (await applyRemoteWinner(row, pendingEntry.mutatedAt)) pulled += 1
      continue
    }

    conflicts += 1
    if (await applyRemoteWinner(row, pendingEntry.mutatedAt)) pulled += 1
  }

  return { pulled, conflicts }
}

async function insertOneEntry(
  entry: TrainingSetOutboxEntry,
  accountId: string,
  deviceId: string,
): Promise<number> {
  if (!supabase || !entry.record) return 0

  const { data, error } = await supabase
    .from('training_sets')
    .insert(toCloudInsert(entry.record, accountId, deviceId))
    .select(CLOUD_COLUMNS)
    .single()

  if (error) {
    await recordTrainingSetOutboxFailure(entry, error.message)
    return 0
  }

  const row = data as unknown as CloudTrainingSetRow
  return (await applyRemoteWinner(row, entry.mutatedAt)) ? 1 : 0
}

async function insertNewEntries(
  entries: TrainingSetOutboxEntry[],
  accountId: string,
  deviceId: string,
): Promise<number> {
  if (!supabase || !entries.length) return 0

  let pushed = 0

  for (let start = 0; start < entries.length; start += INSERT_BATCH_SIZE) {
    const batch = entries.slice(start, start + INSERT_BATCH_SIZE)
    const rows = batch
      .filter((entry): entry is TrainingSetOutboxEntry & { record: TrainingSet } =>
        Boolean(entry.record),
      )
      .map((entry) => toCloudInsert(entry.record, accountId, deviceId))
    const { data, error } = await supabase.from('training_sets').insert(rows).select(CLOUD_COLUMNS)

    if (error) {
      for (const entry of batch) pushed += await insertOneEntry(entry, accountId, deviceId)
      continue
    }

    const returnedById = new Map(asCloudRows(data).map((row) => [row.id, row]))

    for (const entry of batch) {
      const returnedRow = returnedById.get(entry.entityId)

      if (returnedRow && (await applyRemoteWinner(returnedRow, entry.mutatedAt))) pushed += 1
    }
  }

  return pushed
}

async function fetchCloudTrainingSet(
  accountId: string,
  entityId: string,
): Promise<CloudTrainingSetRow | undefined> {
  if (!supabase) return undefined

  const { data, error } = await supabase
    .from('training_sets')
    .select(CLOUD_COLUMNS)
    .eq('user_id', accountId)
    .eq('id', entityId)
    .maybeSingle()

  if (error) throw error
  return data ? (data as unknown as CloudTrainingSetRow) : undefined
}

async function pushExistingEntry(
  entry: TrainingSetOutboxEntry,
  accountId: string,
  deviceId: string,
): Promise<{ pushed: number; conflicts: number }> {
  if (!supabase || entry.baseVersion === undefined) return { pushed: 0, conflicts: 0 }

  const updateValue =
    entry.operation === 'delete'
      ? { deleted_at: new Date(entry.mutatedAt).toISOString(), device_id: deviceId }
      : entry.record
        ? toCloudUpdate(entry.record, deviceId)
        : undefined

  if (!updateValue) {
    await removeTrainingSetOutboxEntryIfUnchanged(entry)
    return { pushed: 0, conflicts: 0 }
  }

  const { data, error } = await supabase
    .from('training_sets')
    .update(updateValue)
    .eq('user_id', accountId)
    .eq('id', entry.entityId)
    .eq('version', entry.baseVersion)
    .select(CLOUD_COLUMNS)
    .maybeSingle()

  if (error) {
    await recordTrainingSetOutboxFailure(entry, error.message)
    return { pushed: 0, conflicts: 0 }
  }

  if (data) {
    const row = data as unknown as CloudTrainingSetRow
    return {
      pushed: (await applyRemoteWinner(row, entry.mutatedAt)) ? 1 : 0,
      conflicts: 0,
    }
  }

  const latestRemote = await fetchCloudTrainingSet(accountId, entry.entityId)

  if (latestRemote) {
    await applyRemoteWinner(latestRemote, entry.mutatedAt)
    return { pushed: 0, conflicts: 1 }
  }

  await recordTrainingSetOutboxFailure(entry, '云端记录不存在，稍后将重新尝试')
  return { pushed: 0, conflicts: 0 }
}

async function pushPendingEntries(
  accountId: string,
  remoteById: Map<string, CloudTrainingSetRow>,
): Promise<{ pushed: number; conflicts: number }> {
  const deviceId = getDeviceId()
  const entries = await getAllTrainingSetOutboxEntries(accountId)
  const newEntries: TrainingSetOutboxEntry[] = []
  const existingEntries: TrainingSetOutboxEntry[] = []
  let pushed = 0
  let conflicts = 0

  for (const entry of entries) {
    const remote = remoteById.get(entry.entityId)

    if (!remote) {
      if (entry.operation === 'delete') {
        await removeTrainingSetOutboxEntryIfUnchanged(entry)
      } else {
        newEntries.push(entry)
      }
      continue
    }

    if (entry.baseVersion === undefined) {
      if (
        entry.operation === 'upsert' &&
        entry.record &&
        areCloudAndLocalRecordsEqual(remote, entry.record)
      ) {
        if (await applyRemoteWinner(remote, entry.mutatedAt)) pushed += 1
      } else {
        conflicts += 1
        await applyRemoteWinner(remote, entry.mutatedAt)
      }
      continue
    }

    if (getRemoteVersion(remote) !== entry.baseVersion) {
      conflicts += 1
      await applyRemoteWinner(remote, entry.mutatedAt)
      continue
    }

    existingEntries.push(entry)
  }

  pushed += await insertNewEntries(newEntries, accountId, deviceId)

  for (const entry of existingEntries) {
    const result = await pushExistingEntry(entry, accountId, deviceId)
    pushed += result.pushed
    conflicts += result.conflicts
  }

  return { pushed, conflicts }
}

export async function synchronizeTrainingSets(accountId: string): Promise<TrainingSyncResult> {
  if (!supabase) throw new Error('尚未配置 Supabase')
  if (!navigator.onLine) throw new Error('当前处于离线状态，修改已保存在本机并等待同步')

  await claimUnassignedTrainingSetOutboxEntries(accountId)

  const remoteRows = await fetchAllCloudTrainingSets(accountId)
  const remoteById = new Map(remoteRows.map((row) => [row.id, row]))
  const pullResult = await pullRemoteWinners(remoteRows, accountId)

  await ensureLocalTrainingSetsQueuedForSync(accountId, new Set(remoteById.keys()))

  const pushResult = await pushPendingEntries(accountId, remoteById)
  const pending = (await getAllTrainingSetOutboxEntries(accountId)).length
  const lastSyncedAt = Date.now()

  await setSyncState(`training_sets:last_synced_at:${accountId}`, lastSyncedAt)

  if (pullResult.pulled || pushResult.pushed || pullResult.conflicts || pushResult.conflicts) {
    window.dispatchEvent(new Event(TRAINING_DATA_SYNCED_EVENT))
  }

  return {
    pulled: pullResult.pulled,
    pushed: pushResult.pushed,
    conflicts: pullResult.conflicts + pushResult.conflicts,
    pending,
    lastSyncedAt,
  }
}
