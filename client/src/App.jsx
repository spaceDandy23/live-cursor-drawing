import { useState } from 'react'
import { Login } from './components/Login'
import { Home } from './Home'
import './index.css' 
function App() {
  const [username, setUsername] = useState()

  return username ? <Home username={username}/> : <Login onSubmit={setUsername}/>
}

export default App
