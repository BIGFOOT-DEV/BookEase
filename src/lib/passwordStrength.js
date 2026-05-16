/**
 * BookEase Password Strength Checker
 *
 * Used at the UI layer to enforce bcrypt-friendly passwords BEFORE they reach
 * Supabase Auth (which handles the actual bcrypt hashing internally).
 *
 * Score scale:
 *   0 — Too Short   (< 8 chars)
 *   1 — Weak        (≥ 8 chars, but only 1 criterion met)
 *   2 — Fair        (2 criteria met)
 *   3 — Good        (3 criteria met)
 *   4 — Strong      (all 4 criteria met)
 */

/** Top-20 most common passwords we'll block outright */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123',
  '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop',
  'iloveyou', 'sunshine',
  'monkey123', 'dragon12',
  'football', 'baseball',
  'master12', 'hello123',
  'welcome1', 'shadow12',
  'princess', 'letmein1',
])

/**
 * Evaluate password strength.
 *
 * @param {string} password
 * @returns {{
 *   score: 0|1|2|3|4,
 *   label: string,
 *   color: string,           // Tailwind text colour class
 *   barColor: string,        // Tailwind bg colour class
 *   isStrong: boolean,       // true when score === 4 (submit allowed)
 *   isCommon: boolean,
 *   checks: {
 *     length: boolean,       // ≥ 8 chars
 *     uppercase: boolean,    // at least one A-Z
 *     number: boolean,       // at least one 0-9
 *     special: boolean,      // at least one special character
 *   }
 * }}
 */
export function checkPasswordStrength(password) {
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[^A-Za-z0-9]/.test(password),
  }

  const isCommon = COMMON_PASSWORDS.has(password.toLowerCase())

  // Each passing check adds 1 point, but if it's a common password → max score 1
  const rawScore = Object.values(checks).filter(Boolean).length
  const score    = isCommon ? Math.min(rawScore, 1) : rawScore

  const meta = [
    { label: 'Too Short',  color: 'text-neutral-400',  barColor: 'bg-neutral-200'  },
    { label: 'Weak',       color: 'text-red-500',       barColor: 'bg-red-400'      },
    { label: 'Fair',       color: 'text-orange-500',    barColor: 'bg-orange-400'   },
    { label: 'Good',       color: 'text-yellow-600',    barColor: 'bg-yellow-400'   },
    { label: 'Strong',     color: 'text-emerald-600',   barColor: 'bg-emerald-500'  },
  ][score]

  return {
    score,
    label:    meta.label,
    color:    meta.color,
    barColor: meta.barColor,
    isStrong: score === 4,
    isCommon,
    checks,
  }
}

/** Human-readable label for each requirement */
export const REQUIREMENT_LABELS = {
  length:    'At least 8 characters',
  uppercase: 'At least one uppercase letter (A–Z)',
  number:    'At least one number (0–9)',
  special:   'At least one special character (!@#$…)',
}
