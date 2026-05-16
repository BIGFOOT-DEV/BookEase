/**
 * reCAPTCHA v3 utility
 * Wraps the grecaptcha global that's loaded via index.html script tag.
 */

/**
 * Execute reCAPTCHA v3 and return the token.
 * @param {string} action - Identifier for this action (e.g. 'book_appointment')
 * @returns {Promise<string>} reCAPTCHA token to send to the server
 */
export function executeRecaptcha(action = 'book_appointment') {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.grecaptcha) {
      reject(new Error('reCAPTCHA not loaded'))
      return
    }
    window.grecaptcha.ready(() => {
      window.grecaptcha
        .execute(siteKey, { action })
        .then(resolve)
        .catch(reject)
    })
  })
}
