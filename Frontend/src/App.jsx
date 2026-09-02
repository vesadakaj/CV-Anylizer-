import CvUpload from './components/CvUpload'
import CandidateRanking from './components/CandidateRanking'
import './App.css'

function App() {
  return (
    <main id="center">
      <h1>CV Analyzer</h1>
      <p>Upload a CV and match it against a job description.</p>
      <CvUpload />
      <CandidateRanking />
    </main>
  )
}

export default App
