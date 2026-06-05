import { STORAGE_MODE } from '../config'
import { DbAdapter } from './db-adapter'
import { FsAdapter } from './fs-adapter'
import type { StorageAdapter } from './interface'

export const storage: StorageAdapter = STORAGE_MODE === 'filesystem'
  ? new FsAdapter()
  : new DbAdapter()

export type { StorageAdapter }
