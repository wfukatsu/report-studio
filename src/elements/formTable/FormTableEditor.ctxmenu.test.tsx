import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormTableEditor } from './FormTableEditor'
import { createFormTableElement } from '@/lib/elementFactories'
import type { FormTableElement } from '@/types'

function setup() {
  const el = createFormTableElement() as FormTableElement
  const onChange = vi.fn()
  const onExitEditMode = vi.fn()
  render(
    <FormTableEditor
      element={el}
      onChange={onChange}
      onExitEditMode={onExitEditMode}
    />,
  )
  return { el, onChange, onExitEditMode }
}

function openMenuOnFirstCell() {
  const cell = document.querySelector('[data-cell-id]')!
  fireEvent.contextMenu(cell, { clientX: 50, clientY: 50 })
  return screen.getByRole('menu')
}

describe('FormTableEditor context menu (#302)', () => {
  it('a real mousedown+click on a menu item fires the action and keeps edit mode', () => {
    const { onChange, onExitEditMode } = setup()
    openMenuOnFirstCell()

    const item = screen.getByRole('menuitem', { name: '下に行を挿入' })
    // Real mouse sequence: mousedown (document listeners) then click
    fireEvent.mouseDown(item)
    // Menu must survive the mousedown — previously edit mode exited here (#302)
    expect(screen.queryByRole('menu')).not.toBeNull()
    expect(onExitEditMode).not.toHaveBeenCalled()
    fireEvent.click(item)

    expect(onChange).toHaveBeenCalledTimes(1)
    const patch = onChange.mock.calls[0][0] as Partial<FormTableElement>
    expect(patch.rows).toBeDefined()
    expect(onExitEditMode).not.toHaveBeenCalled()
  })

  it('mousedown outside both the table and the menu still exits edit mode', () => {
    const { onExitEditMode } = setup()
    fireEvent.mouseDown(document.body)
    expect(onExitEditMode).toHaveBeenCalledTimes(1)
  })
})
