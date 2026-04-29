const variants = {
  primary:
    'bg-primary-500 hover:bg-primary-600 text-white shadow-soft hover:shadow-card active:scale-[0.98]',
  secondary:
    'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-200',
  coral:
    'bg-coral-500 hover:bg-coral-600 text-white shadow-soft hover:shadow-card active:scale-[0.98]',
  ghost:
    'bg-transparent hover:bg-neutral-100 text-neutral-600',
  danger:
    'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  loading = false,
  ...props
}) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        font-medium rounded-xl
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
