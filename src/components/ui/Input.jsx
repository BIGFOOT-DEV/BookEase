export default function Input({
  label,
  error,
  className = '',
  id,
  type = 'text',
  ...props
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-neutral-700"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        type={type}
        className={`
          w-full px-4 py-2.5
          bg-white border border-neutral-200 rounded-xl
          text-neutral-800 placeholder-neutral-400
          focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
          transition-all duration-200
          ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-sm text-red-500 mt-1">{error}</p>
      )}
    </div>
  )
}
