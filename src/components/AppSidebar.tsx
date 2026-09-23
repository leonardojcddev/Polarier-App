import { MessageSquare, FolderOpen, Clock, Settings, LogOut, Sun, Moon, ClipboardCheck } from "lucide-react";
import polarierLogo from "@/assets/polarier-logo.png";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useRole } from "@/context/RoleContext";
import { useEffect, useState } from "react";
import { getChats, Chat } from "@/services/chat";

const navItems = [
  { label: "Chat", icon: MessageSquare, path: "/chat" },
  { label: "Mis Documentos", icon: FolderOpen, path: "/documents" },
  { label: "Historial", icon: Clock, path: "/history" },
  { label: "Configuración", icon: Settings, path: "/settings" },
];

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const AppSidebar = ({ isOpen, onClose }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { hasAuditAccess } = useRole();
  const [chats, setChats] = useState<Chat[]>([]);

  const refreshChats = () => getChats().then(setChats).catch(() => {});

  useEffect(() => {
    refreshChats();
  }, [location.pathname]);

  useEffect(() => {
    window.addEventListener('chat-title-updated', refreshChats);
    return () => window.removeEventListener('chat-title-updated', refreshChats);
  }, []);

  const handleNav = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const userEmail = user?.email ?? "";
  const userName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || userEmail.split("@")[0];
  const userInitial = userName?.charAt(0).toUpperCase() || "U";

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:static top-0 left-0 z-50 h-screen-dvh lg:h-full w-[260px] bg-sidebar-bg flex flex-col transition-transform duration-200 safe-top safe-bottom ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <button onClick={() => navigate("/lobby")} className="px-5 pt-5 pb-6 flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src={polarierLogo} alt="Polarier" className="h-10" />
        </button>

        <nav className="flex-1 flex flex-col gap-0.5 px-2 overflow-y-auto">
          {/* Auditoría: solo para quien tiene algún rol en el módulo. Un auditor
              puro nunca llega a este sidebar (vive en AuditLayout); esto es la
              puerta de entrada de administradores y supervisores, que además
              usan el chat y aterrizan en el lobby. */}
          {hasAuditAccess && (
            <button
              onClick={() => handleNav("/auditoria")}
              className="relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left text-sidebar-fg/80 hover:bg-sidebar-muted/50"
            >
              <ClipboardCheck size={18} />
              <span>Auditoría</span>
            </button>
          )}

          {navItems.map((item) => {
            const active = location.pathname === item.path || (item.path === "/chat" && location.pathname.startsWith("/chat"));
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left ${
                  active
                    ? "text-sidebar-fg bg-sidebar-muted"
                    : "text-sidebar-fg/80 hover:bg-sidebar-muted/50"
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

          {/* Chat list */}
          {chats.length > 0 && (
            <div className="mt-3 px-2">
              <p className="text-sidebar-fg/50 text-xs uppercase mb-1">Conversaciones</p>
              {chats.slice(0, 10).map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleNav(`/chat/${chat.id}`)}
                  className={`w-full text-left text-xs px-3 py-1.5 rounded-md truncate transition-colors ${
                    location.pathname === `/chat/${chat.id}`
                      ? "text-sidebar-fg bg-sidebar-muted"
                      : "text-sidebar-fg/70 hover:bg-sidebar-muted/50"
                  }`}
                >
                  {chat.title}
                </button>
              ))}
            </div>
          )}
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
    </>
  );
};

export default AppSidebar;
