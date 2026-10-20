import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Providers } from './providers'
import { AppRouter } from './router'
import { installDeploymentRecovery } from './deployment-recovery'
import './index.css'
import './workspace.css'

installDeploymentRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </StrictMode>,
)
