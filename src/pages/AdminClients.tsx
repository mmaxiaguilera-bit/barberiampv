import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Input } from "@/components/ui/input";
import { Loader2, Users2, Search, Phone, Calendar, Star } from "lucide-react";

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  birth_date: string | null;
  created_at: string;
  visit_count: number;
  last_visit: string | null;
};

const getAge = (birth_date: string) => {
  const today = new Date();
  const dob = new Date(birth_date);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

const AdminClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: clientData } = await supabase
      .from("clients")
      .select("*, appointments(appointment_date)")
      .order("created_at", { ascending: false });

    if (clientData) {
      const mapped: Client[] = clientData.map((c: any) => {
        const appts: { appointment_date: string }[] = c.appointments ?? [];
        const dates = appts.map(a => a.appointment_date).sort().reverse();
        return {
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          birth_date: c.birth_date,
          created_at: c.created_at,
          visit_count: dates.length,
          last_visit: dates[0] ?? null,
        };
      });
      setClients(mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  });

  return (
    <PanelLayout requireRole="any">
      <div className="mb-5">
        <h1 className="font-serif text-2xl sm:text-3xl flex items-center gap-2">
          <Users2 className="h-6 w-6 text-primary" /> Clientes
        </h1>
        <p className="text-sm text-muted-foreground">Base de datos de todos los clientes registrados</p>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="luxury-card p-8 text-center">
          <Users2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {search ? "No se encontraron clientes." : "Todavía no hay clientes registrados."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">{filtered.length} cliente{filtered.length !== 1 ? "s" : ""}</p>
          {filtered.map(c => (
            <div key={c.id} className="luxury-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center font-serif text-lg text-primary flex-shrink-0">
                {c.first_name[0]}{c.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{c.first_name} {c.last_name}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </span>
                  {c.birth_date && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(c.birth_date + "T12:00:00").toLocaleDateString("es-AR")} · {getAge(c.birth_date)} años
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-4 sm:text-right text-sm">
                <div>
                  <div className="font-semibold text-primary flex items-center gap-1">
                    <Star className="h-3.5 w-3.5" /> {c.visit_count}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">visitas</div>
                </div>
                {c.last_visit && (
                  <div>
                    <div className="font-medium text-sm">
                      {new Date(c.last_visit + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">última visita</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelLayout>
  );
};

export default AdminClients;
