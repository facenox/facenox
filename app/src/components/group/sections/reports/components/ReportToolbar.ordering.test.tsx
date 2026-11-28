import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ReportToolbar } from './ReportToolbar'

it.each([
  ['none', false],
  ['date', false],
  ['person', false],
  ['none', true]
] as const)('explains %s grouping with visits enabled as %s without adding a sort control', (groupBy, visits) => {
  render(
    <ReportToolbar
      startDate='2026-04-01'
      endDate='2026-04-02'
      onStartDateChange={vi.fn()}
      onEndDateChange={vi.fn()}
      visibleColumns={['name', 'date']}
      setVisibleColumns={vi.fn()}
      groupBy={groupBy}
      setGroupBy={vi.fn()}
      statusFilter='all'
      setStatusFilter={vi.fn()}
      search=''
      setSearch={vi.fn()}
      allColumns={[
        { key: 'name', label: 'Name' },
        { key: 'date', label: 'Date' },
        ...(visits ? [{ key: 'visit_number' as const, label: 'Visit' }] : [])
      ]}
      unavailableColumns={[]}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Report options' }))
  const orderDescription =
    groupBy === 'person' ?
      'Names A-Z, newest dates within each person.'
    : 'Newest dates first, names A-Z within each date.'
  expect(screen.getByText(orderDescription + (visits ? ' Visits follow visit number.' : ''))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /sort/i })).not.toBeInTheDocument()
})

it('disables date presets older than maxReportDays and marks them Starter+', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-20T12:00:00Z'))
  try {
    render(
      <ReportToolbar
        startDate='2026-04-20'
        endDate='2026-04-20'
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        visibleColumns={['name', 'date']}
        setVisibleColumns={vi.fn()}
        groupBy='none'
        setGroupBy={vi.fn()}
        statusFilter='all'
        setStatusFilter={vi.fn()}
        search=''
        setSearch={vi.fn()}
        allColumns={[
          { key: 'name', label: 'Name' },
          { key: 'date', label: 'Date' }
        ]}
        unavailableColumns={[]}
        attendanceTimeZone='UTC'
        maxReportDays={7}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Today/i }))
    expect(screen.getByRole('button', { name: 'Last 7 Days' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /This Month/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Last 30 Days/i })).toBeDisabled()
  } finally {
    vi.useRealTimers()
  }
})
