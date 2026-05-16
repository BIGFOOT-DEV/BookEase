/**
 * PasswordStrengthMeter — visual indicator for password quality.
 *
 * Shows:
 *  - A segmented bar (4 segments, filled based on score)
 *  - A label ("Weak", "Fair", "Good", "Strong")
 *  - A checklist of all 4 requirements (with ✓ / ✗)
 *
 * Usage:
 *   import PasswordStrengthMeter from '../components/ui/PasswordStrengthMeter'
 *   <PasswordStrengthMeter password={password} />
 */
import { checkPasswordStrength, REQUIREMENT_LABELS } from '../../lib/passwordStrength'

export default function PasswordStrengthMeter({ password }) {
  if (!password) return null

  const { score, label, color, barColor, isCommon, checks } = checkPasswordStrength(password)

  return (
    <div className="mt-2 space-y-2">
      {/* Segmented bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((seg) => (
          <div
            key={seg}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              seg <= score ? barColor : 'bg-neutral-200'
            }`}
          />
        ))}
      </div>

      {/* Label */}
      <div className="flex items-center justify-between">
        <p className={`text-xs font-semibold ${color}`}>{label}</p>
        {isCommon && (
          <p className="text-xs text-red-500">⚠ Common password — choose a unique one</p>
        )}
      </div>

      {/* Requirements checklist */}
      <ul className="space-y-0.5">
        {Object.entries(REQUIREMENT_LABELS).map(([key, text]) => (
          <li key={key} className="flex items-center gap-1.5 text-xs">
            {checks[key] ? (
              <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-neutral-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
              </svg>
            )}
            <span className={checks[key] ? 'text-neutral-500 line-through' : 'text-neutral-500'}>
              {text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
