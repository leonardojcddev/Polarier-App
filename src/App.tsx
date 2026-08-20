import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { RoleProvider, useRole } from "@/context/RoleContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Index from "./pages/Index";
import AuditLayout from "./components/audit/AuditLayout";
import AuditHome from "./pages/audit/AuditHome";
import AuditForm from "./pages/audit/AuditForm";
import AuditHistory from "./pages/audit/AuditHistory";
import AuditMonth from "./pages/audit/AuditMonth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import Lobby from "./pages/Lobby";
import Chat from "./pages/Chat";
import Documents from "./pages/Documents";
import History from "./pages/History";
import SettingsPage from "./pages/SettingsPage";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen bg-background">
    <span className="text-muted-foreground">Cargando...</span>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, authProcessing, isRecovery } = useAuth();
  const location = useLocation();
  if (loading || authProcessing) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (isRecovery && location.pathname !== "/reset-password")
    return <Navigate to="/reset-password" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, authProcessing, isRecovery } = useAuth();
  if (loading || authProcessing) return <LoadingScreen />;
  if (isRecovery) return <Navigate to="/reset-password" replace />;
  if (user) return <Navigate to="/lobby" replace />;
  return <>{children}</>;
};

// Solo para auditores. Si no tiene ese rol, fuera.
const AuditorRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { hasRole, loading: roleLoading } = useRole();
  if (authLoading || roleLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole("auditor")) return <Navigate to="/lobby" replace />;
  return <>{children}</>;
};

// Envuelve las rutas "normales": un auditor puro es redirigido a su módulo.
const NonAuditorGate = ({ children }: { children: React.ReactNode }) => {
  const { isAuditorOnly, loading } = useRole();
  if (loading) return <LoadingScreen />;
  if (isAuditorOnly) return <Navigate to="/auditoria" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RoleProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Módulo de auditoría (solo auditores) */}
                <Route element={<AuditorRoute><AuditLayout /></AuditorRoute>}>
                  <Route path="/auditoria" element={<AuditHome />} />
                  <Route path="/auditoria/formulario/:defId" element={<AuditForm />} />
                  <Route path="/auditoria/historico" element={<AuditHistory />} />
                  <Route path="/auditoria/historico/:anioMes" element={<AuditMonth />} />
                </Route>

                {/* App estándar (los auditores puros se redirigen a /auditoria) */}
                <Route path="/lobby" element={<ProtectedRoute><NonAuditorGate><Lobby /></NonAuditorGate></ProtectedRoute>} />
                <Route element={<ProtectedRoute><NonAuditorGate><AppLayout /></NonAuditorGate></ProtectedRoute>}>
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/chat/:chatId" element={<Chat />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
                <Route path="/verify-email" element={<Navigate to="/login" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </RoleProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
