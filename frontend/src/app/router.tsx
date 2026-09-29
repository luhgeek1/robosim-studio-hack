import type { ComponentType } from 'react'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router'
import { AppShell } from '@/widgets/app-shell'
import { NotFoundPage, RequireAdmin, RequireAuth, RootRedirect } from './guards'
import { RouteError } from './RouteError'

const page = (loader: () => Promise<{ Component: ComponentType }>) => ({ lazy: loader })

const router = createBrowserRouter([
  {
    Component: AppShell,
    HydrateFallback: () => null,
    children: [
      {
        // Pathless layout: a crash in any screen renders RouteError inside the shell, the header stays.
        errorElement: <RouteError />,
        children: [
          { index: true, Component: RootRedirect },
          {
            Component: RequireAdmin,
            children: [
              { path: 'robots-3d', ...page(() => import('@/pages/robots').then((m) => ({ Component: m.RobotsPage }))) },
              {
                path: 'admin',
                ...page(() => import('@/pages/admin').then((m) => ({ Component: m.AdminLayout }))),
                children: [
                  { index: true, ...page(() => import('@/pages/admin').then((m) => ({ Component: m.OverviewTab }))) },
                  {
                    path: 'catalog',
                    ...page(() => import('@/pages/admin').then((m) => ({ Component: m.CatalogTab }))),
                  },
                  { path: 'norms', ...page(() => import('@/pages/admin').then((m) => ({ Component: m.NormsTab }))) },
                  { path: 'users', ...page(() => import('@/pages/admin').then((m) => ({ Component: m.UsersTab }))) },
                ],
              },
            ],
          },
          { path: 'login', ...page(() => import('@/pages/login').then((m) => ({ Component: m.LoginPage }))) },
          { path: 'catalog', ...page(() => import('@/pages/catalog').then((m) => ({ Component: m.CatalogPage }))) },
          {
            path: 'catalog/compare',
            ...page(() => import('@/pages/catalog-compare').then((m) => ({ Component: m.ComparePage }))),
          },
          {
            path: 'catalog/:productId',
            ...page(() => import('@/pages/product').then((m) => ({ Component: m.ProductPage }))),
          },
          {
            Component: RequireAuth,
            children: [
              {
                path: 'projects',
                ...page(() => import('@/pages/projects').then((m) => ({ Component: m.ProjectsPage }))),
              },
              {
                path: 'projects/:projectId',
                ...page(() => import('@/pages/project').then((m) => ({ Component: m.ProjectLayout }))),
                children: [
                  {
                    index: true,
                    ...page(() => import('@/pages/project').then((m) => ({ Component: m.OverviewPage }))),
                  },
                  {
                    path: 'object',
                    ...page(() => import('@/pages/project-object').then((m) => ({ Component: m.ObjectPage }))),
                  },
                  {
                    path: 'processes',
                    ...page(() => import('@/pages/project-processes').then((m) => ({ Component: m.ProcessesPage }))),
                  },
                  {
                    path: 'matching',
                    ...page(() => import('@/pages/project-matching').then((m) => ({ Component: m.MatchingPage }))),
                  },
                  {
                    path: 'layout',
                    ...page(() => import('@/pages/project-layout').then((m) => ({ Component: m.LayoutPage }))),
                  },
                  {
                    path: 'scenarios',
                    ...page(() => import('@/pages/project-scenarios').then((m) => ({ Component: m.ScenariosPage }))),
                  },
                  {
                    path: 'scenarios/:scenarioId',
                    ...page(() => import('@/pages/project-scenario').then((m) => ({ Component: m.ScenarioPage }))),
                  },
                  {
                    path: 'comparison',
                    ...page(() => import('@/pages/project-comparison').then((m) => ({ Component: m.ComparisonPage }))),
                  },
                  {
                    path: 'risks',
                    ...page(() => import('@/pages/project-risks').then((m) => ({ Component: m.RisksPage }))),
                  },
                  {
                    path: 'simulation',
                    ...page(() => import('@/pages/project-simulation').then((m) => ({ Component: m.SimulationPage }))),
                  },
                  {
                    path: 'report',
                    ...page(() => import('@/pages/project-report').then((m) => ({ Component: m.ReportPage }))),
                  },
                ],
              },
            ],
          },
          { path: 'home', element: <Navigate to="/" replace /> },
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
