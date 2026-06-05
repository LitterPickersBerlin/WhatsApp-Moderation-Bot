import { isAdmin } from '../src/utils/helpers'

describe('isAdmin', () => {
  const admins = ['447000000001', '447000000002']

  it('returns true for a number in the admin list', () => {
    expect(isAdmin('447000000001', admins)).toBe(true)
  })

  it('returns false for a number not in the admin list', () => {
    expect(isAdmin('447000000099', admins)).toBe(false)
  })

  it('returns false for an empty admin list', () => {
    expect(isAdmin('447000000001', [])).toBe(false)
  })

  it('returns false for everyone when ADMIN_NUMBERS env is not set', () => {
    expect(isAdmin('447000000001')).toBe(false)
    expect(isAdmin('000000000000')).toBe(false)
  })
})
