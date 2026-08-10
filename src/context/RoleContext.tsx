import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getMyRoles, HotelRole, Hotel, RolHotel } from '@/services/hotels';

interface RoleContextType {
  roles: HotelRole[];
  hotels: Hotel[];
  activeHotel: Hotel | null;
  loading: boolean;
  hasRole: (rol: RolHotel) => boolean;
  isAuditorOnly: boolean; // solo tiene rol de auditor → experiencia de auditoría, sin chat
  refresh: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<HotelRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await getMyRoles();
      setRoles(r);
    } catch {
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const hotelsMap = new Map<string, Hotel>();
  for (const r of roles) if (r.hotel) hotelsMap.set(r.hotel.id, r.hotel);
  const hotels = Array.from(hotelsMap.values());

  const hasRole = (rol: RolHotel) => roles.some((r) => r.rol === rol);

  // Auditor "puro": tiene al menos un rol auditor y ningún rol de mayor alcance.
  const isAuditorOnly =
    roles.length > 0 && roles.every((r) => r.rol === 'auditor');

  return (
    <RoleContext.Provider
      value={{
        roles,
        hotels,
        activeHotel: hotels[0] ?? null,
        loading,
        hasRole,
        isAuditorOnly,
        refresh: load,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
};
