import { createContext, useContext, useState } from 'react'

const EnvContext = createContext()

export function EnvProvider({ children }) {
  const [env, setEnv] = useState('demo')
  return (
    <EnvContext.Provider value={{ env, setEnv }}>
      {children}
    </EnvContext.Provider>
  )
}

export function useEnv() {
  return useContext(EnvContext)
}
