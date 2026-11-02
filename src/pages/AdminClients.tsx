import { Link } from "react-router-dom";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Database } from "@/integrations/supabase/types";
import { PanelLayout } from "@/components/PanelLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientDetailSheet } from "@/components/loyalty/ClientDetailSheet";
import { downloadFile, formatBirthday, isMinor, latestConsent, loyaltyErrorMessage, toCsv } from "@/lib/loyalty";
import { toISODate } from "@/lib/booking";
import { Loader2, Users2, Search, Phone, Calendar, Star, BadgeCheck, Mail, Gift, Download, Settings2, AlertCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";

type Program = Database["public"]["Tables"]["loyalty_programs"]["Row"];

type Client = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  birthday: string;
  verified: boolean;
  subscribed: boolean;
  wa_subscribed: boolean;
  visit_count: number;
  cycle_visits: number;
  rewards_available: number;
  last_visit: string | null;
};

type Filter = "all" | "card" | "subscribed" | "whatsapp" | "rewards";

const AdminClients = () => {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [clients, setClients] = useState<Client[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const [{ data: clientData, error }, { data: prog }] = await Promise.all([
      supabase
        .from("clients")
        .select(`id, first_name, last_name, phone, email, whatsapp, birth_date, birth_day, birth_month, birth_year, user_id, created_at,
          appointments(appointment_date, status),
          loyalty_accounts(cycle_visits),
          loyalty_visits(visit_date, appointment_id, reversed_at),
          loyalty_rewards(status),
          marketing_consents(granted, created_at, channel, seq)`)
        .order("created_at", { ascending: false }),
      supabase.from("loyalty_programs").select("*").eq("active", true).maybeSingle(),
    ]);
    setProgram(prog);
    if (error) { setLoadError(true); setLoading(false); return; }

    setClients((clientData ?? []).map(c => {
      const attended = (c.appointments ?? []).filter(a => a.status === "atendido").map(a => a.appointment_date);
      const extra = (c.loyalty_visits ?? []).filter(v => !v.appointment_id && !v.reversed_at).map(v => v.visit_date);
      const dates = [...attended, ...extra].sort().reverse();
      const account = Array.isArray(c.loyalty_accounts) ? c.loyalty_accounts[0] : c.loyalty_accounts;
      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        email: c.email,
        whatsapp: c.whatsapp,
        birthday: c.birth_day
          ? formatBirthday(c.birth_day, c.birth_month, c.birth_year) + (isMinor(c.birth_day, c.birth_month, c.birth_year) ? " (menor)" : "")
          : c.birth_date ? new Date(c.birth_date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "",
        verified: !!c.user_id,
        subscribed: latestConsent(c.marketing_consents, "email")?.granted ?? false,
        wa_subscribed: latestConsent(c.marketing_consents, "whatsapp")?.granted ?? false,
        visit_count: dates.length,
        cycle_visits: account?.cycle_visits ?? 0,
        rewards_available: (c.loyalty_rewards ?? []).filter(r => r.status === "available").length,
        last_visit: dates[0] ?? null,
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return clients.filter(c => {
      if (filter === "card" && !c.verified) return false;
      if (filter === "subscribed" && !c.subscribed) return false;
      if (filter === "whatsapp" && !c.wa_subscribed) return false;
      if (filter === "rewards" && c.rewards_available === 0) return false;
      if (!q) return true;
      return (
        `${c.first_name} ${c.last_name ?? ""}`.toLowerCase().includes(q) ||
        (c.email ?? "").includes(q) ||
        (digits.length >= 3 && [c.phone, c.whatsapp].some(n => (n ?? "").replace(/\D/g, "").includes(digits)))
      );
    });
  }, [clients, search, filter]);

  const exportCsv = async () => {
    setExporting(true);
    const { data, error } = await supabase.rpc("admin_export_marketing_contacts");
    setExporting(false);
    if (error) return toast.error(loyaltyErrorMessage(error));
    if (!data?.length) return toast.info("No hay contactos con consentimiento vigente para exportar.");
    const rows = data.map(r => ({
      ...r,
      consent_at: new Date(r.consent_at).toISOString(),
      // Solo dígitos (formato de WhatsApp / wa.me); además evita que empiece con "+"
      whatsapp: r.whatsapp?.replace(/\D/g, "") ?? "",
      whatsapp_ok: r.whatsapp_opt_in ? "Sí" : "No",
      unsubscribe_url: `${window.location.origin}/baja?token=${r.unsubscribe_token}`,
    }));
    downloadFile(toCsv(rows, [
      { key: "first_name", label: "Nombre" },
      { key: "last_name", label: "Apellido" },
      { key: "email", label: "Email" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "whatsapp_ok", label: "Acepta WhatsApp" },
      { key: "birthday", label: "Nacimiento (DD/MM/AAAA)" },
      { key: "consent_at", label: "Fecha de consentimiento" },
      { key: "consent_source", label: "Origen del consentimiento" },
      { key: "consent_version", label: "Versión del texto" },
      { key: "consent_text", label: "Texto aceptado" },
      { key: "unsubscribe_url", label: "Link de baja" },
    ]), `contactos-marketing-${toISODate(new Date())}.csv`);
    toast.success(`${rows.length} contacto${rows.length !== 1 ? "s" : ""} exportado${rows.length !== 1 ? "s" : ""}`);
  };

  return (
    <PanelLayout requireRole="any">
      <div className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" /> Clientes
          </h1>
          <p className="text-sm text-muted-foreground">Base de clientes, tarjetas de fidelidad y promociones</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild><Link to="/admin/tarjeta"><Settings2 className="h-4 w-4" /> Tarjeta</Link></Button>
            <Button variant="goldOutline" size="sm" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar suscriptos
            </Button>
          </div>
        )}
      </div>

      {program && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center gap-x-2 gap-y-1 ${program.is_demo ? "border-amber-300/40 bg-amber-300/5 text-amber-200" : "border-border text-muted-foreground"}`}>
          <Gift className="h-3.5 w-3.5 text-primary" />
          <span><strong className="text-foreground">{program.visits_required} visitas</strong> = {program.reward_description}</span>
          {program.is_demo && <span>· Configuración DEMO: falta que el dueño defina las condiciones reales.</span>}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, email o teléfono..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filter} onValueChange={v => setFilter(v as Filter)}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="card">Con tarjeta</SelectItem>
            <SelectItem value="rewards">Con premio disponible</SelectItem>
            <SelectItem value="subscribed">Suscriptos por email</SelectItem>
            <SelectItem value="whatsapp">Aceptan WhatsApp</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : loadError ? (
        <div className="luxury-card p-8 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">No se pudieron cargar los clientes.</p>
          <Button variant="goldOutline" size="sm" onClick={load}>Reintentar</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="luxury-card p-8 text-center">
          <Users2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {search || filter !== "all" ? "No se encontraron clientes." : "Todavía no hay clientes registrados."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">{filtered.length} cliente{filtered.length !== 1 ? "s" : ""}</p>
          {filtered.map(c => (
            <button key={c.id} onClick={() => setSelected(c.id)} className="w-full text-left luxury-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center font-serif text-lg text-primary flex-shrink-0">
                  {c.first_name[0]}{c.last_name?.[0] ?? ""}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium flex items-center gap-1.5 flex-wrap">
                    {c.first_name} {c.last_name ?? ""}
                    {c.verified && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Tarjeta verificada" />}
                    {c.subscribed && <Mail className="h-3.5 w-3.5 text-primary" aria-label="Suscripto por email" />}
                    {c.wa_subscribed && <MessageCircle className="h-3.5 w-3.5 text-primary" aria-label="Acepta WhatsApp" />}
                    {c.rewards_available > 0 && (
                      <span className="text-[10px] uppercase tracking-[0.02em] px-1.5 py-0.5 rounded-full border border-primary text-primary flex items-center gap-1">
                        <Gift className="h-3 w-3" /> {c.rewards_available}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    {c.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                    {c.whatsapp && c.whatsapp !== c.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {c.whatsapp}</span>}
                    {c.email && <span className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-[16rem]"><Mail className="h-3 w-3" /> {c.email}</span>}
                    {c.birthday && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> {c.birthday}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-5 sm:text-right text-sm pl-[52px] sm:pl-0">
                {program && (
                  <div>
                    <div className="font-semibold">{Math.max(0, Math.min(c.cycle_visits, program.visits_required))}/{program.visits_required}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-[0.02em]">tarjeta</div>
                  </div>
                )}
                <div>
                  <div className="font-semibold text-primary flex items-center gap-1 sm:justify-end">
                    <Star className="h-3.5 w-3.5" /> {c.visit_count}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-[0.02em]">visitas</div>
                </div>
                <div>
                  <div className="font-medium text-sm">
                    {c.last_visit ? new Date(c.last_visit + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-[0.02em]">última visita</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <ClientDetailSheet clientId={selected} onOpenChange={o => !o && setSelected(null)} onChanged={load} />
    </PanelLayout>
  );
};

export default AdminClients;
