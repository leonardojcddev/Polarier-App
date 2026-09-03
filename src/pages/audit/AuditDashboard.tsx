import DashboardControl from "@/components/audit/DashboardControl";

/**
 * Pantalla de inicio del módulo de auditoría (`/auditoria`): el dashboard de
 * control del hotel activo. Es lo primero que ve un auditor al entrar.
 * Toda la cabecera (logo, hotel, mes) la pinta `DashboardControl`.
 */
const AuditDashboard = () => (
  <div className="flex-1 overflow-y-auto p-6">
    <div className="max-w-6xl mx-auto">
      <DashboardControl />
    </div>
  </div>
);

export default AuditDashboard;
