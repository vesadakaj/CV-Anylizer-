# CV Analyzer and Job Matching - Diploma Project

## Project Overview

This is a diploma project for analyzing CVs and matching candidates
with job positions.

The application allows users to upload CVs in PDF or DOCX format.
The system extracts candidate information automatically and compares
the candidate profile with the requirements of a job position.

The final result should include a match percentage for each candidate.

Example:
- Candidate 1: 90% Match
- Candidate 2: 60% Match

## Technologies

### Frontend
- React
- JavaScript
- HTML
- CSS

### Backend
- Python
- FastAPI

### AI / NLP
- Natural Language Processing (NLP)
- Large Language Models (LLM)

## Project Structure

Frontend code must be inside:
`/Frontend`

Backend and AI processing must be inside:
`/Backend`

Do not mix frontend and backend code.

## Main Features

1. Upload CV in PDF or DOCX format.
2. Extract text from the CV.
3. Identify candidate information:
   - Name
   - Education
   - Work experience
   - Skills
   - Languages
   - Projects
4. Accept a job description.
5. Analyze the job requirements.
6. Compare candidate information with job requirements.
7. Calculate a candidate-job matching score.
8. Display the match as a percentage.

## Development Rules

- Keep the project simple and suitable for a bachelor's diploma project.
- Use React for the frontend.
- Use Python and FastAPI for the backend.
- Keep AI/NLP processing in the backend.
- Write clean and understandable code.
- Use meaningful variable, function, and file names.
- Explain major changes before implementing them.
- Do not delete existing functionality unless requested.
- Do not make unnecessary architectural changes.
- Keep frontend and backend separated.
- Never hardcode API keys or passwords.
- Store secrets in `.env`.
- Never commit `.env` files to Git.

## Development Approach

Build the application incrementally.

Start with the basic application and then add AI/NLP functionality.

Preferred order:

1. Project setup
2. React interface
3. Python/FastAPI backend
4. CV upload
5. PDF/DOCX text extraction
6. Candidate information extraction
7. Job description analysis
8. CV-job matching
9. Match percentage
10. Testing and evaluation