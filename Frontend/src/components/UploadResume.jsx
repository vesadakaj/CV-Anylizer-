import { useRef, useState } from 'react'
import { UploadCloudIcon } from '../icons'

const ALLOWED_EXTENSIONS = ['.pdf', '.docx']
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

function getExtension(name) {
  return name.slice(name.lastIndexOf('.')).toLowerCase()
}

function UploadResume({ onUploaded }) {
  const [status, setStatus] = useState('idle') // idle | uploading | success | error
  const [message, setMessage] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)

  const uploadFile = async (file) => {
    if (!file) return

    const extension = getExtension(file.name)
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setStatus('error')
      setMessage('Only PDF and DOCX files are supported.')
      return
    }

    setStatus('uploading')
    setMessage('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${API_BASE}/api/cv/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Upload failed.')
      }

      setStatus('success')
      setMessage(`Uploaded "${data.filename}" — analysis complete.`)
      onUploaded?.(data)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  const handleInputChange = (e) => {
    const selected = e.target.files[0]
    uploadFile(selected)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    uploadFile(e.dataTransfer.files[0])
  }

  return (
    <section className="card upload-card">
      <h2 className="card-title">Upload Resume</h2>
      <p className="card-subtitle">Upload a PDF or DOCX file to analyze</p>

      <div
        className={`dropzone${isDragging ? ' dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
      >
        <UploadCloudIcon className="dropzone-icon" />
        <p className="dropzone-text">
          {status === 'uploading' ? (
            'Uploading…'
          ) : (
            <>
              Drag and drop your file here,
              <br />
              or click to browse
            </>
          )}
        </p>
        <p className="dropzone-hint">PDF, DOCX up to 5MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleInputChange}
          hidden
        />
      </div>

      {message && <p className={`upload-message ${status}`}>{message}</p>}
    </section>
  )
}

export default UploadResume
