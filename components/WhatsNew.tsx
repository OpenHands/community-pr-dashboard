'use client'

import { useState } from 'react'

interface WhatsNewProps {
  darkMode: boolean
}

export default function WhatsNew({ darkMode }: WhatsNewProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div className="relative inline-block ml-3 hidden md:inline-block">
      <span
        className={`text-sm font-normal cursor-default select-none ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        } hover:${darkMode ? 'text-gray-300' : 'text-gray-600'} transition-colors`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        ✨ What&apos;s New?
      </span>
      
      {isHovered && (
        <div className={`absolute top-full left-0 mt-2 w-80 p-4 rounded-lg shadow-lg border z-50 ${
          darkMode 
            ? 'bg-gray-800 border-gray-600 text-white' 
            : 'bg-white border-gray-200 text-gray-900'
        }`}>
          <div className="text-sm font-semibold mb-3 flex items-center">
            <span className="mr-2">✨</span>
            Latest Updates
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start">
              <span className={`mr-2 mt-0.5 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>•</span>
              <span>Auto-refresh: Dashboard now refreshes data every 2 minutes</span>
            </li>
            <li className="flex items-start">
              <span className={`mr-2 mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>•</span>
              <span>Manual refresh: Click the 🔄 Refresh button to update data anytime</span>
            </li>
            <li className="flex items-start">
              <span className={`mr-2 mt-0.5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>•</span>
              <span>PRs now sorted by creation date (newest first) by default</span>
            </li>
            <li className="flex items-start">
              <span className={`mr-2 mt-0.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>•</span>
              <span>Support for 26+ repositories across all-hands-ai & openhands orgs</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}