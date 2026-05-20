import { config } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { createPinia } from 'pinia'

config.global.plugins.push([Quasar, {}])

// Global beforeEach to ensure Pinia is active for all tests
import { beforeEach } from 'vitest'
import { setActivePinia } from 'pinia'

beforeEach(() => {
  setActivePinia(createPinia())
})
