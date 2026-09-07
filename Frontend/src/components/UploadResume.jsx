import { useRef, useState } from 'react'
import { UploadCloudIcon } from '../icons'

function UploadResume({ isProcessing, onFilesSelected }) {
  const [rejectedMessage, setRejectedMessage] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)

  const handleFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return
    const { rejectedNames } = onFilesSelected(fileList)
    setRejectedMessage(
      rejectedNames.length > 0
        ? `${rejectedNames.length === 1 ? 'File' : 'Files'} skipped (only PDF and DOCX are supported): ${rejectedNames.join(', ')}`
        : '',
    )
  }

  const handleInputChange = (e) => {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    if (isProcessing) return
    handleFiles(e.dataTransfer.files)
  }

  const handleClick = () => {
    if (isProcessing) return
    inputRef.current?.click()
  }

  const handleKeyDown = (e) => {
    if (isProcessing) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  return (
    <section className="card upload-card">
      <h2 className="card-title">Upload Resume</h2>
      <p className="card-subtitle">Upload a PDF or DOCX file to analyze</p>

      <div
        className={`dropzone${isDragging ? ' dragging' : ''}${isProcessing ? ' disabled' : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragOver={(e) => {
          e.preventDefault()
          if (!isProcessing) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={isProcessing ? -1 : 0}
        aria-disabled={isProcessing}
      >
        <UploadCloudIcon className="dropzone-icon" />
        <p className="dropzone-text">
          {isProcessing ? (
            'Please wait until the current CV finishes processing.'
          ) : (
            <>
              Drag and drop your files here,
              <br />
              or click to browse
            </>
          )}
        </p>
        <p className="dropzone-hint">PDF, DOCX up to 5MB — you can select multiple files</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          multiple
          disabled={isProcessing}
          onChange={handleInputChange}
          hidden
        />
      </div>

      {rejectedMessage && (
        <p className="upload-message error" role="alert">
          {rejectedMessage}
        </p>
      )}
    </section>
  )
}

export default UploadResume
