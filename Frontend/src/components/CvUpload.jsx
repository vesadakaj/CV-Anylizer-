import { useState } from 'react'

const ALLOWED_EXTENSIONS = ['.pdf', '.docx']
const API_URL = import.meta.env.VITE_API_URL

function CvUpload() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | success | error
  const [message, setMessage] = useState('')

  const handleFileChange = (e) => {
    const selected = e.target.files[0]
    if (!selected) return

    const extension = selected.name.slice(selected.name.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setFile(null)
      setStatus('error')
      setMessage('Only PDF and DOCX files are supported.')
      return
    }

    setFile(selected)
    setStatus('idle')
    setMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return

    setStatus('uploading')
    setMessage('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${API_URL}/api/cv/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Upload failed.')
      }

      setStatus('success')
      setMessage(`Uploaded "${data.filename}" (${(data.size_bytes / 1024).toFixed(1)} KB)`)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  return (
    <section className="cv-upload">
      <h2>Upload your CV</h2>
      <p>Accepted formats: PDF, DOCX</p>
      <form onSubmit={handleSubmit}>
        <input type="file" accept=".pdf,.docx" onChange={handleFileChange} />
        <button type="submit" disabled={!file || status === 'uploading'}>
          {status === 'uploading' ? 'Uploading…' : 'Upload CV'}
        </button>
      </form>
      {message && <p className={`upload-message ${status}`}>{message}</p>}
    </section>
  )
}

export default CvUpload
