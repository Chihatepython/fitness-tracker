export const DATABASE_NAME = 'fitness-tracker'
export const DATABASE_VERSION = 1
export const SETS_STORE_NAME = 'sets'

export const BODY_PARTS = ['手臂', '肩', '背', '胸', '腿'] as const

export type BodyPart = (typeof BODY_PARTS)[number]

export const EXERCISES = [
  { id: 'dumbbellShoulderPress', name: '哑铃推举', bodyPart: '肩' },
  { id: 'cableLateralRaise', name: '绳索侧平举', bodyPart: '肩' },
  { id: 'reversePecDeck', name: '蝴蝶机反向飞鸟', bodyPart: '肩' },
  { id: 'barbellBenchPress', name: '平板杠铃卧推', bodyPart: '胸' },
  { id: 'inclineBarbellBenchPress', name: '上斜杠铃卧推', bodyPart: '胸' },
  { id: 'pecDeckFly', name: '蝴蝶机夹胸', bodyPart: '胸' },
  { id: 'dumbbellBenchPress', name: '平板哑铃卧推', bodyPart: '胸' },
  { id: 'inclineDumbbellBenchPress', name: '上斜哑铃卧推', bodyPart: '胸' },
  { id: 'barbellRow', name: '杠铃划船', bodyPart: '背' },
  { id: 'overhandLongBarLatPulldown', name: '长杆正握高位下拉', bodyPart: '背' },
  { id: 'neutralGripVBarLatPulldown', name: 'V把对握高位下拉', bodyPart: '背' },
  { id: 'wideGripSeatedCableRow', name: '宽握坐姿绳索划船', bodyPart: '背' },
  { id: 'dumbbellPreacherCurl', name: '哑铃牧师凳弯举', bodyPart: '手臂' },
  { id: 'inclineDumbbellCurl', name: '上斜哑铃弯举', bodyPart: '手臂' },
  { id: 'dumbbellHammerCurl', name: '哑铃锤式弯举', bodyPart: '手臂' },
  { id: 'cableEzBarReverseCurl', name: '绳索曲杆反向弯举', bodyPart: '手臂' },
  { id: 'cableEzBarCurl', name: '绳索曲杆弯举', bodyPart: '手臂' },
  { id: 'ropeTricepsPushdown', name: '绳索三头下压', bodyPart: '手臂' },
  { id: 'straightBarTricepsPushdown', name: '直杆三头下压', bodyPart: '手臂' },
  { id: 'ropeOverheadTricepsExtension', name: '绳索过顶臂屈伸', bodyPart: '手臂' },
] as const satisfies ReadonlyArray<{ id: string; name: string; bodyPart: BodyPart }>

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
    const transaction = database.transaction(SETS_STORE_NAME, 'readwrite')

    transaction.objectStore(SETS_STORE_NAME).add(storedTrainingSet)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
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

export async function deleteTrainingSet(id: string): Promise<void> {
  if (!ALPHANUMERIC_ID_PATTERN.test(id)) throw new Error('记录 ID 无效')

  const database = await openFitnessDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SETS_STORE_NAME, 'readwrite')

    transaction.objectStore(SETS_STORE_NAME).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
