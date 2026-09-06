import { describe, it, expect } from 'vitest'
import { MeSchema } from './authApi'

const BASE = { userId: 'admin', displayName: '管理者', roles: ['admin'], anonymous: false }

describe('MeSchema (#499)', () => {
  it('accepts the pre-#499 shape without provider / auth', () => {
    expect(MeSchema.parse(BASE)).toMatchObject(BASE)
  })

  it('stays parseable when the server reports an unknown auth mode', () => {
    const me = MeSchema.parse({ ...BASE, auth: { mode: 'saml', localLoginEnabled: false, oidcEnabled: true } })
    expect(me.auth?.mode).toBe('saml')
  })
})
