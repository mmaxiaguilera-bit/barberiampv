import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "barber" | null;

interface AuthCtx {
  session: Session | null;
  user: User | null;
  role: Role;
  // id en public.clients si el usuario tiene tarjeta de fidelidad
  customerId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  session: null, user: null, role: null, customerId: null, loading: true,
  signOut: async () => {}, refreshRole: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Usuario para el que ya se sabe el rol y si tiene tarjeta. Hasta entonces no se redirige a ningún lado
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);

  const fetchRole = async (uid: string | undefined) => {
    if (!uid) { setRole(null); setCustomerId(null); return; }
    const [{ data }, { data: customer }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid).order("role", { ascending: true }),
      supabase.from("clients").select("id").eq("user_id", uid).maybeSingle(),
    ]);
    setCustomerId(customer?.id ?? null);
    // admin wins
    const roles = (data ?? []).map(r => r.role);
    setRole(roles.includes("admin") ? "admin" : roles.length ? "barber" : null);
    setResolvedFor(uid);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      // defer role fetch
      if (sess?.user) {
        setTimeout(() => fetchRole(sess.user.id), 0);
      } else {
        setRole(null);
        setCustomerId(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) fetchRole(sess.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };
  const refreshRole = async () => { await fetchRole(user?.id); };

  return (
    <AuthContext.Provider value={{
      session, user, role, customerId, signOut, refreshRole,
      loading: loading || (!!user && resolvedFor !== user.id),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
