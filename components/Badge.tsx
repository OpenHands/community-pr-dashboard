interface BadgeProps {
  children: React.ReactNode;
  variant?: 'community' | 'employee' | 'maintainer' | 'collaborator' | 'bot' | 'overdue' | 'needs-response' | 'default';
  className?: string;
}

export default function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants = {
    community: 'bg-blue-100 text-blue-800',
    employee: 'bg-green-100 text-green-800',
    maintainer: 'bg-purple-100 text-purple-800',
    collaborator: 'bg-amber-100 text-amber-800',
    bot: 'bg-gray-100 text-gray-600',
    overdue: 'bg-red-100 text-red-800',
    'needs-response': 'bg-yellow-100 text-yellow-800',
    default: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`
      inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
      ${variants[variant]} ${className}
    `}>
      {children}
    </span>
  );
}