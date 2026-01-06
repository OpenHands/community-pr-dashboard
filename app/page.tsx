'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import PrTable from '@/components/PrTable'
import RepositorySelector from '@/components/RepositorySelector'
import CustomDropdown from '@/components/CustomDropdown'
import LoadingSpinner from '@/components/LoadingSpinner'
import WhatsNew from '@/components/WhatsNew'
import { DashboardData, FilterState } from '@/lib/types'

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [showAllReviewers, setShowAllReviewers] = useState(false)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const [filters, setFilters] = useState<FilterState>({
    repositories: [],
    labels: [],
    ageRange: 'all', // Default to All Time - no filtering
    status: 'all',
    noReviewers: false,
    limit: 'all',
    draftStatus: 'all',
    authorType: 'all',
    reviewer: 'all'
  })
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    repositories: [],
    labels: [],
    ageRange: 'all', // Default to All Time - no filtering
    status: 'all',
    noReviewers: false,
    limit: 'all',
    draftStatus: 'all',
    authorType: 'all',
    reviewer: 'all'
  })

  const fetchData = useCallback(async (filtersToApply?: FilterState) => {
    const targetFilters = filtersToApply || appliedFilters
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      if (targetFilters.repositories.length > 0) {
        params.append('repos', targetFilters.repositories.join(','))
      }
      if (targetFilters.labels.length > 0) {
        params.append('labels', targetFilters.labels.join(','))
      }
      if (targetFilters.ageRange !== 'all') {
        params.append('age', targetFilters.ageRange)
      }
      if (targetFilters.status && targetFilters.status !== 'all') {
        params.append('status', targetFilters.status)
      }
      if (targetFilters.noReviewers) {
        params.append('noReviewers', 'true')
      }
      if (targetFilters.limit && targetFilters.limit !== 'all') {
        params.append('limit', targetFilters.limit)
      }
      if (targetFilters.draftStatus && targetFilters.draftStatus !== 'all') {
        params.append('draftStatus', targetFilters.draftStatus)
      }
      if (targetFilters.authorType && targetFilters.authorType !== 'all') {
        params.append('authorType', targetFilters.authorType)
      }
      if (targetFilters.reviewer && targetFilters.reviewer !== 'all') {
        params.append('reviewer', targetFilters.reviewer)
      }

      const response = await fetch(`/api/dashboard?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }
      
      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [appliedFilters])

  // Initial load
  useEffect(() => {
    fetchData()
  }, [fetchData])
  
  // Set up auto-refresh interval
  useEffect(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
    }
    
    // Set up new interval
    refreshIntervalRef.current = setInterval(() => {
      fetchData()
    }, 120000) // 2 minutes
    
    // Cleanup on unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [fetchData])

  const handleClearFilters = () => {
    const clearedFilters = {
      repositories: [],
      labels: [],
      ageRange: 'all', // Default to All Time - no filtering
      status: 'all',
      noReviewers: false,
      limit: 'all',
      draftStatus: 'all',
      authorType: 'all',
      reviewer: 'all'
    }
    setFilters(clearedFilters)
    setAppliedFilters(clearedFilters)
    fetchData(clearedFilters)
  }

  const handleRefresh = () => {
    fetchData()
  }

  // Compute unique reviewers from all PRs for the filter dropdown
  const reviewerOptions = useMemo(() => {
    if (!data?.prs) return [{ value: 'all', label: 'All Reviewers' }]
    
    const reviewerSet = new Set<string>()
    data.prs.forEach(pr => {
      pr.requestedReviewers.users.forEach(reviewer => {
        reviewerSet.add(reviewer)
      })
    })
    
    const sortedReviewers = Array.from(reviewerSet).sort((a, b) => 
      a.toLowerCase().localeCompare(b.toLowerCase())
    )
    
    return [
      { value: 'all', label: 'All Reviewers' },
      ...sortedReviewers.map(reviewer => ({ value: reviewer, label: reviewer }))
    ]
  }, [data?.prs])

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header - Matching wireframe exactly */}
      <header className={`${darkMode ? 'bg-gray-800' : 'bg-white'} border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="flex justify-between items-center py-4">
            <div className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} flex items-center`}>
              OpenHands PR Review Dashboard
              <WhatsNew darkMode={darkMode} />
            </div>
            <div className="flex items-center gap-4">
              <RepositorySelector
                value={filters.repositories}
                onChange={(repos) => {
                  const newFilters = { ...filters, repositories: repos }
                  setFilters(newFilters)
                  setAppliedFilters(newFilters)
                  fetchData(newFilters)
                }}
                className="min-w-[200px]"
                darkMode={darkMode}
              />
              <button 
                onClick={handleRefresh}
                disabled={loading}
                className={`px-3 py-1 text-sm ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white disabled:bg-gray-800' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:bg-gray-50'} rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Refresh data"
              >
                {loading ? '⟳ Refreshing...' : '🔄 Refresh'}
              </button>
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className={`px-3 py-1 text-sm ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded border transition-colors`}
              >
                {darkMode ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5">
        {/* KPI Section - Matching wireframe layout */}
        <section className="py-6">
          <h2 className={`text-xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Key Performance Indicators
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Community PRs Open
              </h3>
              <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {data?.kpis.openCommunityPrs || 0}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Non-employee authored</div>
            </div>
            
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                % Community PRs
              </h3>
              <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {data?.kpis.communityPrPercentage || '0%'}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Of all open PRs</div>
            </div>
            
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Median Time to First Response
              </h3>
              <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {data?.kpis.medianResponseTime || 'N/A'}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Target: ≤72h</div>
            </div>
            
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Assigned Reviewer Compliance
              </h3>
              <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {data?.kpis.reviewerCompliance || '0%'}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>PRs with assigned reviewers</div>
            </div>
          </div>
        </section>

        {/* Review Accountability Section - Matching wireframe */}
        <section className="py-6">
          <h2 className={`text-xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Review Accountability
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
              <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Current Review Load</h3>
              <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {data?.kpis.pendingReviews || 0}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total pending review requests</div>
            </div>
            
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
              <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Reviews Completed (Last 30 Days)</h3>
              <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {data?.reviewers?.reduce((sum, r) => sum + r.completedTotal, 0) || 0}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total reviews by team</div>
            </div>
            
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
              <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>PRs Without Reviewers</h3>
              <div className={`text-3xl font-bold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {data?.kpis.prsWithoutReviewers || 0}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Need reviewer assignment</div>
            </div>
          </div>
        </section>

        {/* Reviewer Stats Section - New enhanced section */}
        <section className="py-6">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className={`text-sm font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Reviewer Statistics (Last 30 Days)</h3>
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Sorted by reviews completed</div>
              </div>
              <button
                onClick={() => setShowAllReviewers(!showAllReviewers)}
                className={`px-3 py-1 text-xs ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded border transition-colors`}
              >
                {showAllReviewers ? 'Show Top 5' : `Show All (${data?.reviewers?.length || 0})`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                    <th className={`text-left py-2 px-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Reviewer</th>
                    <th className={`text-center py-2 px-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Community PRs</span>
                        <span className={`cursor-help ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} title="Number of unique community PRs reviewed (external contributors without write access). Median shows time from PR ready-for-review to this reviewer's first review. Only counts merged PRs.">ⓘ</span>
                      </div>
                      <div className={`text-[10px] font-normal ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>(count / median)</div>
                    </th>
                    <th className={`text-center py-2 px-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Org Member PRs</span>
                        <span className={`cursor-help ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} title="Number of unique org member PRs reviewed (employees and collaborators with write access). Median shows time from PR ready-for-review to this reviewer's first review. Only counts merged PRs.">ⓘ</span>
                      </div>
                      <div className={`text-[10px] font-normal ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>(count / median)</div>
                    </th>
                    <th className={`text-center py-2 px-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Bot PRs</span>
                        <span className={`cursor-help ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} title="Number of unique bot PRs reviewed (dependabot, renovate, etc.). Median shows time from PR ready-for-review to this reviewer's first review. Only counts merged PRs.">ⓘ</span>
                      </div>
                      <div className={`text-[10px] font-normal ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>(count / median)</div>
                    </th>
                    <th className={`text-center py-2 px-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Completed Reviews</span>
                        <span className={`cursor-help ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} title="Total review actions submitted on merged PRs. Includes multiple reviews on the same PR (comments, changes requested, approvals). Counts all author types including bots.">ⓘ</span>
                      </div>
                      <div className={`text-[10px] font-normal ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>(total / requested / unrequested)</div>
                    </th>
                    <th className={`text-center py-2 px-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Requested</span>
                        <span className={`cursor-help ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} title="Total review requests received in the last 30 days.">ⓘ</span>
                      </div>
                    </th>
                    <th className={`text-center py-2 px-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Completion %</span>
                        <span className={`cursor-help ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} title="Percentage of review requests that were completed (Completed Requested / Requested Total).">ⓘ</span>
                      </div>
                    </th>
                    <th className={`text-center py-2 px-2 text-xs font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>Pending</span>
                        <span className={`cursor-help ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} title="Number of open PRs currently awaiting review from this person.">ⓘ</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllReviewers ? data?.reviewers : data?.reviewers?.slice(0, 5))?.map((reviewer, index) => {
                    const formatMedianTime = (hours: number | null | undefined) => {
                      if (hours === null || hours === undefined) return 'N/A';
                      if (hours < 1) {
                        const minutes = Math.round(hours * 60);
                        return `${minutes}m`;
                      }
                      if (hours < 24) return `${Math.round(hours)}h`;
                      return `${Math.round(hours / 24)}d`;
                    };
                    const formatCompletionRate = (rate: number | null) => {
                      if (rate === null) return 'N/A';
                      return `${Math.round(rate)}%`;
                    };
                    return (
                      <tr key={index} className={`border-b last:border-b-0 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <td className={`py-2 px-2 text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{reviewer.name}</td>
                        <td className={`py-2 px-2 text-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          {reviewer.communityPRsReviewed !== undefined && reviewer.communityPRsReviewed > 0 ? (
                            <>
                              <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs font-semibold">{reviewer.communityPRsReviewed}</span>
                              <span className={`mx-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>/</span>
                              <span>{formatMedianTime(reviewer.medianCommunityReviewTimeHours)}</span>
                            </>
                          ) : (
                            <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>-</span>
                          )}
                        </td>
                        <td className={`py-2 px-2 text-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          {reviewer.orgMemberPRsReviewed !== undefined && reviewer.orgMemberPRsReviewed > 0 ? (
                            <>
                              <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs font-semibold">{reviewer.orgMemberPRsReviewed}</span>
                              <span className={`mx-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>/</span>
                              <span>{formatMedianTime(reviewer.medianOrgMemberReviewTimeHours)}</span>
                            </>
                          ) : (
                            <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>-</span>
                          )}
                        </td>
                        <td className={`py-2 px-2 text-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          {reviewer.botPRsReviewed !== undefined && reviewer.botPRsReviewed > 0 ? (
                            <>
                              <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs font-semibold">{reviewer.botPRsReviewed}</span>
                              <span className={`mx-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>/</span>
                              <span>{formatMedianTime(reviewer.medianBotReviewTimeHours)}</span>
                            </>
                          ) : (
                            <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>-</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {reviewer.completedTotal}
                          </span>
                          <span className={`text-xs ml-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            / {reviewer.completedRequested} / {reviewer.completedUnrequested}
                          </span>
                        </td>
                        <td className={`py-2 px-2 text-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          {reviewer.requestedTotal}
                        </td>
                        <td className={`py-2 px-2 text-center text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          {formatCompletionRate(reviewer.completionRate)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {reviewer.pendingCount > 0 ? (
                            <span className="bg-red-500 text-white px-2 py-1 rounded-full text-xs font-semibold">
                              {reviewer.pendingCount}
                            </span>
                          ) : (
                            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>0</span>
                          )}
                        </td>
                      </tr>
                    );
                  }) || (
                    <tr>
                      <td colSpan={8} className={`py-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        No reviewer data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Filters Section - Matching wireframe exactly */}
        <section className="py-6">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-5 shadow-sm`}>
            <h3 className={`text-sm font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Filters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 mb-4">
              <div className="flex flex-col">
                <label className={`text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Repository</label>
                <RepositorySelector
                  value={filters.repositories}
                  onChange={(repos) => {
                    const newFilters = { ...filters, repositories: repos }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    fetchData(newFilters)
                  }}
                  className="w-full"
                  darkMode={darkMode}
                />
              </div>
              
              <div className="flex flex-col">
                <label className={`text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Age</label>
                <CustomDropdown
                  options={[
                    { value: 'all', label: 'All Time' },
                    { value: '0-24', label: '0-24 hours' },
                    { value: '2-days', label: 'Last 2 days' },
                    { value: '3-days', label: 'Last 3 days' },
                    { value: '7-days', label: 'Last 7 days' },
                    { value: '30-days', label: 'Last 30 days' }
                  ]}
                  value={filters.ageRange}
                  onChange={(value) => {
                    const newFilters = { ...filters, ageRange: value as string }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    fetchData(newFilters)
                  }}
                  placeholder="All Time"
                  darkMode={darkMode}
                />
              </div>
              
              <div className="flex flex-col">
                <label className={`text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Labels</label>
                <input 
                  type="text" 
                  className={`px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  placeholder="needs-review, bug, feature"
                  value={filters.labels.join(', ')}
                  onChange={(e) => {
                    const labels = e.target.value.split(',').map(l => l.trim()).filter(l => l)
                    const newFilters = { ...filters, labels }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    fetchData(newFilters)
                  }}
                />
              </div>
              
              <div className="flex flex-col">
                <label className={`text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Status</label>
                <CustomDropdown
                  options={[
                    { value: 'all', label: 'All Status' },
                    { value: 'needs-review', label: 'Needs Review' },
                    { value: 'changes-requested', label: 'Changes Requested' },
                    { value: 'approved', label: 'Approved' }
                  ]}
                  value={filters.status || 'all'}
                  onChange={(value) => {
                    const newFilters = { ...filters, status: value as string }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    fetchData(newFilters)
                  }}
                  placeholder="All Status"
                  darkMode={darkMode}
                />
              </div>
              
              <div className="flex flex-col">
                <label className={`text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Draft Status</label>
                <CustomDropdown
                  options={[
                    { value: 'all', label: 'All PRs' },
                    { value: 'drafts', label: 'Only Drafts' },
                    { value: 'final', label: 'No Drafts (Final)' }
                  ]}
                  value={filters.draftStatus || 'all'}
                  onChange={(value) => {
                    const newFilters = { ...filters, draftStatus: value as string }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    fetchData(newFilters)
                  }}
                  placeholder="All PRs"
                  darkMode={darkMode}
                />
              </div>
              
              <div className="flex flex-col">
                <label className={`text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Author Type</label>
                <CustomDropdown
                  options={[
                    { value: 'all', label: 'All Authors' },
                    { value: 'community', label: 'Community' },
                    { value: 'employee', label: 'Employee' },
                    { value: 'maintainer', label: 'Maintainer' },
                    { value: 'bot', label: 'Bot' }
                  ]}
                  value={filters.authorType || 'all'}
                  onChange={(value) => {
                    const newFilters = { ...filters, authorType: value as string }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    fetchData(newFilters)
                  }}
                  placeholder="All Authors"
                  darkMode={darkMode}
                />
              </div>
              
              <div className="flex flex-col">
                <label className={`text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Reviewer</label>
                <CustomDropdown
                  options={reviewerOptions}
                  value={filters.reviewer || 'all'}
                  onChange={(value) => {
                    const newFilters = { ...filters, reviewer: value as string, noReviewers: false }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    fetchData(newFilters)
                  }}
                  placeholder="All Reviewers"
                  darkMode={darkMode}
                />
              </div>
              
              <div className="flex flex-col">
                <label className={`text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>No Reviewer</label>
                <div className="flex items-center h-[38px]">
                  <input
                    type="checkbox"
                    id="noReviewers"
                    checked={filters.noReviewers || false}
                    onChange={(e) => {
                      const newFilters = { ...filters, noReviewers: e.target.checked, reviewer: e.target.checked ? 'all' : filters.reviewer }
                      setFilters(newFilters)
                      setAppliedFilters(newFilters)
                      fetchData(newFilters)
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label 
                    htmlFor="noReviewers" 
                    className={`ml-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    None assigned
                  </label>
                </div>
              </div>
            </div>
            
            {/* Filter Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClearFilters}
                className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                  darkMode
                    ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
              >
                Clear All
              </button>
            </div>
          </div>
        </section>

        {/* PR Table Section */}
        <section className="py-6">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg shadow-sm overflow-hidden`}>
            <div className={`px-5 py-4 border-b ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} flex justify-between items-center`}>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Community Pull Requests</h3>
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Limit:</label>
                <CustomDropdown
                  options={[
                    { value: 'all', label: 'All PRs' },
                    { value: '12', label: '12 PRs' },
                    { value: '36', label: '36 PRs' },
                    { value: '96', label: '96 PRs' }
                  ]}
                  value={filters.limit || 'all'}
                  onChange={(value) => {
                    const newFilters = { ...filters, limit: value as string }
                    setFilters(newFilters)
                    setAppliedFilters(newFilters)
                    fetchData(newFilters)
                  }}
                  placeholder="All PRs"
                  darkMode={darkMode}
                  className="min-w-[120px]"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <PrTable prs={data?.prs || []} darkMode={darkMode} totalPrs={data?.totalPrs} />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className={`py-6 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Data refreshed every 2 minutes • 
          <span className="ml-1">
            Last updated: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Never'}
          </span>
        </footer>
      </div>
    </div>
  )
}
