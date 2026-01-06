import { useState } from 'react';
import { PR } from '@/lib/types';
import Badge from './Badge';

interface PrTableProps {
  prs: PR[];
  loading?: boolean;
  darkMode?: boolean;
  totalPrs?: number;
}

type SortField = 'title' | 'author' | 'age' | 'created';
type SortDirection = 'asc' | 'desc';

export default function PrTable({ prs, loading = false, darkMode = false, totalPrs }: PrTableProps) {
  const [sortField, setSortField] = useState<SortField>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedPrs = [...prs].sort((a, b) => {
    let aValue: any;
    let bValue: any;

    switch (sortField) {
      case 'title':
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
        break;
      case 'author':
        aValue = a.authorLogin.toLowerCase();
        bValue = b.authorLogin.toLowerCase();
        break;
      case 'age':
        aValue = a.ageHours;
        bValue = b.ageHours;
        break;
      case 'created':
        aValue = new Date(a.createdAt).getTime();
        bValue = new Date(b.createdAt).getTime();
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className={`ml-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>↕</span>;
    }
    return (
      <span className={`ml-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };
  if (loading) {
    return (
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
        <div className="animate-pulse">
          <div className={`h-4 rounded w-1/4 mb-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`h-4 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6 text-center`}>
        <p className={`${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No PRs found matching the current filters.</p>
      </div>
    );
  }

  const formatAge = (ageHours: number) => {
    if (ageHours < 24) {
      return `${Math.round(ageHours)}h`;
    }
    return `${Math.round(ageHours / 24)}d`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Generate row count display text
  const getRowCountText = () => {
    const displayedCount = sortedPrs.length;
    if (totalPrs !== undefined && totalPrs !== displayedCount) {
      return `Showing ${displayedCount} of ${totalPrs} rows`;
    }
    return `${displayedCount} row${displayedCount !== 1 ? 's' : ''} total`;
  };

  return (
    <div className="overflow-x-auto">
      {/* Row count display */}
      <div className={`px-4 py-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
        {getRowCountText()}
      </div>
      <table className={`min-w-full divide-y ${darkMode ? 'divide-gray-600' : 'divide-gray-200'}`}>
        <thead className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
          <tr>
            <th 
              className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-opacity-75 ${darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => handleSort('title')}
            >
              <div className="flex items-center">
                PR
                <SortIcon field="title" />
              </div>
            </th>
            <th 
              className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-opacity-75 ${darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => handleSort('author')}
            >
              <div className="flex items-center">
                Author
                <SortIcon field="author" />
              </div>
            </th>
            <th 
              className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-opacity-75 ${darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-100'}`}
              onClick={() => handleSort('age')}
            >
              <div className="flex items-center">
                Age
                <SortIcon field="age" />
              </div>
            </th>
            <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
              Status
            </th>
            <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
              Reviewers
            </th>
          </tr>
        </thead>
        <tbody className={`divide-y ${darkMode ? 'divide-gray-600' : 'divide-gray-200'}`}>
            {sortedPrs.map((pr) => (
              <tr key={`${pr.repo}-${pr.number}`} className={`${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate max-w-xs"
                      title={pr.title}
                    >
                      {pr.title}
                    </a>
                    <div className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {pr.repo}#{pr.number}
                    </div>
                    {pr.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {pr.labels.slice(0, 3).map((label) => (
                          <Badge key={label} variant="default" className="text-xs">
                            {label}
                          </Badge>
                        ))}
                        {pr.labels.length > 3 && (
                          <Badge variant="default" className="text-xs">
                            +{pr.labels.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className={`text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{pr.authorLogin}</div>
                    <Badge variant={pr.authorType} className="ml-2">
                      {pr.authorType.charAt(0).toUpperCase() + pr.authorType.slice(1)}
                    </Badge>
                  </div>
                </td>
                
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className={`text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatAge(pr.ageHours)}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {formatDate(pr.createdAt)}
                  </div>
                </td>
                
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    {pr.isDraft && (
                      <Badge variant="default">Draft</Badge>
                    )}
                    {pr.needsFirstResponse && (
                      <Badge variant={pr.overdueFirstResponse ? 'overdue' : 'needs-response'}>
                        Needs Response
                      </Badge>
                    )}
                    {!pr.firstReviewAt && pr.overdueFirstReview && (
                      <Badge variant="overdue">
                        Overdue Review
                      </Badge>
                    )}
                  </div>
                </td>
                
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className={`text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {pr.requestedReviewers.users.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {pr.requestedReviewers.users.slice(0, 2).map((reviewer, idx) => (
                          <Badge key={`${reviewer}-${idx}`} variant="default">
                            {reviewer}
                          </Badge>
                        ))}
                        {pr.requestedReviewers.users.length > 2 && (
                          <Badge variant="default">
                            +{pr.requestedReviewers.users.length - 2}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}>No reviewers</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}