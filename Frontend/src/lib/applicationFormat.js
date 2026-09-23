// Wording for the toast after "Add to job" posts an Application.
export function addToJobMessage(result, job) {
  const title = job?.title || 'the job'
  const score =
    result.match?.status === 'scored' && result.match.overall_score != null
      ? ` Score: ${Math.round(result.match.overall_score)}%.`
      : ''
  if (result.status === 'updated') {
    return `${result.candidate_name} was already in ${title}; the application now uses the chosen CV and was rescored.${score}`
  }
  return `${result.candidate_name} was added to ${title}.${score}`
}
