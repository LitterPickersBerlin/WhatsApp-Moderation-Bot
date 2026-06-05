import { applyDelta } from '../src/state'

describe('applyDelta', () => {
  it('increments score and messages on a positive delta', () => {
    expect(applyDelta({ score: 0, messages: 0 }, 1)).toEqual({ score: 1, messages: 1 })
  })

  it('decrements score but does not increment messages on a negative delta', () => {
    expect(applyDelta({ score: 3, messages: 3 }, -2)).toEqual({ score: 1, messages: 3 })
  })

  it('caps score at the provided max', () => {
    expect(applyDelta({ score: 9, messages: 5 }, 5, 10)).toEqual({ score: 10, messages: 6 })
  })

  it('allows score to go below zero', () => {
    expect(applyDelta({ score: 0, messages: 0 }, -3)).toEqual({ score: -3, messages: 0 })
  })

  it('does not exceed max when already at max', () => {
    expect(applyDelta({ score: 10, messages: 5 }, 1, 10)).toEqual({ score: 10, messages: 6 })
  })

  it('uses POINTS_MAX from config when no max is provided', () => {
    const { POINTS_MAX } = require('../src/config')
    const result = applyDelta({ score: POINTS_MAX, messages: 0 }, 100)
    expect(result.score).toBe(POINTS_MAX)
  })
})
