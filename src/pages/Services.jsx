import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PageWrapper from '../components/layout/PageWrapper'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'

export default function Services() {
  const { profile } = useAuth()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_minutes: 30,
    image_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [imgUploading, setImgUploading] = useState(false)
  const [imgError, setImgError] = useState(null)
  const imgInputRef = useRef()

  useEffect(() => {
    if (profile?.id) loadServices()
  }, [profile])

  async function loadServices() {
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('business_id', profile.id)
      .order('created_at')
    setServices(data || [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', duration_minutes: 30, image_url: '' })
    setImgError(null)
    setShowModal(true)
  }

  function openEdit(service) {
    setEditing(service)
    setForm({
      name: service.name,
      description: service.description || '',
      duration_minutes: service.duration_minutes,
      image_url: service.image_url || '',
    })
    setImgError(null)
    setShowModal(true)
  }

  // Upload service image to Supabase Storage immediately on file select
  async function handleImageSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow re-selecting the same file

    if (file.size > 5 * 1024 * 1024) {
      setImgError('Image must be under 5 MB.')
      return
    }

    setImgError(null)
    setImgUploading(true)

    // Use a timestamp to guarantee a unique path per upload
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
    const filePath = `${profile.id}/${Date.now()}.${ext}`

    console.log('[Services] Uploading service image:', filePath)

    const { error: uploadErr } = await supabase.storage
      .from('service-images')
      .upload(filePath, file, { upsert: false, contentType: file.type })

    if (uploadErr) {
      console.error('[Services] Image upload error:', uploadErr)
      setImgError(`Upload failed: ${uploadErr.message}`)
      setImgUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('service-images')
      .getPublicUrl(filePath)

    setForm((f) => ({ ...f, image_url: `${publicUrl}?t=${Date.now()}` }))
    setImgUploading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      name: form.name,
      description: form.description,
      duration_minutes: form.duration_minutes,
      image_url: form.image_url || null,
    }

    if (editing) {
      await supabase
        .from('services')
        .update(payload)
        .eq('id', editing.id)
    } else {
      await supabase
        .from('services')
        .insert({ ...payload, business_id: profile.id })
    }

    setSaving(false)
    setShowModal(false)
    loadServices()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this service?')) return
    await supabase.from('services').delete().eq('id', id)
    loadServices()
  }

  return (
    <PageWrapper
      title="Services"
      subtitle="Manage the services customers can book"
      action={
        <Button variant="coral" onClick={openCreate}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Service
        </Button>
      }
    >
      {loading ? (
        <div className="text-center py-12 text-neutral-400">Loading...</div>
      ) : services.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-neutral-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-neutral-600 font-medium">No services yet</p>
            <p className="text-sm text-neutral-400 mt-1 mb-5">Add your first service to start accepting bookings</p>
            <Button variant="primary" onClick={openCreate}>Create Your First Service</Button>
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          {services.map((service) => (
            <div
              key={service.id}
              className="bg-white rounded-2xl shadow-card border border-neutral-100
                overflow-hidden hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-200"
            >
              {/* Service image banner */}
              {service.image_url ? (
                <div className="h-40 overflow-hidden">
                  <img
                    src={service.image_url}
                    alt={service.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-20 bg-gradient-to-br from-primary-50 to-teal-50
                  flex items-center justify-center border-b border-neutral-100">
                  <svg className="w-8 h-8 text-neutral-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}

              {/* Content */}
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-neutral-800">{service.name}</h3>
                    {service.description && (
                      <p className="text-sm text-neutral-500 mt-1 line-clamp-2">{service.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <span className="inline-flex items-center gap-1 text-sm text-primary-600 bg-primary-50 px-2.5 py-1 rounded-lg">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {service.duration_minutes} min
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 ml-4">
                    <button
                      onClick={() => openEdit(service)}
                      className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(service.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Service' : 'New Service'}
      >
        <form onSubmit={handleSave} className="space-y-5">
          {/* ── Service Photo ── */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-700">
              Service Photo <span className="text-neutral-400 font-normal">(optional)</span>
            </label>

            {/* Preview / placeholder */}
            <div
              onClick={() => !imgUploading && imgInputRef.current?.click()}
              className={`relative w-full h-40 rounded-xl overflow-hidden border-2 border-dashed
                transition-colors cursor-pointer group
                ${form.image_url
                  ? 'border-transparent'
                  : 'border-neutral-200 hover:border-primary-300 bg-neutral-50 hover:bg-primary-50/30'
                }`}
            >
              {form.image_url ? (
                <>
                  <img
                    src={form.image_url}
                    alt="Service preview"
                    className="w-full h-full object-cover"
                  />
                  {/* Overlay to indicate it's clickable */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100
                    transition-opacity flex flex-col items-center justify-center gap-1">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-white text-xs font-semibold">Change Photo</span>
                  </div>
                </>
              ) : imgUploading ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <svg className="w-6 h-6 text-primary-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm text-neutral-500">Uploading…</span>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-neutral-400 group-hover:text-primary-400 transition-colors">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-medium">Click to upload a photo</span>
                  <span className="text-xs">JPG, PNG or WebP · max 5 MB</span>
                </div>
              )}
            </div>

            {/* Remove photo link */}
            {form.image_url && !imgUploading && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, image_url: '' }))}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove photo
              </button>
            )}

            {/* Inline error */}
            {imgError && (
              <p className="text-xs text-red-500">{imgError}</p>
            )}

            {/* Hidden file input */}
            <input
              ref={imgInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

          {/* ── Service Name ── */}
          <Input
            id="service-name"
            label="Service Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Haircut, Consultation, Lesson"
            required
          />

          {/* ── Description ── */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-700">
              Description <span className="text-neutral-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of the service"
              rows={3}
              className="w-full px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-neutral-800 placeholder-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all resize-none"
            />
          </div>

          {/* ── Duration ── */}
          <Input
            id="service-duration"
            label="Duration (minutes)"
            type="number"
            min="5"
            max="480"
            value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) })}
            required
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)} className="w-full">
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="w-full" loading={saving} disabled={imgUploading}>
              {editing ? 'Save Changes' : 'Create Service'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  )
}
