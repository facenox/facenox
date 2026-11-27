import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sync } from './Sync'
import { createSyncConfig, getElectronAPIMock } from '@/test/mocks/electron'
import { renderWithProviders } from '@/test/utils/renderWithProviders'

describe('Cloud sync state boundaries', () => {
  it('shows a credential error without exposing connected sync actions', async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: false,
        credentialError: 'Unlock the system keyring.'
      })
    )
    renderWithProviders(<Sync />)
    expect(await screen.findByText('Unlock the system keyring.')).toBeInTheDocument()
    expect(screen.queryByText('Connected to Facenox Cloud')).not.toBeInTheDocument()
    expect(api.initiateReversePairing).not.toHaveBeenCalled()
  })
})
