export type FireMode = 'auto' | 'semi' | 'melee'

export interface RecoilKick {
  pitch: number
  yaw: number
}

export interface WeaponConfig {
  key: string
  displayName: string
  fireMode: FireMode
  rateOfFire: number
  maxRange: number
  impulseScale: number
  spawnsProjectile: boolean
  playsGunshot: boolean
  muzzleFlash: boolean
  magazineSize: number
  reloadTime: number
  bulletSpeed: number
  /** KoS spray pattern: pitch up / yaw side per shot index */
  recoilPattern: RecoilKick[]
  firstShotMultiplier: number
}

/** Approximate AK-47 spray (pitch up, yaw left/right) — CS-inspired */
const AK_RECOIL: RecoilKick[] = [
  { pitch: 0.018, yaw: 0.0 },
  { pitch: 0.022, yaw: 0.004 },
  { pitch: 0.028, yaw: -0.006 },
  { pitch: 0.032, yaw: 0.01 },
  { pitch: 0.036, yaw: -0.012 },
  { pitch: 0.038, yaw: 0.014 },
  { pitch: 0.04, yaw: -0.016 },
  { pitch: 0.04, yaw: 0.018 },
  { pitch: 0.038, yaw: -0.02 },
  { pitch: 0.036, yaw: 0.022 },
  { pitch: 0.034, yaw: -0.02 },
  { pitch: 0.032, yaw: 0.018 },
  { pitch: 0.03, yaw: -0.016 },
  { pitch: 0.028, yaw: 0.014 },
  { pitch: 0.026, yaw: -0.012 },
  { pitch: 0.024, yaw: 0.01 },
  { pitch: 0.022, yaw: -0.008 },
  { pitch: 0.02, yaw: 0.006 },
  { pitch: 0.018, yaw: -0.004 },
  { pitch: 0.016, yaw: 0.004 },
  { pitch: 0.015, yaw: -0.003 },
  { pitch: 0.014, yaw: 0.003 },
  { pitch: 0.013, yaw: -0.002 },
  { pitch: 0.012, yaw: 0.002 },
  { pitch: 0.012, yaw: -0.002 },
  { pitch: 0.011, yaw: 0.001 },
  { pitch: 0.011, yaw: -0.001 },
  { pitch: 0.01, yaw: 0.001 },
  { pitch: 0.01, yaw: -0.001 },
  { pitch: 0.01, yaw: 0.0 },
]

const USP_RECOIL: RecoilKick[] = [
  { pitch: 0.028, yaw: 0.0 },
  { pitch: 0.032, yaw: 0.006 },
  { pitch: 0.034, yaw: -0.008 },
  { pitch: 0.03, yaw: 0.01 },
  { pitch: 0.028, yaw: -0.006 },
  { pitch: 0.026, yaw: 0.004 },
  { pitch: 0.024, yaw: -0.003 },
  { pitch: 0.022, yaw: 0.002 },
  { pitch: 0.02, yaw: -0.002 },
  { pitch: 0.018, yaw: 0.001 },
  { pitch: 0.016, yaw: 0.0 },
  { pitch: 0.014, yaw: 0.0 },
]

export const WEAPONS: Record<string, WeaponConfig> = {
  AK47: {
    key: 'AK47',
    displayName: 'AK-47',
    fireMode: 'auto',
    rateOfFire: 100,
    maxRange: 10000,
    impulseScale: 25,
    spawnsProjectile: true,
    playsGunshot: true,
    muzzleFlash: true,
    magazineSize: 30,
    reloadTime: 2.4,
    bulletSpeed: 900,
    recoilPattern: AK_RECOIL,
    firstShotMultiplier: 0.55,
  },
  Usp: {
    key: 'Usp',
    displayName: 'USP-S',
    fireMode: 'semi',
    rateOfFire: 280,
    maxRange: 10000,
    impulseScale: 18,
    spawnsProjectile: true,
    playsGunshot: true,
    muzzleFlash: true,
    magazineSize: 12,
    reloadTime: 2.1,
    bulletSpeed: 850,
    recoilPattern: USP_RECOIL,
    firstShotMultiplier: 0.7,
  },
  Knife: {
    key: 'Knife',
    displayName: 'Knife',
    fireMode: 'melee',
    rateOfFire: 450,
    maxRange: 2.8,
    impulseScale: 40,
    spawnsProjectile: false,
    playsGunshot: false,
    muzzleFlash: false,
    magazineSize: 0,
    reloadTime: 0,
    bulletSpeed: 0,
    recoilPattern: [{ pitch: 0.008, yaw: 0 }],
    firstShotMultiplier: 1,
  },
}

export function getWeaponConfig(key: string): WeaponConfig {
  return WEAPONS[key] ?? WEAPONS.AK47
}

export function getRecoilKick(weapon: WeaponConfig, shotIndex: number): RecoilKick {
  const pattern = weapon.recoilPattern
  if (pattern.length === 0) return { pitch: 0, yaw: 0 }
  const kick = pattern[Math.min(shotIndex, pattern.length - 1)]
  const mult = shotIndex === 0 ? weapon.firstShotMultiplier : 1
  return { pitch: kick.pitch * mult, yaw: kick.yaw * mult }
}
