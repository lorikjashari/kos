import { describe, expect, it } from 'vitest'
import {
  assignDust2Roles,
  nextDust2RoleForTeam,
  planDust2RolesForTeams,
  pointInDust2Site,
} from './Dust2Tactics'

describe('assignDust2Roles', () => {
  it('spreads T defaults before repeating', () => {
    const { T } = assignDust2Roles(5, 0)
    expect(T).toEqual(['t_long', 't_b', 't_mid_short', 't_mid_lower', 't_mid_peek'])
  })

  it('covers A/B/Mid first for CT', () => {
    const { CT } = assignDust2Roles(0, 3)
    expect(CT).toEqual(['ct_a', 'ct_b', 'ct_mid'])
  })
})

describe('planDust2RolesForTeams', () => {
  it('returns nulls when disabled', () => {
    expect(planDust2RolesForTeams(['T', 'CT'], false)).toEqual([null, null])
  })

  it('assigns by slot team order', () => {
    const roles = planDust2RolesForTeams(['CT', 'T', 'CT', 'T'], true)
    expect(roles[0]?.startsWith('ct_')).toBe(true)
    expect(roles[1]?.startsWith('t_')).toBe(true)
    expect(roles[2]?.startsWith('ct_')).toBe(true)
    expect(roles[3]?.startsWith('t_')).toBe(true)
  })
})

describe('nextDust2RoleForTeam', () => {
  it('prefers an unused role', () => {
    expect(nextDust2RoleForTeam('T', ['t_long', 't_b'])).toBe('t_mid_short')
  })
})

describe('pointInDust2Site', () => {
  it('classifies A / B / Mid volumes', () => {
    expect(pointInDust2Site(90, -80, 'A')).toBe(true)
    expect(pointInDust2Site(-100, -60, 'B')).toBe(true)
    expect(pointInDust2Site(10, 0, 'MID')).toBe(true)
    expect(pointInDust2Site(90, -80, 'B')).toBe(false)
  })
})
