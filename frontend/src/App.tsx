import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MainLayout } from '@/components/layout';
import { AuthGuard } from '@/components/features';
import {
  LoginPage,
  DashboardPage,
  ProjectListPage,
  ProjectFormPage,
  ProjectDetailPage,
  RunListPage,
  RunWizardPage,
  RunDetailPage,
  IntentFormPage,
  IntentDetailPage,
  ReportsPage,
  SettingsPage,
} from '@/pages';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route
            element={
              <AuthGuard>
                <MainLayout />
              </AuthGuard>
            }
          >
            <Route path="/" element={<DashboardPage />} />

            {/* Projects */}
            <Route path="/projects" element={<ProjectListPage />} />
            <Route path="/projects/new" element={<ProjectFormPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />

            {/* Runs */}
            <Route path="/runs" element={<RunListPage />} />
            <Route path="/runs/new" element={<RunWizardPage />} />
            <Route path="/runs/:id" element={<RunDetailPage />} />

            {/* Intents */}
            <Route path="/runs/:runId/intents/new" element={<IntentFormPage />} />
            <Route path="/runs/:runId/intents/:intentId" element={<IntentDetailPage />} />

            {/* Reports */}
            <Route path="/reports" element={<ReportsPage />} />

            {/* Settings */}
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Catch all - redirect to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
