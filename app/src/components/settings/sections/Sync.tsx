import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, RotateCw, ExternalLink, Check, Copy, CloudUpload } from 'lucide-react'

import { useUIStore } from '@/components/main/stores'
import { Modal, Spinner } from '@/components/common'
import { ErrorText } from '@/components/common/ErrorText'
import { Tooltip, useDialog } from '@/components/shared'
import { DEFAULT_REMOTE_BASE_URL, DEFAULT_SYNC_INTERVAL_MINUTES, isOfficialCloudUrl } from '@/services/syncDefaults'
import { parseSyncError } from './syncErrorUtils.js'
import { refreshCloudSyncConfig, useCloudSyncConfig, type RemoteSyncConfig } from '@/services/cloudSyncState'
import { getEffectiveRemoteUrl } from '@/hooks/useCloudPairing'

export type { RemoteSyncConfig } from '@/services/cloudSyncState'

const defaultConfig: RemoteSyncConfig = {
  enabled: true,
  remoteBaseUrl: DEFAULT_REMOTE_BASE_URL,
  organizationId: '',
  organizationName: '',
  siteId: '',
  siteName: '',
  deviceId: '',
  deviceName: 'Facenox Desktop',
  intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  lastSyncedAt: null,
  lastSyncStatus: 'idle',
  lastSyncMessage: null,
  connected: false,
  unsyncedRecordsCount: undefined,
  unsyncedSessionsCount: undefined
}

function formatQueuedRecords(count: number): string {
  return `${count} ${count === 1 ? 'record' : 'records'} queued`
}

interface SyncProps {
  onNavigateToDB?: () => void
  onStatusChange?: (config: RemoteSyncConfig | null) => void
}

export function Sync({ onNavigateToDB, onStatusChange }: SyncProps = {}) {
  const setSuccess = useUIStore((state) => state.setSuccess)
  const setError = useUIStore((state) => state.setError)
  const dialog = useDialog()
  const { config: savedConfig, status: cloudConfigStatus, error: cloudConfigError } = useCloudSyncConfig()
  const config = savedConfig ?? defaultConfig
  const configFieldsReady = Boolean(savedConfig)
  const hasUnreadablePairing = Boolean(
    config.credentialError && config.organizationId && config.siteId && config.deviceId
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showUnpairModal, setShowUnpairModal] = useState(false)
  const [clearLocalDataOnUnpair, setClearLocalDataOnUnpair] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [busyAction, setBusyAction] = useState<'disconnecting' | 'syncing' | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (savedConfig) onStatusChange?.(savedConfig)
  }, [savedConfig, onStatusChange])

  const effectiveUrl = getEffectiveRemoteUrl(config.remoteBaseUrl)
  const isCustomServer = !isOfficialCloudUrl(effectiveUrl)
  const serverDisplayName = isCustomServer ? 'Custom server' : 'Facenox Cloud'

  const workspaceLabel = [config.organizationName, config.siteName].filter(Boolean).join(' / ') || serverDisplayName

  const executeDisconnect = async (clearLocalData: boolean) => {
    setError(null)
    setSuccess(null)
    setBusyAction('disconnecting')
    try {
      const result =
        clearLocalData ?
          await window.electronAPI.sync.disconnectDevice({ clearLocalData: true })
        : await window.electronAPI.sync.disconnectDevice()
      await refreshCloudSyncConfig()
      if (!mountedRef.current) return
      if (result.warning) {
        setError(`Disconnected locally. ${result.warning}`)
      } else {
        setSuccess(
          clearLocalData ? 'Device unpaired and local attendance data cleared.' : 'Device unpaired from Facenox Cloud.'
        )
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not disconnect this device.')
    } finally {
      setBusyAction(null)
    }
  }

  const handleDisconnect = async () => {
    if (!hasUnreadablePairing) {
      setClearLocalDataOnUnpair(false)
      setShowUnpairModal(true)
      return
    }

    const confirmed = await dialog.confirm({
      title: 'Reset local pairing?',
      message: `This computer will stop syncing with ${workspaceLabel}. Local attendance data stays on this device. If the old device is still paired in Cloud, remove it in Cloud > Devices before pairing again.`,
      confirmText: 'Reset pairing',
      cancelText: 'Cancel',
      confirmVariant: 'danger'
    })
    if (!confirmed) return

    await executeDisconnect(false)
  }

  const handleManualSync = async () => {
    setError(null)
    setSuccess(null)
    setBusyAction('syncing')
    try {
      const result = await window.electronAPI.sync.triggerNow()
      await refreshCloudSyncConfig()
      if (result.success) {
        setSuccess('Sync completed.')
      } else {
        const parsed = parseSyncError(result.message)
        setError(parsed.technicalDetails || parsed.description || 'Manual sync failed.')
      }
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : 'Manual sync failed.'
      const parsed = parseSyncError(rawMsg)
      setError(parsed.technicalDetails || parsed.description || 'Manual sync failed.')
    } finally {
      setBusyAction(null)
    }
  }

  if (cloudConfigStatus !== 'ready' || !configFieldsReady) {
    return (
      <div
        role='status'
        className='mx-auto flex w-full max-w-[900px] items-center gap-3 px-10 py-10 text-sm text-white/65'>
        {cloudConfigStatus !== 'error' ?
          <>
            <Spinner size='sm' color='cyan' />
            <span>Loading Cloud connection…</span>
          </>
        : <div className='space-y-3'>
            <p>{cloudConfigError || 'Could not load Cloud connection.'}</p>
            {hasUnreadablePairing && (
              <p>
                Unlock the system keyring used when this device was paired, then retry. If it cannot be restored, reset
                the local pairing. Check Cloud &gt; Devices and remove the old device there if it is still paired. Local
                attendance data stays on this computer.
              </p>
            )}
            <button
              type='button'
              onClick={() => void refreshCloudSyncConfig()}
              className='text-xs font-semibold text-cyan-400'>
              Retry
            </button>
            {hasUnreadablePairing && (
              <button
                type='button'
                onClick={() => void handleDisconnect()}
                disabled={busyAction !== null}
                className='ml-4 text-xs font-semibold text-white/70 underline underline-offset-4 disabled:opacity-40'>
                {busyAction === 'disconnecting' ? 'Resetting…' : 'Reset local pairing'}
              </button>
            )}
          </div>
        }
      </div>
    )
  }

  return (
    <div className='mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10'>
      <motion.div layout transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} className='overflow-hidden'>
        {/* Elevated Header Row */}
        <div className='flex items-start justify-between gap-8 border-b border-white/5 pt-6 pb-4'>
          <div className='max-w-xl min-w-0 flex-1'>
            <h3 className='flex flex-wrap items-center gap-2 text-sm font-medium text-white/90 select-none'>
              <span>
                {config.connected ? `Connected to ${serverDisplayName}` : `Not connected to ${serverDisplayName}`}
              </span>
              {config.connected && (config.organizationName || config.siteName) && (
                <span className='rounded bg-white/[0.06] px-2 py-0.5 text-[11px] font-normal text-white/60'>
                  {[config.organizationName, config.siteName].filter(Boolean).join(' / ')}
                </span>
              )}
            </h3>
            <p className='mt-0.5 text-xs text-white/60'>
              {config.connected ?
                <>
                  Attendance records sync automatically.{' '}
                  <button
                    type='button'
                    onClick={() => setShowPrivacyModal(true)}
                    className='inline font-medium text-white/45 transition-colors hover:text-white/80 hover:underline'>
                    Cloud sync & privacy
                  </button>
                </>
              : <>
                  Connect this computer to Facenox Cloud to enable sync and policy updates.{' '}
                  <button
                    type='button'
                    onClick={() => setShowPrivacyModal(true)}
                    className='inline font-medium text-white/45 transition-colors hover:text-white/80 hover:underline'>
                    Learn more
                  </button>
                </>
              }
            </p>
          </div>
          <div className='mt-0.5 flex shrink-0 items-center'>
            <button
              onClick={() => setShowAdvanced((value) => !value)}
              className='group flex items-center gap-1.5 text-xs font-semibold text-white/45 transition hover:text-white/70'>
              <span>{showAdvanced ? 'Hide advanced' : 'Advanced settings'}</span>
              {showAdvanced ?
                <ChevronUp className='size-2.5' />
              : <ChevronDown className='size-2.5' />}
            </button>
          </div>
        </div>

        <motion.div layout transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} className='py-2'>
          <div className='flex flex-col gap-4 py-4'>
            {!config.connected ?
              <div className='space-y-1 text-xs'>
                <div className='font-medium text-white/70'>Device not paired</div>
                <p className='text-[11px] text-white/45'>
                  Reload or open Cloud onboarding to link this computer with an organization.
                </p>
              </div>
            : <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                <div className='space-y-1.5 text-xs'>
                  {config.lastSyncStatus === 'error' ?
                    (() => {
                      const errInfo = parseSyncError(config.lastSyncMessage)
                      const isOfficial = isOfficialCloudUrl(config.remoteBaseUrl)

                      if (errInfo.isPlanQuota) {
                        return (
                          <div className='space-y-1'>
                            <div className='flex flex-wrap items-center gap-2 font-medium text-amber-400'>
                              <span>
                                {errInfo.currentPeople !== undefined && errInfo.peopleLimit !== undefined ?
                                  `Plan limit reached (${errInfo.currentPeople} / ${errInfo.peopleLimit} members)`
                                : 'Plan member limit reached'}
                              </span>
                              {isOfficial && (
                                <a
                                  href={`${getEffectiveRemoteUrl(config.remoteBaseUrl)}${errInfo.actionUrl || '/pricing'}`}
                                  target='_blank'
                                  rel='noreferrer'
                                  className='text-amber-300 underline underline-offset-2 transition hover:text-amber-200'>
                                  View plans ↗
                                </a>
                              )}
                            </div>
                            <div className='flex flex-wrap items-center gap-2 text-[11px] text-white/40'>
                              {config.unsyncedRecordsCount !== undefined && config.unsyncedRecordsCount > 0 && (
                                <span>{formatQueuedRecords(config.unsyncedRecordsCount)}</span>
                              )}
                              <span>
                                {config.lastSyncedAt ?
                                  `Last synced ${new Date(config.lastSyncedAt).toLocaleString()}`
                                : 'No completed sync yet'}
                              </span>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div className='space-y-1'>
                          <div className='font-medium text-amber-400/90'>
                            <div>{errInfo.title}</div>
                            <ErrorText
                              message={errInfo.technicalDetails || errInfo.description}
                              summary={errInfo.technicalDetails ? errInfo.description : undefined}
                            />
                          </div>
                          <div className='flex flex-wrap items-center gap-2 text-[11px] text-white/40'>
                            {config.unsyncedRecordsCount !== undefined && config.unsyncedRecordsCount > 0 && (
                              <span>{formatQueuedRecords(config.unsyncedRecordsCount)}</span>
                            )}
                            <span>
                              {config.lastSyncedAt ?
                                `Last synced ${new Date(config.lastSyncedAt).toLocaleString()}`
                              : 'No completed sync yet'}
                            </span>
                          </div>
                        </div>
                      )
                    })()
                  : <div className='space-y-1'>
                      {config.unsyncedRecordsCount !== undefined && config.unsyncedRecordsCount > 0 ?
                        <div className='flex items-center gap-1.5 font-medium text-sky-400'>
                          <CloudUpload className='size-3' />
                          <span>{formatQueuedRecords(config.unsyncedRecordsCount)} for upload</span>
                        </div>
                      : config.unsyncedSessionsCount !== undefined && config.unsyncedSessionsCount > 0 ?
                        <div className='flex items-center gap-1.5 font-medium text-sky-400'>
                          <CloudUpload className='size-3' />
                          <span>Attendance updates queued for upload</span>
                        </div>
                      : !config.lastSyncedAt ?
                        <div className='font-medium text-white/65'>No completed sync yet</div>
                      : config.lastSyncMessage?.includes('Retrying automatically') ?
                        <div className='font-medium text-white/65'>Retrying sync shortly</div>
                      : (
                        config.unsyncedRecordsCount !== 0 ||
                        config.unsyncedSessionsCount !== 0 ||
                        config.lastSyncStatus !== 'success'
                      ) ?
                        <div className='font-medium text-white/65'>Current sync status unavailable</div>
                      : <div className='flex items-center gap-1.5 font-medium text-emerald-400'>
                          <Check className='size-3' />
                          <span>Up to date</span>
                        </div>
                      }
                      <div className='text-[11px] text-white/40'>
                        {config.lastSyncedAt ?
                          `Last synced ${new Date(config.lastSyncedAt).toLocaleString()}`
                        : 'Ready to sync'}
                      </div>
                    </div>
                  }
                </div>

                <div className='flex shrink-0 items-center gap-2 pt-0.5'>
                  <a
                    href={`${effectiveUrl}/app`}
                    target='_blank'
                    rel='noreferrer'
                    className='flex items-center gap-1.5 rounded border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/15 hover:text-cyan-200'>
                    <span>Open dashboard</span>
                    <ExternalLink className='size-3' />
                  </a>
                  <button
                    onClick={handleManualSync}
                    disabled={busyAction !== null}
                    className='flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'>
                    {busyAction === 'syncing' ?
                      <Spinner size='xs' color='white' />
                    : <RotateCw className='size-3' />}
                    Sync now
                  </button>
                </div>
              </div>
            }
          </div>
        </motion.div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className='overflow-hidden'>
              <div className='mt-4 grid gap-4 border-t border-white/5 pt-4'>
                <div className='space-y-1.5'>
                  <label className='text-[10px] font-extrabold tracking-widest text-white/45 uppercase'>
                    Device ID
                  </label>
                  <div className='flex items-center gap-2'>
                    <input
                      type='text'
                      readOnly
                      value={config.connected && config.deviceId ? config.deviceId : 'Not paired yet'}
                      className={`h-8.5 w-full rounded border border-white/10 bg-white/[0.02] px-3 font-mono text-[11px] outline-none select-all ${
                        config.connected && config.deviceId ? 'text-white/60' : 'text-white/25 italic'
                      }`}
                    />
                    <Tooltip
                      content={
                        !config.connected || !config.deviceId ?
                          'Device is not paired to Facenox Cloud'
                        : 'Copy Device ID'
                      }>
                      <span
                        className='inline-flex shrink-0'
                        tabIndex={!config.connected || !config.deviceId ? 0 : undefined}>
                        <button
                          type='button'
                          disabled={!config.connected || !config.deviceId}
                          onClick={() => {
                            if (!config.deviceId) return
                            void navigator.clipboard.writeText(config.deviceId)
                            setCopiedId(true)
                            setTimeout(() => setCopiedId(false), 2000)
                          }}
                          className='flex h-8.5 shrink-0 items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-3 text-[11px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 hover:disabled:bg-white/[0.04] hover:disabled:text-white/70'>
                          {copiedId ?
                            <Check className='size-3 text-emerald-400' />
                          : <Copy className='size-3' />}
                          {copiedId ? 'Copied' : 'Copy'}
                        </button>
                      </span>
                    </Tooltip>
                  </div>
                </div>

                {config.connected && (
                  <div className='flex items-center justify-between gap-4 border-t border-white/5 pt-4'>
                    <div className='space-y-0.5'>
                      <div className='text-xs font-medium text-white/85'>Unpair device</div>
                      <p className='text-[11px] text-white/45'>
                        Disconnect this computer from {config.organizationName || serverDisplayName} to connect to a
                        different organization.
                      </p>
                    </div>
                    <button
                      type='button'
                      onClick={handleDisconnect}
                      disabled={busyAction !== null}
                      className='flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-400 transition-all hover:border-rose-500/40 hover:bg-rose-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40'>
                      {busyAction === 'disconnecting' && <Spinner size='xs' color='white' />}
                      Unpair device
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <Modal isOpen={showUnpairModal} onClose={() => setShowUnpairModal(false)} title='Unpair device?' maxWidth='sm'>
        <div className='space-y-4'>
          <p className='text-xs leading-relaxed text-white/65'>
            This computer will stop syncing with {workspaceLabel}. You&apos;ll need to pair again to resume sync.
          </p>

          <label className='flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-white/20'>
            <input
              type='checkbox'
              checked={clearLocalDataOnUnpair}
              onChange={(e) => setClearLocalDataOnUnpair(e.target.checked)}
              className='mt-0.5 size-3.5 rounded border-white/20 bg-transparent accent-rose-500'
            />
            <span className='space-y-0.5'>
              <span className='block text-xs font-medium text-white/90'>
                Also clear local attendance data to connect to another organization
              </span>
              <span className='block text-[11px] leading-relaxed text-white/50'>
                Deletes people, groups, faces, and attendance logs stored on this device so you can pair with a
                different Cloud account or server.
              </span>
            </span>
          </label>

          <div className='flex items-center justify-end gap-2 pt-1'>
            <button
              type='button'
              onClick={() => setShowUnpairModal(false)}
              className='rounded-lg border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/75 transition hover:bg-white/10 hover:text-white'>
              Cancel
            </button>
            <button
              type='button'
              onClick={() => {
                setShowUnpairModal(false)
                void executeDisconnect(clearLocalDataOnUnpair)
              }}
              className='rounded-lg border border-rose-500/30 bg-rose-500/15 px-3.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-500/25'>
              Unpair
            </button>
          </div>
        </div>
      </Modal>

      <DataBoundariesModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        onNavigateToDB={onNavigateToDB}
      />
    </div>
  )
}

interface DataBoundariesModalProps {
  isOpen: boolean
  onClose: () => void
  onNavigateToDB?: () => void
}

function DataBoundariesModal({ isOpen, onClose, onNavigateToDB }: DataBoundariesModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth='max-w-[520px]' title='Cloud sync & privacy'>
      <div className='space-y-5 pt-2'>
        <p className='text-[12px] leading-relaxed text-white/65'>
          See what stays on this computer and what syncs with Facenox Cloud:
        </p>

        <div className='space-y-5 text-xs'>
          {/* Cloud Sync Section */}
          <div className='space-y-1'>
            <div className='text-[13px] font-semibold text-white/90'>Shared with Facenox Cloud</div>
            <p className='text-[11px] leading-relaxed text-white/50'>
              Organization, location, device name and ID, app version, member directory, attendance policies, records,
              sessions, and sync activity are sent to Facenox Cloud for reporting, management and sync encrypted face
              templates. Sync includes updates and removals, so keep separate backup files for recovery.
            </p>
          </div>

          {/* Local Processing Section */}
          <div className='space-y-2'>
            <div className='text-[13px] font-semibold text-white/90'>Local camera processing</div>
            <p className='text-[11px] leading-relaxed text-white/50'>
              Raw camera frames are processed locally and are <strong>never persisted to disk or uploaded</strong>.
            </p>
            <p className='text-[11px] leading-relaxed text-white/50'>
              Face templates are encrypted for Cloud sync. Cloud manages the location keys and decrypts templates in
              memory only when it needs to re-encrypt them during location transfers. Face recognition still runs on
              paired computers.
            </p>
          </div>

          <div className='space-y-1'>
            <div className='text-[13px] font-semibold text-white/90'>Remote administration</div>
            <p className='text-[11px] leading-relaxed text-white/50'>
              Pairing authorizes organization administrators to apply attendance policies and send supported device
              commands. These commands can remove local Facenox data, reset the local admin PIN, or request an update
              check. Command outcomes are returned to Cloud.
            </p>
          </div>
        </div>

        <div className='flex items-center justify-between border-t border-white/5 pt-4'>
          <div>
            {onNavigateToDB && (
              <button
                onClick={() => {
                  onClose()
                  onNavigateToDB()
                }}
                className='text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 hover:underline'>
                Manage data & storage →
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className='rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 hover:from-cyan-300 hover:to-cyan-400 active:scale-[0.97]'>
            Understood
          </button>
        </div>
      </div>
    </Modal>
  )
}
