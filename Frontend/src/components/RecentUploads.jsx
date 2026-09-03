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

function RecentUploads({ uploads }) {
  return (
    <section className="card recent-uploads-card">
      <div className="card-header-row">
        <h2 className="card-title">Recent Uploads</h2>
      </div>

      {uploads.length === 0 ? (
        <p className="empty-hint">Uploaded resumes from this session will show up here.</p>
      ) : (
        <ul className="recent-uploads-list">
          {uploads.map((upload) => (
            <li key={upload.id} className="recent-upload-item">
              <span className="recent-upload-icon" aria-hidden="true">
                <ResumesIcon />
              </span>
              <span className="recent-upload-name">{upload.filename}</span>
              <span className="recent-upload-time">{timeAgo(upload.uploadedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default RecentUploads
