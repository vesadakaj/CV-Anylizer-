import { ResumesIcon } from '../icons'

function timeAgo(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(status) {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'processing':
      return 'Processing…'
    case 'ready':
      return 'Ready'
    case 'failed':
      return 'Failed'
    default:
      return status
  }
}

function statusPillClass(status) {
  switch (status) {
    case 'ready':
      return 'pill-success'
    case 'failed':
      return 'pill-warning'
    default:
      return 'pill-neutral'
  }
}

function RecentUploads({ items, selectedCandidateId, isProcessing, onSelect, onRetry }) {
  return (
    <section className="card recent-uploads-card">
      <div className="card-header-row">
        <h2 className="card-title">Recent Uploads</h2>
      </div>

      {items.length === 0 ? (
        <p className="empty-hint">Uploaded resumes from this session will show up here.</p>
      ) : (
        <ul className="recent-uploads-list">
          {items.map((item) => {
            const isSelectable = item.status === 'ready'
            const isSelected = isSelectable && item.candidateId === selectedCandidateId

            return (
              <li
                key={item.id}
                className={`recent-upload-item status-${item.status}${isSelected ? ' selected' : ''}`}
              >
                <div className="recent-upload-row">
                  <button
                    type="button"
                    className="recent-upload-main"
                    onClick={() => isSelectable && onSelect(item)}
                    disabled={!isSelectable}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelectable
                        ? `View extracted information for ${item.filename}`
                        : `${item.filename}, ${statusLabel(item.status).toLowerCase()}`
                    }
                  >
                    <span className="recent-upload-icon" aria-hidden="true">
                      <ResumesIcon />
                    </span>
                    <span className="recent-upload-name">{item.filename}</span>
                    {item.sizeBytes != null && (
                      <span className="recent-upload-size">{formatFileSize(item.sizeBytes)}</span>
                    )}
                    <span className="recent-upload-time">{timeAgo(item.addedAt)}</span>
                  </button>

                  <span className={`pill ${statusPillClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>

                  {item.status === 'failed' && (
                    <button
                      type="button"
                      className="table-action-button"
                      onClick={() => onRetry(item.id)}
                      disabled={isProcessing}
                    >
                      Retry
                    </button>
                  )}
                </div>

                {item.status === 'failed' && item.error && (
                  <p className="recent-upload-error" role="alert">
                    {item.error}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default RecentUploads
