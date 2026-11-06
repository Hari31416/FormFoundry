import React from 'react'
import { AuthProvider, ProtectedRoute } from '@/lib/auth'
import Login from '@/pages/Login'
import AccessManagement from '@/pages/AccessManagement'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TooltipProvider } from '@/components/ui/tooltip'
import TemplateSelection from '@/pages/TemplateSelection'
import CaseWorkspace from '@/pages/CaseWorkspace'
import { useParams } from 'react-router-dom'

function LegacyProjectRedirect() {
  const { templateId } = useParams<{ templateId: string }>()
  return <Navigate to={`/schemas/${templateId}`} replace />
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <div className="min-h-screen">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute admin />}>
                  <Route path="/admin/users" element={<AccessManagement />} />
                </Route>
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<TemplateSelection />} />
                  <Route
                    path="/schemas/:templateId"
                    element={<TemplateSelection />}
                  />
                  <Route
                    path="/projects/:templateId"
                    element={<LegacyProjectRedirect />}
                  />
                  <Route path="/cases/:caseId" element={<CaseWorkspace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </div>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}

export default App
