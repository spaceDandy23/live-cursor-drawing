import { useState } from 'react'
import { Login } from './components/Login'
import { Home } from './Home'

function App() {
  const [username, setUsername] = useState("Default")

  return username ? <Home username={username}/> : <Login onSubmit={setUsername}/>
}

export default App
