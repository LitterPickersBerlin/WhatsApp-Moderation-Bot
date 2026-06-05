import { ADMIN_NUMBERS } from '../config'

export function isAdmin(number: string, adminNumbers: string[] = ADMIN_NUMBERS): boolean {
  return adminNumbers.includes(number)
}
