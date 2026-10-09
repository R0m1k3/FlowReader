import { Suspense, useEffect } from 'react';
import { lazyNamed } from './lib/lazy';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, clearUserData } from './stores/authStore';
import { authApi } from './api/auth';
import { ApiError, setUnauthorizedHandler } from './api/client';
import { ProtectedRoute } from './components/ProtectedRoute';
import { UpdateToast } from './components/UpdateToast';

// Route-level code splitting: the reader app and the auth screens load separately.
const LoginPage = lazyNamed(() => import('./pages/LoginPage'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('./pages/RegisterPage'), 'RegisterPage');
const RootLayout = lazyNamed(() => import('./layouts/RootLayout'), 'RootLayout');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      staleTime: 60 * 1000,
      // Live updates arrive over the WebSocket; refocusing the tab must not
      // refetch every loaded page.
      refetchOnWindowFocus: false,
      // Let the service worker answer from cache when the network is down.
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

setUnauthorizedHandler(() => {
  if (!useAuthStore.getState().isAuthenticated) return;
  useAuthStore.getState().logout();
  queryClient.clear();
  void clearUserData();
});

function AuthChecker({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    authApi
      .getMe()
      .then((user) => setUser(user))
      .catch((err) => {
        // Only a real 401 means "logged out"; offline or 5xx keeps the session.
        if (err instanceof ApiError && err.status === 401) setUser(null);
        else setLoading(false);
      });
  }, [setUser, setLoading]);

  return <>{children}</>;
}

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-carbon" role="status" aria-label="Chargement">
      <div className="w-10 h-10 border-2 border-nature/20 border-t-nature rounded-full animate-spin" />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthChecker>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<RootLayout />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <UpdateToast />
        </AuthChecker>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
