import { ResumesIcon } from '../icons'
import { scoreTierClass } from '../lib/scoreTier'

function timeAgo(timestamp) {
  if (timestamp == null) return ''
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

// Row states: queued, processing, ready, updated existing, failed. "Updated
// existing" is a ready row whose upload replaced the CV of an Application
// that already existed for that Job (Q14).
function statusLabel(row) {
  switch (row.status) {
    case 'queued':
      return 'Queued'
    case 'processing':
      return 'Processing…'
    case 'ready':
      return row.application?.status === 'updated' ? 'Updated existing' : 'Ready'
    case 'failed':
      return 'Failed'
    default:
      return row.status
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

/**
 * The list of CVs in play. On the dashboard it is the batch: server-side
 * Unattached CVs merged with this session's queue, each ready row with a
 * checkbox (`selection` given). On the Job page it is the uploads for that
 * Job with their score inline (`selection` omitted).
 *
 * `rows` carry the queue item shape (see useCvUploadQueue) plus, for rows
 * that came from the server, `source: 'server'` and no `candidateInfo`.
 */
function RecentUploads({
  title = 'Recent Uploads',
  rows,
  viewedCvId = null,
  isProcessing,
  onView,
  onRetry,
  selection = null,
  attachedByCvId = {},
  loadStatus = 'ready', // idle | loading | ready | error
  loadError = '',
  onReload,
  emptyHint = 'Uploaded resumes from this session will show up here.',
}) {
  const showSelection = selection != null

  return (
    <section className="card recent-uploads-card">
      <div className="card-header-row">
        <h2 className="card-title">{title}</h2>
        {showSelection && selection.selectableCount > 0 && (
          <span className="recent-uploads-count" aria-live="polite">
            {selection.selectedCount} of {selection.selectableCount} selected
          </span>
        )}
      </div>

      {showSelection && selection.selectableCount > 0 && (
        <div className="recent-uploads-toolbar">
          <button type="button" className="link-button" onClick={selection.onSelectAll}>
            Select all
          </button>
          <button type="button" className="link-button" onClick={selection.onSelectNone}>
            Select none
          </button>
        </div>
      )}

      {loadStatus === 'loading' && rows.length === 0 && (
        <p className="empty-hint" aria-live="polite">
          Loading your unattached CVs…
        </p>
      )}

      {loadStatus === 'error' && (
        <div className="recent-uploads-load-error">
          <p className="upload-message error" role="alert">
            {loadError}
          </p>
          {onReload && (
            <button type="button" className="link-button" onClick={onReload}>
              Retry
            </button>
          )}
        </div>
      )}

      {rows.length === 0 && loadStatus !== 'loading' ? (
        <p className="empty-hint">{emptyHint}</p>
      ) : (
        <ul className="recent-uploads-list">
          {rows.map((row) => {
            const isReady = row.status === 'ready'
            const attachedTo = row.cvId != null ? attachedByCvId[row.cvId] : null
            const isViewable = isReady && onView != null
            const isViewed = isReady && row.cvId != null && row.cvId === viewedCvId
            const isSelectable = showSelection && isReady && row.cvId != null && !attachedTo
            const isSelected = isSelectable && selection.isSelected(row.cvId)
            const score = row.match?.overall_score
            const scored = row.match?.status === 'scored' && score != null

            return (
              <li
                key={row.id}
                className={`recent-upload-item status-${row.status}${isViewed ? ' selected' : ''}${
                  attachedTo ? ' attached' : ''
                }`}
              >
                <div className="recent-upload-row">
                  {showSelection && (
                    <span className="recent-upload-check">
                      {isSelectable ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => selection.onToggle(row.cvId)}
                          aria-label={`Include ${row.filename} in the batch`}
                        />
                      ) : (
                        <span className="recent-upload-check-placeholder" aria-hidden="true" />
                      )}
                    </span>
                  )}

                  <button
                    type="button"
                    className="recent-upload-main"
                    onClick={() => isViewable && onView(row)}
                    disabled={!isViewable}
                    aria-pressed={isViewed}
                    aria-label={
                      isViewable
                        ? `View extracted information for ${row.filename}`
                        : `${row.filename}, ${statusLabel(row).toLowerCase()}`
                    }
                  >
                    <span className="recent-upload-icon" aria-hidden="true">
                      <ResumesIcon />
                    </span>
                    <span className="recent-upload-name">
                      {row.filename}
                      {row.candidateName && (
                        <span className="recent-upload-candidate"> · {row.candidateName}</span>
                      )}
                    </span>
                    {row.sizeBytes != null && (
                      <span className="recent-upload-size">{formatFileSize(row.sizeBytes)}</span>
                    )}
                    <span className="recent-upload-time">{timeAgo(row.addedAt)}</span>
                  </button>

                  {scored && (
                    <span className={`recent-upload-score ${scoreTierClass(score)}`}>
                      {Math.round(score)}%
                    </span>
                  )}
                  {isReady && row.match && row.match.status !== 'scored' && (
                    <span className="recent-upload-score tier-unknown">Unscorable</span>
                  )}

                  {attachedTo ? (
                    <span className="pill pill-neutral" title={`Scored against ${attachedTo.jobTitle}`}>
                      Attached to {attachedTo.jobTitle}
                    </span>
                  ) : (
                    <span className={`pill ${statusPillClass(row.status)}`}>{statusLabel(row)}</span>
                  )}

                  {row.status === 'failed' && (
                    <button
                      type="button"
                      className="table-action-button"
                      onClick={() => onRetry(row.id)}
                      disabled={isProcessing}
                    >
                      Retry
                    </button>
                  )}
                </div>

                {isReady && (row.linkable === false || row.matchedExisting) && (
                  <div className="recent-upload-flags">
                    {row.linkable === false && (
                      <span
                        className="upload-flag"
                        title="No email address was found in this CV, so it can never be merged with another CV of the same person."
                      >
                        No email, will not merge
                      </span>
                    )}
                    {row.matchedExisting && (
                      <span className="upload-flag" title="Matched an existing candidate by email.">
                        Existing candidate
                      </span>
                    )}
                  </div>
                )}

                {row.status === 'failed' && row.error && (
                  <p className="recent-upload-error" role="alert">
                    {row.error}
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
