'use client';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  darkMode?: boolean;
}

export function Tooltip({ content, children, darkMode = false }: TooltipProps) {
  return (
    <div className="relative inline-flex items-center gap-1 cursor-help group">
      {children}
      <div
        className={`absolute z-[100] px-3 py-2 text-sm rounded-lg shadow-lg 
          opacity-0 invisible group-hover:opacity-100 group-hover:visible
          transition-opacity duration-200
          top-full left-1/2 -translate-x-1/2 mt-2
          whitespace-normal text-left font-normal
          ${darkMode 
            ? 'bg-gray-700 text-gray-100 border border-gray-600' 
            : 'bg-gray-900 text-white'
          }`}
        style={{ width: '280px' }}
      >
        {content}
        <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 ${
          darkMode ? 'bg-gray-700 border-l border-t border-gray-600' : 'bg-gray-900'
        }`} />
      </div>
    </div>
  );
}
