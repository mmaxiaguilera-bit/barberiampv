import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, Scissors, UserCog, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";

type Profile = { id: string; email: string | null; full_name: string | null };
type RoleRow = { user_id: string; role: "admin" | "barber" };
type Barber = { id: string; name: string; user_id: string | null; active: boolean };

const AdminUsers = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: r }, { data: b }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("barbers").select("id, name, user_id, active").order("display_order"),
    ]);
    setProfiles(p ?? []);
    setRoles((r ?? []) as RoleRow[]);
    setBarbers(b ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rolesFor = (uid: string) => roles.filter(r => r.user_id === uid).map(r => r.role);
  const barberFor = (uid: string) => barbers.find(b => b.user_id === uid);

  const addRole = async (uid: string, role: "admin" | "barber") => {
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (error) return toast.error(error.message);
    toast.success(`Rol ${role} asignado`);
    load();
  };

  const removeRole = async (uid: string, role: "admin" | "barber") => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
    if (error) return toast.error(error.message);
    toast.success("Rol removido");
    load();
  };

  const linkBarber = async (uid: string, barberId: string) => {
    // Unlink any other barber currently linked to this user
    await supabase.from("barbers").update({ user_id: null }).eq("user_id", uid);
    if (barberId === "__none__") { toast.success("Vinculación removida"); load(); return; }
    const { error } = await supabase.from("barbers").update({ user_id: uid }).eq("id", barberId);
    if (error) return toast.error(error.message);
    toast.success("Barbero vinculado");
    load();
  };

  const filtered = profiles.filter(p => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (p.email ?? "").toLowerCase().includes(q) || (p.full_name ?? "").toLowerCase().includes(q);
  });

  const unlinkedBarbers = barbers.filter(b => !b.user_id);

  return (
    <PanelLayout requireRole="admin">
      <div className="mb-5">
        <h1 className="font-serif text-2xl sm:text-3xl flex items-center gap-2"><UserCog className="h-6 w-6 text-primary" /> Usuarios y roles</h1>
        <p className="text-sm text-muted-foreground">Asigná roles y vinculá usuarios con perfiles de barbero</p>
      </div>

      <div className="mb-4">
        <Input placeholder="Buscar por nombre o email…" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="luxury-card p-6 text-center text-sm text-muted-foreground">No hay usuarios registrados todavía.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const userRoles = rolesFor(p.id);
            const isAdmin = userRoles.includes("admin");
            const isBarber = userRoles.includes("barber");
            const linked = barberFor(p.id);

            return (
              <div key={p.id} className="luxury-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.full_name || "(sin nombre)"}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {isAdmin && <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary"><Shield className="h-3 w-3" /> Admin</span>}
                    {isBarber && <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-info/15 text-info"><Scissors className="h-3 w-3" /> Barbero</span>}
                    {!isAdmin && !isBarber && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sin rol</span>}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-2">
                  {/* Role: admin */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-secondary/30 border border-border">
                    <div className="text-xs flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Admin</div>
                    {isAdmin
                      ? <Button size="sm" variant="ghost" onClick={() => removeRole(p.id, "admin")}><Trash2 className="h-3.5 w-3.5" /> Quitar</Button>
                      : <Button size="sm" variant="goldOutline" onClick={() => addRole(p.id, "admin")}>Asignar</Button>}
                  </div>
                  {/* Role: barber */}
                  <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-secondary/30 border border-border">
                    <div className="text-xs flex items-center gap-1.5"><Scissors className="h-3.5 w-3.5 text-info" /> Barbero</div>
                    {isBarber
                      ? <Button size="sm" variant="ghost" onClick={() => removeRole(p.id, "barber")}><Trash2 className="h-3.5 w-3.5" /> Quitar</Button>
                      : <Button size="sm" variant="goldOutline" onClick={() => addRole(p.id, "barber")}>Asignar</Button>}
                  </div>
                </div>

                {/* Link barber profile */}
                {isBarber && (
                  <div className="p-2 rounded-md bg-secondary/30 border border-border">
                    <div className="text-xs flex items-center gap-1.5 mb-2 text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Perfil de barbero vinculado</div>
                    <Select value={linked?.id ?? "__none__"} onValueChange={(v) => linkBarber(p.id, v)}>
                      <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sin vincular —</SelectItem>
                        {linked && <SelectItem value={linked.id}>{linked.name} (actual)</SelectItem>}
                        {unlinkedBarbers.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}{!b.active ? " (inactivo)" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!linked && unlinkedBarbers.length === 0 && (
                      <p className="text-[11px] text-muted-foreground mt-2">Todos los barberos ya están vinculados. Creá uno nuevo en "Barberos".</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PanelLayout>
  );
};

export default AdminUsers;
