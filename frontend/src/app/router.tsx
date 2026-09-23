import type { ComponentType } from 'react'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router'
import { AppLayout, ProjectGate, RequireAuth, RootRedirect } from './layout'

type Lazy = () => Promise<{ Component: ComponentType }>
const screen = (load: Lazy) => ({ lazy: load })

const router = createBrowserRouter([
  {
    Component: AppLayout,
    HydrateFallback: () => null,
    children: [
      { index: true, Component: RootRedirect },
      { path: 'login', ...screen(() => import('@/screens/LoginScreen').then((m) => ({ Component: m.LoginScreen }))) },
      {
        path: 'catalog',
        ...screen(() => import('@/screens/CatalogScreen').then((m) => ({ Component: m.CatalogScreen }))),
      },
      {
        path: 'catalog/compare',
        ...screen(() => import('@/screens/CompareScreen').then((m) => ({ Component: m.CompareScreen }))),
      },
      {
        path: 'catalog/:productId',
        ...screen(() => import('@/screens/ProductScreen').then((m) => ({ Component: m.ProductScreen }))),
      },
      {
        Component: RequireAuth,
        children: [
          {
            path: 'projects',
            ...screen(() => import('@/screens/ProjectsScreen').then((m) => ({ Component: m.ProjectsScreen }))),
          },
          {
            path: 'projects/:projectId',
            Component: ProjectGate,
            children: [
              { index: true, element: <Navigate to="object" replace /> },
              {
                path: 'object',
                ...screen(() => import('@/screens/ObjectScreen').then((m) => ({ Component: m.ObjectScreen }))),
              },
              {
                path: 'analysis',
                ...screen(() => import('@/screens/AnalysisScreen').then((m) => ({ Component: m.AnalysisScreen }))),
              },
              {
                path: 'robots',
                ...screen(() => import('@/screens/RobotsScreen').then((m) => ({ Component: m.RobotsScreen }))),
              },
              {
                path: 'simulation',
                ...screen(() => import('@/screens/SimulationScreen').then((m) => ({ Component: m.SimulationScreen }))),
              },
              {
                path: 'economics',
                ...screen(() => import('@/screens/EconomicsScreen').then((m) => ({ Component: m.EconomicsScreen }))),
              },
              {
                path: 'verdict',
                ...screen(() => import('@/screens/VerdictScreen').then((m) => ({ Component: m.VerdictScreen }))),
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
