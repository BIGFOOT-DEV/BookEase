/**
 * BookEase Scheduling Engine
 * 
 * Core logic for time-slot generation, conflict detection, and duration-fit validation.
 * Per claude.md: this is the CRITICAL system that powers the booking flow.
 */

/**
 * Generate available time slots for a given date
 * 
 * @param {Object} params
 * @param {string} params.date - ISO date string (YYYY-MM-DD)
 * @param {Array} params.availability - Business availability for this day of week
 *   Each: { start_time: "09:00", end_time: "17:00" }
 * @param {Array} params.existingBookings - Already booked appointments
 *   Each: { start_time: ISO datetime, end_time: ISO datetime }
 * @param {number} params.durationMinutes - Service duration in minutes
 * @param {number} [params.intervalMinutes=30] - Slot interval (default 30 min)
 * @returns {Array<{start: Date, end: Date, label: string}>} Available slots
 */
export function generateTimeSlots({
  date,
  availability,
  existingBookings,
  durationMinutes,
  intervalMinutes = 30,
}) {
  const slots = []

  if (!availability || availability.length === 0) return slots

  // For today, filter out slots that have already passed.
  // Add a small 5-minute buffer so a slot starting "now" isn't offered.
  const cutoff = new Date(Date.now() + 5 * 60 * 1000)

  for (const window of availability) {
    const windowStart = parseTimeOnDate(date, window.start_time)
    const windowEnd   = parseTimeOnDate(date, window.end_time)

    let current = new Date(windowStart)

    while (current < windowEnd) {
      const slotEnd = new Date(current.getTime() + durationMinutes * 60000)

      // Duration-fit rule: full service must fit within working hours
      if (slotEnd > windowEnd) break

      // Skip slots that are already in the past (or within the 5-min buffer)
      if (slotEnd <= cutoff) {
        current = new Date(current.getTime() + intervalMinutes * 60000)
        continue
      }

      // Conflict detection: new_start < existing_end && new_end > existing_start
      const isConflict = existingBookings.some(
        (booking) =>
          current < new Date(booking.end_time) &&
          slotEnd > new Date(booking.start_time)
      )

      if (!isConflict) {
        slots.push({
          start: new Date(current),
          end:   new Date(slotEnd),
          label: formatTime(current),
        })
      }

      current = new Date(current.getTime() + intervalMinutes * 60000)
    }
  }

  return slots
}

/**
 * Check if a proposed booking conflicts with existing ones
 * Rule: new_start < existing_end && new_end > existing_start
 */
export function hasConflict(newStart, newEnd, existingBookings) {
  return existingBookings.some(
    (booking) =>
      newStart < new Date(booking.end_time) &&
      newEnd > new Date(booking.start_time)
  )
}

/**
 * Get the day of week (0=Sunday) for a date string
 */
export function getDayOfWeek(dateString) {
  return new Date(dateString).getDay()
}

/**
 * Parse a time string (HH:MM) on a specific date IN LOCAL TIME.
 * Important: new Date("YYYY-MM-DD") parses as UTC midnight, which
 * causes off-by-one-hour errors in UTC+ timezones. Using the
 * multi-arg Date constructor creates local time directly.
 */
function parseTimeOnDate(dateString, timeString) {
  const [year, month, day] = dateString.split('-').map(Number)
  const [hours, minutes] = timeString.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0) // local time
}

/**
 * Format a Date to a human-readable time (e.g., "9:00 AM")
 */
export function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Format a date for display (e.g., "Mon, Jan 15")
 */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Generate an array of dates for the next N days
 */
export function getNextDays(startDate, count = 30) {
  const days = []
  const start = new Date(startDate)
  for (let i = 0; i < count; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    days.push(date)
  }
  return days
}
