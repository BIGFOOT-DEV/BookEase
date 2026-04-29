export default function PageWrapper({ title, subtitle, action, children }) {
  return (
    // pb-24 on mobile to clear the fixed bottom tab bar; md+ uses 8 (2rem)
    <div className="flex-1 p-4 pb-24 sm:p-6 md:pb-8 lg:p-8 max-w-5xl w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 sm:mb-8 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-800 truncate">{title}</h1>
          {subtitle && (
            <p className="text-neutral-500 mt-1 text-sm sm:text-base">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Content */}
      {children}
    </div>
  )
}
