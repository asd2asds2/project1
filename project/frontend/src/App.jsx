import { useEffect, useState } from 'react'

function App() {
  const [health, setHealth] = useState(null)
  const [dbStatus, setDbStatus] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(() => setHealth({ status: 'error' }))

    fetch('/api/db-check')
      .then(res => res.json())
      .then(data => setDbStatus(data))
      .catch(() => setDbStatus({ status: 'error' }))
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Проект развёрнут</h1>
      <p>Backend: {health ? JSON.stringify(health) : 'загрузка...'}</p>
      <p>БД: {dbStatus ? JSON.stringify(dbStatus) : 'загрузка...'}</p>
    </div>
  )
}

export default App
