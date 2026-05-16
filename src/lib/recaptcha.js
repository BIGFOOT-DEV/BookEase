/**
 * reCAPTCHA v3 utility
 * Wraps the grecaptcha global that's loaded via index.html script tag.
 */

/**
 * Execute reCAPTCHA v3 and return the token.
 * Includes a try/catch inside the ready() callback (errors there are outside
 * the Promise constructor scope and would otherwise hang forever) and a
 * 10-second timeout so the button never spins indefinitely.
 *
 * @param {string} action - Identifier for this action (e.g. 'book_appointment')
 * @returns {Promise<string>} reCAPTCHA token to send to the server
 */
export function executeRecaptcha(action = 'book_appointment') {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY

  return new Promise((resolve, reject) => {
    // 10-second safety net — if reCAPTCHA never responds, reject cleanly
    const timer = setTimeout(
      () => reject(new Error('reCAPTCHA timed out')),
      10_000,
    )

    const done = (fn) => (...args) => { clearTimeout(timer); fn(...args) }

    if (typeof window === 'undefined' || !window.grecaptcha) {
      clearTimeout(timer)
      reject(new Error('reCAPTCHA not loaded'))
      return
    }

    // IMPORTANT: errors thrown synchronously inside ready()'s callback are
    // outside the Promise constructor scope, so they would silently swallow
    // and leave this Promise permanently pending (button spins forever).
    // The try/catch here ensures they always reach reject().
    window.grecaptcha.ready(() => {
      try {
        window.grecaptcha
          .execute(siteKey, { action })
          .then(done(resolve))
          .catch(done(reject))
      } catch (err) {
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

