import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * AvatarUpload
 *
 * Uploads to Supabase Storage and calls onSave(publicUrl) immediately
 * after a successful upload. The image is displayed with object-contain
 * so the full photo is always visible without any cropping.
 *
 * Props:
 *   userId      – auth user UUID (storage folder prefix)
 *   currentUrl  – existing avatar_url from profile
 *   displayName – used for the gradient-initial fallback
 *   onSave(url) – called with the clean public URL after upload
 *   size        – 'sm' | 'md' | 'lg'
 */
export default function AvatarUpload({
  userId,
  currentUrl,
  currentPosition, // kept for API compat, no longer used for display
  displayName,
  onSave,
  size = 'md',
}) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(currentUrl || null)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef()

  // Stay in sync if parent profile reloads
  useEffect(() => {
    if (currentUrl) setPreview(currentUrl)
  }, [currentUrl])

  const sizeMap = {
    sm: { wrap: 'w-16 h-16', text: 'text-xl'  },
    md: { wrap: 'w-24 h-24', text: 'text-3xl' },
    lg: { wrap: 'w-28 h-28', text: 'text-4xl' },
  }
  const sz = sizeMap[size] || sizeMap.md

  function openFilePicker() {
    if (!userId) { setUploadError('Profile not loaded — please wait.'); return }
    setUploadError(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be smaller than 5 MB.')
      return
    }

    // Show instant local preview
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    setUploadError(null)

    try {
      const ext  = file.name.split('.').pop().toLowerCase() || 'jpg'
      const path = `${userId}/avatar.${ext}`

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (upErr) {
        console.error('[AvatarUpload] upload error:', upErr)
        setUploadError(`Upload failed: ${upErr.message}`)
        setPreview(currentUrl || null)
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

      // Cache-buster for the local preview only; save the clean URL to DB
      setPreview(`${publicUrl}?t=${Date.now()}`)
      onSave(publicUrl)
    } catch (err) {
      console.error('[AvatarUpload] unexpected error:', err)
      setUploadError(`Error: ${err.message}`)
      setPreview(currentUrl || null)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar — object-contain so the full image is always visible */}
      <div
        className={`relative ${sz.wrap} rounded-2xl overflow-hidden
          shadow-sm border-2 border-white ring-1 ring-neutral-100
          bg-neutral-50 shrink-0`}
      >
        {preview ? (
          <img
            src={preview}
            alt={displayName || 'Profile photo'}
            className="w-full h-full object-contain"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br from-primary-400 to-teal-400
              flex items-center justify-center font-bold text-white ${sz.text}`}
          >
            {displayName?.[0]?.toUpperCase() || '?'}
          </div>
        )}

        {/* Upload spinner overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Upload / change button */}
      <button
        type="button"
        onClick={openFilePicker}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 text-xs font-medium
          text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100
          px-3 py-1.5 rounded-lg transition-colors
          disabled:opacity-50 disabled:cursor-wait"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {uploading ? 'Uploading…' : preview ? 'Change Photo' : 'Upload Photo'}
      </button>

      {uploadError && (
        <p className="text-xs text-red-500 text-center max-w-[200px]">{uploadError}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
