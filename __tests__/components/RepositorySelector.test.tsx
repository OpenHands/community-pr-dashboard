import { render, screen, fireEvent } from '@testing-library/react'
import RepositorySelector from '@/components/RepositorySelector'

const mockRepositories = [
  { id: 1, name: 'OpenHands', full_name: 'OpenHands/OpenHands', description: 'Main repo', stargazers_count: 35000, language: 'Python' },
  { id: 2, name: 'docs',      full_name: 'OpenHands/docs',      description: 'Docs',      stargazers_count: 100,   language: null },
]

describe('RepositorySelector', () => {
  it('renders the trigger button without crashing', () => {
    render(
      <RepositorySelector value={[]} onChange={() => {}} repositories={mockRepositories} />
    )
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('opens the dropdown without throwing when repositories are provided via props', () => {
    render(
      <RepositorySelector value={[]} onChange={() => {}} repositories={mockRepositories} />
    )

    fireEvent.click(screen.getByRole('button'))

    // Both repos must be visible — if `error` were still referenced this throws before paint
    expect(screen.getByText('OpenHands/OpenHands')).toBeInTheDocument()
    expect(screen.getByText('OpenHands/docs')).toBeInTheDocument()
  })

  it('shows selected repo count in trigger label', () => {
    render(
      <RepositorySelector value={['OpenHands/OpenHands', 'OpenHands/docs']} onChange={() => {}} repositories={mockRepositories} />
    )
    expect(screen.getByRole('button')).toHaveTextContent('2 repositories selected')
  })

  it('calls onChange with empty array when All Repositories is clicked', () => {
    const onChange = jest.fn()
    render(
      <RepositorySelector value={['OpenHands/OpenHands']} onChange={onChange} repositories={mockRepositories} />
    )

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('All Repositories'))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('calls onChange with toggled selection when a repo is clicked', () => {
    const onChange = jest.fn()
    render(
      <RepositorySelector value={[]} onChange={onChange} repositories={mockRepositories} />
    )

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('OpenHands/OpenHands'))

    expect(onChange).toHaveBeenCalledWith(['OpenHands/OpenHands'])
  })

  it('calls onChange removing a repo when an already-selected repo is clicked', () => {
    const onChange = jest.fn()
    render(
      <RepositorySelector value={['OpenHands/OpenHands']} onChange={onChange} repositories={mockRepositories} />
    )

    fireEvent.click(screen.getByRole('button'))
    // Trigger button also shows the repo name, so take the dropdown list item (last match)
    const matches = screen.getAllByText('OpenHands/OpenHands')
    fireEvent.click(matches[matches.length - 1])

    expect(onChange).toHaveBeenCalledWith([])
  })

  describe('pinnedRepos', () => {
    const extendedRepositories = [
      ...mockRepositories,
      { id: 3, name: 'benchmarks', full_name: 'OpenHands/benchmarks', description: null, stargazers_count: 50, language: null },
    ]

    it('renders pinned repos before the rest when pinnedRepos is provided', () => {
      render(
        <RepositorySelector
          value={[]}
          onChange={() => {}}
          repositories={extendedRepositories}
          pinnedRepos={['OpenHands/benchmarks']}
        />
      )

      fireEvent.click(screen.getByRole('button'))

      const items = screen.getAllByText(/OpenHands\//)
      // benchmarks is pinned so should appear before OpenHands and docs
      expect(items[0]).toHaveTextContent('OpenHands/benchmarks')
    })

    it('renders a divider when there are both pinned and unpinned repos', () => {
      const { container } = render(
        <RepositorySelector
          value={[]}
          onChange={() => {}}
          repositories={extendedRepositories}
          pinnedRepos={['OpenHands/benchmarks']}
        />
      )

      fireEvent.click(screen.getByRole('button'))

      expect(container.querySelector('.border-t')).toBeInTheDocument()
    })

    it('renders no divider when pinnedRepos is empty', () => {
      const { container } = render(
        <RepositorySelector
          value={[]}
          onChange={() => {}}
          repositories={mockRepositories}
        />
      )

      fireEvent.click(screen.getByRole('button'))

      expect(container.querySelector('.border-t')).not.toBeInTheDocument()
    })

    it('renders no divider when all repos are pinned', () => {
      const { container } = render(
        <RepositorySelector
          value={[]}
          onChange={() => {}}
          repositories={mockRepositories}
          pinnedRepos={['OpenHands/OpenHands', 'OpenHands/docs']}
        />
      )

      fireEvent.click(screen.getByRole('button'))

      expect(container.querySelector('.border-t')).not.toBeInTheDocument()
    })
  })
})
