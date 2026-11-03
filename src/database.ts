export const DATABASE_NAME = 'fitness-tracker'
export const DATABASE_VERSION = 2
export const SETS_STORE_NAME = 'sets'
export const SYNC_OUTBOX_STORE_NAME = 'sync_outbox'
export const SYNC_META_STORE_NAME = 'sync_meta'
export const SYNC_STATE_STORE_NAME = 'sync_state'
export const TRAINING_DATA_CHANGED_EVENT = 'fitness-training-data-changed'
export const TRAINING_DATA_SYNCED_EVENT = 'fitness-training-data-synced'

const ACTIVE_SYNC_ACCOUNT_KEY = 'fitness-tracker:active-sync-account'

export const BODY_PARTS = ['手臂', '肩', '背', '胸', '腿'] as const

export type BodyPart = (typeof BODY_PARTS)[number]
export type MuscleWeight = 0.25 | 0.5 | 1
export type MuscleWeights = Readonly<Record<string, MuscleWeight>>

type ExerciseDefinition = {
  id: string
  name: string
  bodyPart: BodyPart
  muscleWeights?: MuscleWeights
}

export const EXERCISES = [
  {
    id: 'dumbbellShoulderPress',
    name: '哑铃推举',
    bodyPart: '肩',
    muscleWeights: {
      三角肌前束: 1,
      三角肌中束: 0.5,
      肱三头肌外侧头: 0.25,
      肱三头肌内侧头: 0.25,
      肱三头肌长头: 0.25,
    },
  },
  {
    id: 'cableLateralRaise',
    name: '绳索侧平举',
    bodyPart: '肩',
    muscleWeights: {
      三角肌中束: 1,
      三角肌前束: 0.25,
    },
  },
  {
    id: 'cableYRaise',
    name: '绳索Y字上举',
    bodyPart: '肩',
    muscleWeights: {
      三角肌中束: 1,
      中背: 0.25,
      三角肌前束: 0.25,
    },
  },
  {
    id: 'reversePecDeck',
    name: '蝴蝶机反向飞鸟',
    bodyPart: '肩',
    muscleWeights: {
      三角肌后束: 1,
      中背: 0.5,
      外旋肌: 0.25,
    },
  },
  {
    id: 'singleArmCableReverseFly',
    name: '单臂绳索反向飞鸟',
    bodyPart: '肩',
    muscleWeights: {
      三角肌后束: 1,
      中背: 0.5,
      外旋肌: 0.25,
    },
  },
  {
    id: 'ropeFacePull',
    name: '绳索面拉',
    bodyPart: '肩',
    muscleWeights: {
      三角肌后束: 1,
      中背: 0.5,
      外旋肌: 0.5,
    },
  },
  {
    id: 'barbellBenchPress',
    name: '平板杠铃卧推',
    bodyPart: '胸',
    muscleWeights: {
      中胸: 1,
      下胸: 0.5,
      上胸: 0.5,
      三角肌前束: 0.5,
      肱三头肌外侧头: 0.5,
      肱三头肌内侧头: 0.5,
      肱三头肌长头: 0.25,
    },
  },
  {
    id: 'inclineBarbellBenchPress',
    name: '上斜杠铃卧推',
    bodyPart: '胸',
    muscleWeights: {
      上胸: 1,
      中胸: 0.5,
      三角肌前束: 0.5,
      肱三头肌外侧头: 0.5,
      肱三头肌内侧头: 0.5,
      肱三头肌长头: 0.25,
    },
  },
  {
    id: 'pecDeckFly',
    name: '蝴蝶机夹胸',
    bodyPart: '胸',
    muscleWeights: {
      中胸: 1,
      下胸: 0.5,
    },
  },
  {
    id: 'dumbbellBenchPress',
    name: '平板哑铃卧推',
    bodyPart: '胸',
    muscleWeights: {
      中胸: 1,
      下胸: 0.5,
      三角肌前束: 0.25,
      肱三头肌外侧头: 0.5,
      肱三头肌内侧头: 0.5,
      肱三头肌长头: 0.25,
    },
  },
  {
    id: 'inclineDumbbellBenchPress',
    name: '上斜哑铃卧推',
    bodyPart: '胸',
    muscleWeights: {
      上胸: 1,
      中胸: 0.5,
      三角肌前束: 0.5,
      肱三头肌外侧头: 0.5,
      肱三头肌内侧头: 0.5,
      肱三头肌长头: 0.25,
    },
  },
  {
    id: 'barbellRow',
    name: '杠铃划船',
    bodyPart: '背',
    muscleWeights: {
      背阔肌: 1,
      中背: 1,
      三角肌后束: 0.25,
      肱二头肌长头: 0.25,
      肱二头肌短头: 0.25,
      肱肌: 0.5,
      竖脊肌: 0.25,
    },
  },
  {
    id: 'overhandLongBarLatPulldown',
    name: '长杆正握高位下拉',
    bodyPart: '背',
    muscleWeights: {
      背阔肌: 1,
      中背: 0.25,
      肱二头肌长头: 0.25,
      肱二头肌短头: 0.25,
      肱肌: 0.5,
      肱桡肌: 0.25,
    },
  },
  {
    id: 'neutralGripVBarLatPulldown',
    name: 'V把对握高位下拉',
    bodyPart: '背',
    muscleWeights: {
      背阔肌: 1,
      中背: 0.25,
      肱二头肌长头: 0.25,
      肱二头肌短头: 0.25,
      肱肌: 0.5,
      肱桡肌: 0.25,
    },
  },
  {
    id: 'wideGripSeatedCableRow',
    name: '宽握坐姿绳索划船',
    bodyPart: '背',
    muscleWeights: {
      中背: 1,
      背阔肌: 0.5,
      三角肌后束: 0.5,
      肱二头肌长头: 0.25,
      肱二头肌短头: 0.25,
      肱肌: 0.5,
      肱桡肌: 0.25,
    },
  },
  {
    id: 'neutralGripVBarSeatedCableRow',
    name: 'V把对握坐姿绳索划船',
    bodyPart: '背',
    muscleWeights: {
      中背: 1,
      背阔肌: 0.5,
      三角肌后束: 0.5,
      肱二头肌长头: 0.25,
      肱二头肌短头: 0.25,
      肱肌: 0.5,
      肱桡肌: 0.25,
    },
  },
  {
    id: 'wideOverhandMachineSeatedRow',
    name: '器械坐姿划船-宽正握',
    bodyPart: '背',
    muscleWeights: {
      中背: 1,
      三角肌后束: 1,
      背阔肌: 0.5,
      外旋肌: 0.5,
      肱肌: 0.5,
      肱桡肌: 0.5,
      肱二头肌长头: 0.25,
      肱二头肌短头: 0.25,
    },
  },
  {
    id: 'neutralGripMachineSeatedRow',
    name: '器械坐姿划船-对握',
    bodyPart: '背',
    muscleWeights: {
      背阔肌: 1,
      中背: 1,
      三角肌后束: 0.5,
      肱二头肌长头: 0.5,
      肱二头肌短头: 0.5,
      肱肌: 0.5,
      肱桡肌: 0.5,
      外旋肌: 0.25,
      肱三头肌长头: 0.25,
    },
  },
  {
    id: 'dumbbellPreacherCurl',
    name: '哑铃牧师凳弯举',
    bodyPart: '手臂',
    muscleWeights: {
      肱二头肌短头: 1,
      肱二头肌长头: 0.5,
      肱肌: 0.5,
    },
  },
  {
    id: 'inclineDumbbellCurl',
    name: '上斜哑铃弯举',
    bodyPart: '手臂',
    muscleWeights: {
      肱二头肌长头: 1,
      肱二头肌短头: 0.5,
      肱肌: 0.5,
    },
  },
  {
    id: 'dumbbellHammerCurl',
    name: '哑铃锤式弯举',
    bodyPart: '手臂',
    muscleWeights: {
      肱肌: 1,
      肱桡肌: 1,
      肱二头肌长头: 0.25,
      肱二头肌短头: 0.25,
    },
  },
  {
    id: 'cableEzBarReverseCurl',
    name: '绳索曲杆反向弯举',
    bodyPart: '手臂',
    muscleWeights: {
      肱桡肌: 1,
      肱肌: 1,
      前臂伸肌群: 0.5,
    },
  },
  {
    id: 'cableEzBarCurl',
    name: '绳索曲杆弯举',
    bodyPart: '手臂',
    muscleWeights: {
      肱二头肌长头: 1,
      肱二头肌短头: 1,
      肱肌: 0.5,
    },
  },
  {
    id: 'ropeTricepsPushdown',
    name: '绳索三头下压',
    bodyPart: '手臂',
    muscleWeights: {
      肱三头肌外侧头: 1,
      肱三头肌内侧头: 1,
      肱三头肌长头: 0.5,
    },
  },
  {
    id: 'straightBarTricepsPushdown',
    name: '直杆三头下压',
    bodyPart: '手臂',
    muscleWeights: {
      肱三头肌外侧头: 1,
      肱三头肌内侧头: 1,
      肱三头肌长头: 0.5,
    },
  },
  {
    id: 'ropeOverheadTricepsExtension',
    name: '绳索过顶臂屈伸',
    bodyPart: '手臂',
    muscleWeights: {
      肱三头肌长头: 1,
      肱三头肌外侧头: 0.5,
      肱三头肌内侧头: 0.5,
    },
  },
  {
    id: 'barbellBackSquat',
    name: '杠铃深蹲',
    bodyPart: '腿',
    muscleWeights: {
      股四头肌: 1,
      腘绳肌: 0.25,
      臀大肌: 1,
      臀中肌: 0.25,
      内收肌群: 0.5,
    },
  },
  {
    id: 'dumbbellSquat',
    name: '哑铃深蹲',
    bodyPart: '腿',
    muscleWeights: {
      股四头肌: 1,
      腘绳肌: 0.25,
      臀大肌: 1,
      臀中肌: 0.25,
      内收肌群: 0.5,
    },
  },
  {
    id: 'quadDominantBulgarianSplitSquat',
    name: '保加利亚分腿蹲（股四头肌主导）',
    bodyPart: '腿',
    muscleWeights: {
      股四头肌: 1,
      腘绳肌: 0.25,
      臀大肌: 0.5,
      臀中肌: 0.25,
      内收肌群: 0.25,
    },
  },
  {
    id: 'gluteDominantBulgarianSplitSquat',
    name: '保加利亚分腿蹲（臀部主导）',
    bodyPart: '腿',
    muscleWeights: {
      股四头肌: 0.5,
      腘绳肌: 0.5,
      臀大肌: 1,
      臀中肌: 0.25,
      内收肌群: 0.25,
    },
  },
  {
    id: 'romanianDeadlift',
    name: '罗马尼亚硬拉',
    bodyPart: '腿',
    muscleWeights: {
      腘绳肌: 1,
      臀大肌: 1,
      内收肌群: 0.25,
    },
  },
  {
    id: 'seatedLegExtension',
    name: '坐姿腿屈伸',
    bodyPart: '腿',
    muscleWeights: {
      股四头肌: 1,
    },
  },
  {
    id: 'seatedLegCurl',
    name: '坐姿腿弯举',
    bodyPart: '腿',
    muscleWeights: {
      腘绳肌: 1,
    },
  },
  {
    id: 'machineHipThrust',
    name: '器械臀推',
    bodyPart: '腿',
    muscleWeights: {
      腘绳肌: 0.25,
      臀大肌: 1,
    },
  },
  {
    id: 'gluteFocusedReverseHackSquat',
    name: '反向哈克深蹲（臀部主导）',
    bodyPart: '腿',
    muscleWeights: {
      股四头肌: 0.5,
      腘绳肌: 0.25,
      臀大肌: 1,
      内收肌群: 0.5,
    },
  },
  {
    id: 'seatedHipAbductionUpright',
    name: '坐姿髋外展（直立）',
    bodyPart: '腿',
    muscleWeights: {
      臀大肌: 0.5,
      臀中肌: 1,
    },
  },
  {
    id: 'seatedHipAbductionForwardLean',
    name: '坐姿髋外展（前倾）',
    bodyPart: '腿',
    muscleWeights: {
      臀大肌: 0.5,
      臀中肌: 1,
    },
  },
  {
    id: 'seatedHipAdduction',
    name: '坐姿髋内收',
    bodyPart: '腿',
    muscleWeights: {
      内收肌群: 1,
    },
  },
] as const satisfies ReadonlyArray<ExerciseDefinition>

export type ExerciseId = (typeof EXERCISES)[number]['id']

export const EXERCISE_NAMES = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.id, exercise.name]),
) as Record<ExerciseId, string>

export const EXERCISE_BODY_PARTS = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.id, exercise.bodyPart]),
) as Record<ExerciseId, BodyPart>

export interface TrainingSet {
  id: string
  date: string
  exerciseId: ExerciseId
  weightKg: number
  reps: number
  rir: number
  createdAt?: number
}

export interface TrainingSetSyncMeta {
  key: string
  accountId: string
  entityId: string
  remoteVersion: number
  remoteUpdatedAt: string
  remoteDeletedAt?: string
  remoteDeviceId?: string
}

export interface TrainingSetOutboxEntry {
  id: string
  accountId?: string
  entityType: 'training_set'
  entityId: string
  operation: 'upsert' | 'delete'
  record?: TrainingSet
  mutatedAt: number
  baseVersion?: number
  attempts: number
  lastError?: string
}

export interface SyncStateEntry<T = unknown> {
  key: string
  value: T
}

type NewTrainingSet = Omit<TrainingSet, 'createdAt'>

const ALPHANUMERIC_ID_PATTERN = /^[A-Za-z0-9]+$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isExerciseId(value: string): value is ExerciseId {
  return EXERCISES.some((exercise) => exercise.id === value)
}

export function createTrainingSetId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16))

  return Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function getActiveSyncAccountId(): string | undefined {
  return localStorage.getItem(ACTIVE_SYNC_ACCOUNT_KEY) ?? undefined
}

export function setActiveSyncAccountId(accountId?: string): void {
  if (accountId) {
    localStorage.setItem(ACTIVE_SYNC_ACCOUNT_KEY, accountId)
  } else {
    localStorage.removeItem(ACTIVE_SYNC_ACCOUNT_KEY)
  }
}

export function createTrainingSetOutboxId(entityId: string): string {
  return `training_set:${entityId}`
}

export function createTrainingSetSyncMetaKey(accountId: string, entityId: string): string {
  return `${accountId}:training_set:${entityId}`
}

function dispatchTrainingDataChanged(): void {
  window.dispatchEvent(new Event(TRAINING_DATA_CHANGED_EVENT))
}

function areStoredTrainingSetsEqual(left: TrainingSet, right: TrainingSet): boolean {
  return (
    left.id === right.id &&
    left.date === right.date &&
    left.exerciseId === right.exerciseId &&
    left.weightKg === right.weightKg &&
    left.reps === right.reps &&
    left.rir === right.rir &&
    (left.createdAt ?? null) === (right.createdAt ?? null)
  )
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year!, month! - 1, day)

  return date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day
}

function validateTrainingSet(trainingSet: TrainingSet): void {
  if (!ALPHANUMERIC_ID_PATTERN.test(trainingSet.id)) {
    throw new Error('记录 ID 只能包含字母和数字')
  }

  if (!isValidDate(trainingSet.date)) {
    throw new Error('训练日期无效')
  }

  if (!isExerciseId(trainingSet.exerciseId)) {
    throw new Error('训练动作无效')
  }

  if (!Number.isFinite(trainingSet.weightKg) || trainingSet.weightKg < 0) {
    throw new Error('重量必须是非负数字')
  }

  if (!Number.isInteger(trainingSet.reps) || trainingSet.reps < 1) {
    throw new Error('次数必须是正整数')
  }

  if (!Number.isInteger(trainingSet.rir) || trainingSet.rir < 0) {
    throw new Error('RIR 必须是非负整数')
  }

  if (
    trainingSet.createdAt !== undefined &&
    (!Number.isInteger(trainingSet.createdAt) || trainingSet.createdAt < 0)
  ) {
    throw new Error('记录创建时间无效')
  }
}

export function parseTrainingSetImport(value: unknown): TrainingSet[] {
  if (!Array.isArray(value)) throw new Error('JSON 顶层必须是训练记录数组')
  if (value.length === 0) throw new Error('导入文件中没有训练记录')

  const trainingSets = value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`第 ${index + 1} 条记录格式无效`)
    }

    const record = item as Record<string, unknown>

    if (
      typeof record.id !== 'string' ||
      typeof record.date !== 'string' ||
      typeof record.exerciseId !== 'string' ||
      typeof record.weightKg !== 'number' ||
      typeof record.reps !== 'number' ||
      typeof record.rir !== 'number' ||
      (record.createdAt !== undefined && typeof record.createdAt !== 'number')
    ) {
      throw new Error(`第 ${index + 1} 条记录的字段类型无效`)
    }

    const trainingSet: TrainingSet = {
      id: record.id,
      date: record.date,
      exerciseId: record.exerciseId as ExerciseId,
      weightKg: record.weightKg,
      reps: record.reps,
      rir: record.rir,
    }

    if (record.createdAt !== undefined) trainingSet.createdAt = record.createdAt

    try {
      validateTrainingSet(trainingSet)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '内容无效'

      throw new Error(`第 ${index + 1} 条记录：${message}`)
    }

    return trainingSet
  })

  const ids = new Set<string>()

  for (const trainingSet of trainingSets) {
    if (ids.has(trainingSet.id)) throw new Error(`导入文件中存在重复 ID：${trainingSet.id}`)
    ids.add(trainingSet.id)
  }

  return trainingSets
}

let databasePromise: Promise<IDBDatabase> | undefined

export function openFitnessDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(SETS_STORE_NAME)) {
        const setsStore = database.createObjectStore(SETS_STORE_NAME, { keyPath: 'id' })

        setsStore.createIndex('date', 'date')
        setsStore.createIndex('exerciseId', 'exerciseId')
      }

      if (!database.objectStoreNames.contains(SYNC_OUTBOX_STORE_NAME)) {
        const outboxStore = database.createObjectStore(SYNC_OUTBOX_STORE_NAME, { keyPath: 'id' })

        outboxStore.createIndex('accountId', 'accountId')
        outboxStore.createIndex('mutatedAt', 'mutatedAt')
      }

      if (!database.objectStoreNames.contains(SYNC_META_STORE_NAME)) {
        const metaStore = database.createObjectStore(SYNC_META_STORE_NAME, { keyPath: 'key' })

        metaStore.createIndex('accountId', 'accountId')
        metaStore.createIndex('entityId', 'entityId')
      }

      if (!database.objectStoreNames.contains(SYNC_STATE_STORE_NAME)) {
        database.createObjectStore(SYNC_STATE_STORE_NAME, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      const database = request.result

      database.onversionchange = () => database.close()
      resolve(database)
    }

    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('数据库升级被其他页面阻止'))
  })

  return databasePromise
}

export async function addTrainingSet(trainingSet: NewTrainingSet): Promise<void> {
  const storedTrainingSet: TrainingSet = {
    ...trainingSet,
    createdAt: Date.now(),
  }

  validateTrainingSet(storedTrainingSet)

  const database = await openFitnessDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [SETS_STORE_NAME, SYNC_OUTBOX_STORE_NAME, SYNC_META_STORE_NAME],
      'readwrite',
    )
    const accountId = getActiveSyncAccountId()
    const setsStore = transaction.objectStore(SETS_STORE_NAME)
    const outboxStore = transaction.objectStore(SYNC_OUTBOX_STORE_NAME)

    const queueMutation = (baseVersion?: number) => {
      const outboxEntry: TrainingSetOutboxEntry = {
        id: createTrainingSetOutboxId(storedTrainingSet.id),
        accountId,
        entityType: 'training_set',
        entityId: storedTrainingSet.id,
        operation: 'upsert',
        record: storedTrainingSet,
        mutatedAt: Date.now(),
        baseVersion,
        attempts: 0,
      }

      setsStore.add(storedTrainingSet)
      outboxStore.put(outboxEntry)
    }

    if (accountId) {
      const metaRequest = transaction
        .objectStore(SYNC_META_STORE_NAME)
        .get(createTrainingSetSyncMetaKey(accountId, storedTrainingSet.id))

      metaRequest.onsuccess = () => {
        const meta = metaRequest.result as TrainingSetSyncMeta | undefined
        queueMutation(meta?.remoteVersion)
      }
      metaRequest.onerror = () => transaction.abort()
    } else {
      queueMutation()
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

  dispatchTrainingDataChanged()
}

export async function getTrainingSetsByDate(date: string): Promise<TrainingSet[]> {
  if (!isValidDate(date)) throw new Error('查询日期无效')

  const database = await openFitnessDatabase()

  const trainingSets = await new Promise<TrainingSet[]>((resolve, reject) => {
    const transaction = database.transaction(SETS_STORE_NAME, 'readonly')
    const request = transaction.objectStore(SETS_STORE_NAME).index('date').getAll(date)

    request.onsuccess = () => resolve(request.result as TrainingSet[])
    request.onerror = () => reject(request.error)
  })

  return trainingSets.sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
}

export async function getTrainingSetsByDateRange(
  startDate: string,
  endDate: string,
): Promise<TrainingSet[]> {
  if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
    throw new Error('查询日期范围无效')
  }

  const database = await openFitnessDatabase()

  return new Promise<TrainingSet[]>((resolve, reject) => {
    const transaction = database.transaction(SETS_STORE_NAME, 'readonly')
    const dateRange = IDBKeyRange.bound(startDate, endDate)
    const request = transaction.objectStore(SETS_STORE_NAME).index('date').getAll(dateRange)

    request.onsuccess = () => resolve(request.result as TrainingSet[])
    request.onerror = () => reject(request.error)
  })
}

export async function getAllTrainingSets(): Promise<TrainingSet[]> {
  const database = await openFitnessDatabase()

  const trainingSets = await new Promise<TrainingSet[]>((resolve, reject) => {
    const transaction = database.transaction(SETS_STORE_NAME, 'readonly')
    const request = transaction.objectStore(SETS_STORE_NAME).getAll()

    request.onsuccess = () => resolve(request.result as TrainingSet[])
    request.onerror = () => reject(request.error)
  })

  return trainingSets.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      (left.createdAt ?? 0) - (right.createdAt ?? 0) ||
      left.id.localeCompare(right.id),
  )
}

export async function replaceAllTrainingSets(trainingSets: TrainingSet[]): Promise<void> {
  const ids = new Set<string>()

  for (const trainingSet of trainingSets) {
    validateTrainingSet(trainingSet)
    if (ids.has(trainingSet.id)) throw new Error(`训练记录 ID 重复：${trainingSet.id}`)
    ids.add(trainingSet.id)
  }

  const [database, currentTrainingSets] = await Promise.all([
    openFitnessDatabase(),
    getAllTrainingSets(),
  ])
  const currentById = new Map(
    currentTrainingSets.map((trainingSet) => [trainingSet.id, trainingSet]),
  )
  const importedById = new Map(trainingSets.map((trainingSet) => [trainingSet.id, trainingSet]))
  const accountId = getActiveSyncAccountId()
  const syncMeta = accountId ? await getAllTrainingSetSyncMeta(accountId) : []
  const syncMetaByEntityId = new Map(syncMeta.map((meta) => [meta.entityId, meta]))
  const mutationTime = Date.now()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([SETS_STORE_NAME, SYNC_OUTBOX_STORE_NAME], 'readwrite')
    const setsStore = transaction.objectStore(SETS_STORE_NAME)
    const outboxStore = transaction.objectStore(SYNC_OUTBOX_STORE_NAME)

    setsStore.clear()
    for (const trainingSet of trainingSets) {
      setsStore.add(trainingSet)

      const currentTrainingSet = currentById.get(trainingSet.id)

      if (!currentTrainingSet || !areStoredTrainingSetsEqual(currentTrainingSet, trainingSet)) {
        const meta = syncMetaByEntityId.get(trainingSet.id)
        const outboxEntry: TrainingSetOutboxEntry = {
          id: createTrainingSetOutboxId(trainingSet.id),
          accountId,
          entityType: 'training_set',
          entityId: trainingSet.id,
          operation: 'upsert',
          record: trainingSet,
          mutatedAt: mutationTime,
          baseVersion: meta?.remoteVersion,
          attempts: 0,
        }

        outboxStore.put(outboxEntry)
      }
    }

    for (const currentTrainingSet of currentTrainingSets) {
      if (importedById.has(currentTrainingSet.id)) continue

      const meta = syncMetaByEntityId.get(currentTrainingSet.id)
      const outboxId = createTrainingSetOutboxId(currentTrainingSet.id)

      if (meta) {
        const outboxEntry: TrainingSetOutboxEntry = {
          id: outboxId,
          accountId,
          entityType: 'training_set',
          entityId: currentTrainingSet.id,
          operation: 'delete',
          mutatedAt: mutationTime,
          baseVersion: meta.remoteVersion,
          attempts: 0,
        }

        outboxStore.put(outboxEntry)
      } else {
        outboxStore.delete(outboxId)
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

  dispatchTrainingDataChanged()
}

export async function deleteTrainingSet(id: string): Promise<void> {
  if (!ALPHANUMERIC_ID_PATTERN.test(id)) throw new Error('记录 ID 无效')

  const database = await openFitnessDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [SETS_STORE_NAME, SYNC_OUTBOX_STORE_NAME, SYNC_META_STORE_NAME],
      'readwrite',
    )
    const accountId = getActiveSyncAccountId()
    const outboxId = createTrainingSetOutboxId(id)
    const outboxStore = transaction.objectStore(SYNC_OUTBOX_STORE_NAME)

    transaction.objectStore(SETS_STORE_NAME).delete(id)

    const queueDelete = (meta?: TrainingSetSyncMeta) => {
      if (!meta) {
        outboxStore.delete(outboxId)
        return
      }

      const outboxEntry: TrainingSetOutboxEntry = {
        id: outboxId,
        accountId,
        entityType: 'training_set',
        entityId: id,
        operation: 'delete',
        mutatedAt: Date.now(),
        baseVersion: meta.remoteVersion,
        attempts: 0,
      }

      outboxStore.put(outboxEntry)
    }

    if (accountId) {
      const metaRequest = transaction
        .objectStore(SYNC_META_STORE_NAME)
        .get(createTrainingSetSyncMetaKey(accountId, id))

      metaRequest.onsuccess = () =>
        queueDelete(metaRequest.result as TrainingSetSyncMeta | undefined)
      metaRequest.onerror = () => transaction.abort()
    } else {
      queueDelete()
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

  dispatchTrainingDataChanged()
}

export interface RemoteTrainingSetApplication {
  accountId: string
  entityId: string
  trainingSet?: TrainingSet
  meta: TrainingSetSyncMeta
  expectedOutboxMutationAt?: number
}

export async function getAllTrainingSetOutboxEntries(
  accountId?: string,
): Promise<TrainingSetOutboxEntry[]> {
  const database = await openFitnessDatabase()

  const entries = await new Promise<TrainingSetOutboxEntry[]>((resolve, reject) => {
    const transaction = database.transaction(SYNC_OUTBOX_STORE_NAME, 'readonly')
    const request = transaction.objectStore(SYNC_OUTBOX_STORE_NAME).getAll()

    request.onsuccess = () => resolve(request.result as TrainingSetOutboxEntry[])
    request.onerror = () => reject(request.error)
  })

  return entries
    .filter((entry) => !accountId || !entry.accountId || entry.accountId === accountId)
    .sort((left, right) => left.mutatedAt - right.mutatedAt || left.id.localeCompare(right.id))
}

export async function getAllTrainingSetSyncMeta(accountId: string): Promise<TrainingSetSyncMeta[]> {
  const database = await openFitnessDatabase()

  const meta = await new Promise<TrainingSetSyncMeta[]>((resolve, reject) => {
    const transaction = database.transaction(SYNC_META_STORE_NAME, 'readonly')
    const request = transaction
      .objectStore(SYNC_META_STORE_NAME)
      .index('accountId')
      .getAll(accountId)

    request.onsuccess = () => resolve(request.result as TrainingSetSyncMeta[])
    request.onerror = () => reject(request.error)
  })

  return meta
}

export async function claimUnassignedTrainingSetOutboxEntries(accountId: string): Promise<void> {
  const database = await openFitnessDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SYNC_OUTBOX_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SYNC_OUTBOX_STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      for (const entry of request.result as TrainingSetOutboxEntry[]) {
        if (!entry.accountId) store.put({ ...entry, accountId })
      }
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function ensureLocalTrainingSetsQueuedForSync(
  accountId: string,
  remoteEntityIds: ReadonlySet<string>,
): Promise<number> {
  const [database, trainingSets, outboxEntries, syncMeta] = await Promise.all([
    openFitnessDatabase(),
    getAllTrainingSets(),
    getAllTrainingSetOutboxEntries(accountId),
    getAllTrainingSetSyncMeta(accountId),
  ])
  const outboxEntityIds = new Set(outboxEntries.map((entry) => entry.entityId))
  const syncMetaByEntityId = new Map(syncMeta.map((meta) => [meta.entityId, meta]))
  const entriesToQueue = trainingSets.filter(
    (trainingSet) => !remoteEntityIds.has(trainingSet.id) && !outboxEntityIds.has(trainingSet.id),
  )

  if (!entriesToQueue.length) return 0

  const mutationTime = Date.now()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SYNC_OUTBOX_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SYNC_OUTBOX_STORE_NAME)

    for (const trainingSet of entriesToQueue) {
      const meta = syncMetaByEntityId.get(trainingSet.id)
      const entry: TrainingSetOutboxEntry = {
        id: createTrainingSetOutboxId(trainingSet.id),
        accountId,
        entityType: 'training_set',
        entityId: trainingSet.id,
        operation: 'upsert',
        record: trainingSet,
        mutatedAt: mutationTime,
        baseVersion: meta?.remoteVersion,
        attempts: 0,
      }

      store.put(entry)
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

  return entriesToQueue.length
}

export async function applyRemoteTrainingSet(
  application: RemoteTrainingSetApplication,
): Promise<boolean> {
  const database = await openFitnessDatabase()

  return new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(
      [SETS_STORE_NAME, SYNC_OUTBOX_STORE_NAME, SYNC_META_STORE_NAME],
      'readwrite',
    )
    const setsStore = transaction.objectStore(SETS_STORE_NAME)
    const outboxStore = transaction.objectStore(SYNC_OUTBOX_STORE_NAME)
    const metaStore = transaction.objectStore(SYNC_META_STORE_NAME)
    const outboxId = createTrainingSetOutboxId(application.entityId)
    const outboxRequest = outboxStore.get(outboxId)
    let wasApplied = false

    outboxRequest.onsuccess = () => {
      const currentOutbox = outboxRequest.result as TrainingSetOutboxEntry | undefined

      if (
        (application.expectedOutboxMutationAt === undefined && currentOutbox) ||
        (application.expectedOutboxMutationAt !== undefined &&
          currentOutbox?.mutatedAt !== application.expectedOutboxMutationAt)
      ) {
        return
      }

      if (application.trainingSet) {
        setsStore.put(application.trainingSet)
      } else {
        setsStore.delete(application.entityId)
      }

      metaStore.put(application.meta)
      if (currentOutbox) outboxStore.delete(outboxId)
      wasApplied = true
    }
    outboxRequest.onerror = () => transaction.abort()
    transaction.oncomplete = () => resolve(wasApplied)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function removeTrainingSetOutboxEntryIfUnchanged(
  entry: TrainingSetOutboxEntry,
): Promise<boolean> {
  const database = await openFitnessDatabase()

  return new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(SYNC_OUTBOX_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SYNC_OUTBOX_STORE_NAME)
    const request = store.get(entry.id)
    let wasRemoved = false

    request.onsuccess = () => {
      const currentEntry = request.result as TrainingSetOutboxEntry | undefined

      if (currentEntry?.mutatedAt === entry.mutatedAt) {
        store.delete(entry.id)
        wasRemoved = true
      }
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => resolve(wasRemoved)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function recordTrainingSetOutboxFailure(
  entry: TrainingSetOutboxEntry,
  message: string,
): Promise<void> {
  const database = await openFitnessDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SYNC_OUTBOX_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(SYNC_OUTBOX_STORE_NAME)
    const request = store.get(entry.id)

    request.onsuccess = () => {
      const currentEntry = request.result as TrainingSetOutboxEntry | undefined

      if (currentEntry?.mutatedAt === entry.mutatedAt) {
        store.put({
          ...currentEntry,
          attempts: currentEntry.attempts + 1,
          lastError: message,
        })
      }
    }
    request.onerror = () => transaction.abort()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function getSyncState<T>(key: string): Promise<T | undefined> {
  const database = await openFitnessDatabase()

  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(SYNC_STATE_STORE_NAME, 'readonly')
    const request = transaction.objectStore(SYNC_STATE_STORE_NAME).get(key)

    request.onsuccess = () => resolve((request.result as SyncStateEntry<T> | undefined)?.value)
    request.onerror = () => reject(request.error)
  })
}

export async function setSyncState<T>(key: string, value: T): Promise<void> {
  const database = await openFitnessDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SYNC_STATE_STORE_NAME, 'readwrite')
    const entry: SyncStateEntry<T> = { key, value }

    transaction.objectStore(SYNC_STATE_STORE_NAME).put(entry)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
