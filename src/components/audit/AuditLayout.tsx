import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, ClipboardList, Clock, LayoutDashboard, LogOut, Sun, Moon } from "lucide-react";
import polarierLogo from "@/assets/polarier-logo.png";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useRole } from "@/context/RoleContext";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/auditoria" },
  { label: "Formularios de Control", icon: ClipboardList, path: "/auditoria/formularios" },
  { label: "Histórico", icon: Clock, path: "/auditoria/historico" },
];

/**
 * Layout dedicado al auditor: navegación reducida (formularios + histórico),
 * sin chat ni documentos. Reutiliza el sistema visual del sidebar principal.
 */
const AuditLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeHotel } = useRole();

  const handleNav = (path: string) => {
    navigate(path);
    setSidebarOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const userEmail = user?.email ?? "";
  const userName = profile?.full_name || userEmail.split("@")[0];
  const userInitial = userName?.charAt(0).toUpperCase() || "U";

  return (
    <div className="flex h-screen-dvh w-full bg-background overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:static top-0 left-0 z-50 h-screen-dvh lg:h-full w-[260px] bg-sidebar-bg flex flex-col transition-transform duration-200 safe-top safe-bottom ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-5 pt-5 pb-6 flex items-center gap-2">
          <img src={polarierLogo} alt="Polarier" className="h-10" />
        </div>

        {activeHotel && (
          <div className="px-4 pb-3">
            {activeHotel.polo?.nombre && (
              <>
                <p className="text-sidebar-fg/50 text-xs uppercase">Polo turístico</p>
                <p className="text-sidebar-fg/90 text-sm font-medium truncate mb-2">
                  {activeHotel.polo.nombre}
                </p>
              </>
            )}
            <p className="text-sidebar-fg/50 text-xs uppercase">Hotel</p>
            <p className="text-sidebar-fg text-sm font-medium truncate">{activeHotel.nombre}</p>
          </div>
        )}

        <nav className="flex-1 flex flex-col gap-0.5 px-2 overflow-y-auto">
          {navItems.map((item) => {
            // "Formularios de Control" queda marcado también al rellenar un parte
            // (`/auditoria/formulario/:defId`, en singular).
            const active =
              item.path === "/auditoria"
                ? location.pathname === "/auditoria"
                : item.path === "/auditoria/formularios"
                  ? location.pathname.startsWith("/auditoria/formulario")
                  : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left ${
                  active ? "text-sidebar-fg bg-sidebar-muted" : "text-sidebar-fg/80 hover:bg-sidebar-muted/50"
                }`}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-sidebar-active rounded-r-full" />
                )}
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-sidebar-muted">
          <div className="flex items-center gap-3 mb-3">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-sidebar-active flex items-center justify-center text-sm font-semibold text-sidebar-bg">
                {userInitial}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-sidebar-fg text-sm font-medium truncate">{userName}</span>
              <span className="text-sidebar-fg/60 text-xs truncate">{userEmail}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sidebar-fg/70 text-sm hover:text-sidebar-fg transition-colors"
            >
              <LogOut size={16} />
              <span>Cerrar sesión</span>
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-sidebar-fg/70 hover:text-sidebar-fg hover:bg-sidebar-muted/50 transition-colors"
              title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
              aria-label="Cambiar tema"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-screen-dvh overflow-hidden">
        <div className="lg:hidden flex items-center px-4 py-3 border-b border-border bg-card safe-top">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <Menu size={22} />
          </button>
        </div>
        <main className="flex-1 flex flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AuditLayout;
