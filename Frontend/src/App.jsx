import CvUpload from './components/CvUpload'
import './App.css'

function App() {
  return (
    <main id="center">
      <h1>CV Analyzer</h1>
      <p>Upload a CV and match it against a job description.</p>
      <CvUpload />
    </main>
  )
}

export default App
