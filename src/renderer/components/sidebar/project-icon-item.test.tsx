import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Project } from '@/types/project'
import { ProjectIconItem } from './project-icon-item'

const project = { id: 'p1', name: 'Docksly', path: '/repo', color: 'orange' } as Project

function renderIcon(crashed: boolean, worktree = false) {
  return render(
    <TooltipProvider>
      <ProjectIconItem
        project={project}
        isActive={false}
        crashed={crashed}
        worktree={worktree}
        onClick={vi.fn()}
        onContextMenu={vi.fn()}
      />
    </TooltipProvider>
  )
}

describe('ProjectIconItem (collapsed Rail)', () => {
  it('puts a red dot on the icon corner and names the crash when a terminal crashed', () => {
    renderIcon(true)
    const row = screen.getByRole('button', { name: 'Project: Docksly, terminal crashed' })
    const dot = row.querySelector('[data-rail-project-crashed]')
    expect(dot).toHaveClass('bg-destructive', 'size-1.5', 'rounded-full', 'ring-background')
    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows no mark without a crash', () => {
    renderIcon(false)
    const row = screen.getByRole('button', { name: 'Project: Docksly' })
    expect(row.querySelector('[data-rail-project-crashed]')).toBeNull()
    expect(row.querySelector('[data-rail-project-worktree]')).toBeNull()
  })

  it('marks a picked worktree on the bottom corner and moves a crash dot to the top', () => {
    renderIcon(true, true)
    const row = screen.getByRole('button', { name: 'Project: Docksly, terminal crashed' })
    expect(row.querySelector('[data-rail-project-worktree]')).toHaveClass('-bottom-1.5', 'bg-muted')
    expect(row.querySelector('[data-rail-project-crashed]')).toHaveClass('-top-0.5')
  })
})
