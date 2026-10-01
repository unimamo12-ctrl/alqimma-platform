'use client';

export const Card = ({
  children,
  className = '',
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) => (
  <div
    className={`bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm${
      hover ? 'hover:shadow-md hover:border-gray-200 transition-all duration-200' : ''
    } ${className}`}
  >
    {children}
  </div>
);

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
}) => {
  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
    secondary: 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/70 dark:hover:bg-slate-900/60',
    danger: 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-100',
    ghost: 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Badge = ({
  children,
  variant = 'gray',
}: {
  children: React.ReactNode;
  variant?: 'gray' | 'green' | 'red' | 'amber' | 'indigo' | 'purple';
}) => {
  const variants = {
    gray: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400',
    green: 'bg-green-50 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300',
    red: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    purple: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium${variants[variant]}`}>
      {children}
    </span>
  );
};

export const PageHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{title}</h1>
      {subtitle && <p className="text-gray-500 dark:text-slate-400 mt-1">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const EmptyState = ({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) => (
  <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800">
    <div className="text-5xl mb-4">{icon}</div>
    <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-2">{title}</h3>
    {description && <p className="text-gray-500 dark:text-slate-400 mb-6 max-w-md mx-auto">{description}</p>}
    {action}
  </div>
);

export const Spinner = () => (
  <div className="flex justify-center py-20">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
  </div>
);

export const StatCard = ({
  icon,
  label,
  value,
  tone = 'indigo',
}: {
  icon: string;
  label: string;
  value: string | number;
  tone?: 'indigo' | 'purple' | 'red' | 'green' | 'amber' | 'cyan';
}) => {
  const tones = {
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    purple: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600',
    red: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
    green: 'bg-green-50 dark:bg-emerald-500/10 text-green-600 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600',
    cyan: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600',
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl${tones[tone]}`}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</div>
          <div className="text-sm text-gray-500 dark:text-slate-400">{label}</div>
        </div>
      </div>
    </Card>
  );
};
