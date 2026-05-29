import { useEffect, useState } from 'react'
import { ProjectList } from './components/ProjectList'
import { EditorView } from './components/EditorView'
import './App.css'

function projectFromUrl(): string {
  return new URLSearchParams(window.location.search).get('p') ?? ''
}

export default function App() {
  const [project, setProject] = useState(projectFromUrl)

  // Sincroniza con el botón atrás/adelante del navegador.
  useEffect(() => {
    const onPop = () => setProject(projectFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (slug: string) => {
    const url = slug ? `?p=${encodeURIComponent(slug)}` : window.location.pathname
    window.history.pushState({}, '', url)
    setProject(slug)
  }

  return project ? (
    <EditorView project={project} onBack={() => navigate('')} />
  ) : (
    <ProjectList onOpen={navigate} />
  )
}
