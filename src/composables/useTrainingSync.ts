import { ref } from 'vue'

import { getAllTrainingSetOutboxEntries, getSyncState, setActiveSyncAccountId } from '@/database'
import { synchronizeTrainingSets } from '@/services/trainingSync'

const isSyncing = ref(false)
const pendingCount = ref(0)
const conflictCount = ref(0)
const lastSyncedAt = ref<number>()
const status = ref('')
const error = ref('')

let currentAccountId: string | undefined
let syncPromise: Promise<void> | undefined
let scheduledSyncTimer: number | undefined
let syncRequestedWhileRunning = false

async function refreshPendingCount(): Promise<void> {
  pendingCount.value = (await getAllTrainingSetOutboxEntries(currentAccountId)).length
}

async function setAccount(accountId?: string): Promise<void> {
  currentAccountId = accountId
  if (accountId) setActiveSyncAccountId(accountId)
  status.value = ''
  error.value = ''
  conflictCount.value = 0

  if (accountId) {
    lastSyncedAt.value = await getSyncState<number>(`training_sets:last_synced_at:${accountId}`)
  } else {
    lastSyncedAt.value = undefined
  }

  await refreshPendingCount()
}

async function syncNow(): Promise<void> {
  if (!currentAccountId) return

  if (syncPromise) {
    syncRequestedWhileRunning = true
    return syncPromise
  }

  const accountId = currentAccountId

  syncPromise = (async () => {
    isSyncing.value = true
    status.value = ''
    error.value = ''

    try {
      const result = await synchronizeTrainingSets(accountId)

      pendingCount.value = result.pending
      conflictCount.value = result.conflicts
      lastSyncedAt.value = result.lastSyncedAt
      status.value = result.pending
        ? `已同步，本机仍有 ${result.pending} 项等待重试`
        : result.conflicts
          ? `同步完成，${result.conflicts} 项冲突采用了云端版本`
          : `同步完成：上传 ${result.pushed} 项，下载 ${result.pulled} 项`
    } catch (caughtError) {
      await refreshPendingCount()
      error.value =
        caughtError instanceof Error ? caughtError.message : '同步失败，本地数据不受影响'
    } finally {
      isSyncing.value = false
      syncPromise = undefined

      if (syncRequestedWhileRunning) {
        syncRequestedWhileRunning = false
        scheduleSync(250)
      }
    }
  })()

  return syncPromise
}

function scheduleSync(delay = 700): void {
  void refreshPendingCount()

  if (!currentAccountId || !navigator.onLine) return

  if (syncPromise) {
    syncRequestedWhileRunning = true
    return
  }

  if (scheduledSyncTimer !== undefined) window.clearTimeout(scheduledSyncTimer)
  scheduledSyncTimer = window.setTimeout(() => {
    scheduledSyncTimer = undefined
    void syncNow()
  }, delay)
}

export function useTrainingSync() {
  return {
    conflictCount,
    error,
    isSyncing,
    lastSyncedAt,
    pendingCount,
    refreshPendingCount,
    scheduleSync,
    setAccount,
    status,
    syncNow,
  }
}
