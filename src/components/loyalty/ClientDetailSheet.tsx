import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClientLoyaltyPanel } from "./ClientLoyaltyPanel";
import { WalkInPaymentDialog } from "@/components/WalkInPaymentDialog";
import { Barber, toISODate } from "@/lib/booking";
import { formatBirthday, isMinor, latestConsent, loyaltyErrorMessage } from "@/lib/loyalty";
import {
  BadgeCheck, Phone, Mail, Cake, Loader2, Plus, Undo2, History, Gift, Bell, Link2, Users, ScrollText, Scissors, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type Visit = Database["public"]["Tables"]["loyalty_visits"]["Row"];
type Reward = Database["public"]["Tables"]["loyalty_rewards"]["Row"];
type Consent = Database["public"]["Tables"]["marketing_consents"]["Row"];
type LoyaltyEvent = Database["public"]["Tables"]["loyalty_events"]["Row"];
type Appt = Pick<Database["public"]["Tables"]["appointments"]["Row"],
  "id" | "appointment_date" | "appointment_time" | "service_name" | "status" | "client_name" | "client_phone"> & { barbers?: { name: string } | null };

interface Props {
  clientId: string | null;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  signup: "alta de tarjeta", customer_panel: "panel del cliente", unsubscribe_link: "link de baja", staff: "personal",
};
const EVENT_LABEL: Record<string, string> = {
  client_registered: "Creó su tarjeta", visit_credited: "Visita sumada", visit_reversed: "Visita revertida",
  reward_earned: "Premio ganado", reward_redeemed: "Premio canjeado", reward_voided: "Premio anulado",
  clients_merged: "Fichas unidas", appointment_linked: "Reserva vinculada", program_changed: "Reglas cambiadas",
  consent_changed: "Consentimiento",
};

export const ClientDetailSheet = ({ clientId, onOpenChange, onChanged }: Props) => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [client, setClient] = useState<Client | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [events, setEvents] = useState<LoyaltyEvent[]>([]);
  const [duplicates, setDuplicates] = useState<Client[]>([]);
  const [unlinked, setUnlinked] = useState<Appt[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [reverseVisit, setReverseVisit] = useState<Visit | null>(null);
  const [mergeSource, setMergeSource] = useState<Client | null>(null);
  const [linkAppt, setLinkAppt] = useState<Appt | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data: c } = await supabase.from("clients").select("*").eq("id", clientId).single();
    const [a, v, r, mc, ev, b] = await Promise.all([
      supabase.from("appointments").select("id, appointment_date, appointment_time, service_name, status, client_name, client_phone, barbers(name)")
        .eq("client_id", clientId).order("appointment_date", { ascending: false }).limit(100),
      supabase.from("loyalty_visits").select("*").eq("client_id", clientId).order("credited_at", { ascending: false }),
      supabase.from("loyalty_rewards").select("*").eq("client_id", clientId).order("earned_at", { ascending: false }),
      supabase.from("marketing_consents").select("*").eq("client_id", clientId).order("seq", { ascending: false }),
      isAdmin ? supabase.from("loyalty_events").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [] as LoyaltyEvent[] }),
      supabase.from("barbers").select("*").eq("active", true).order("display_order"),
    ]);
    setClient(c);
    setAppts((a.data ?? []) as Appt[]);
    setVisits(v.data ?? []);
    setRewards(r.data ?? []);
    setConsents(mc.data ?? []);
    setEvents(ev.data ?? []);
    setBarbers((b.data ?? []).filter(x => isAdmin || x.user_id === user?.id));

    // Posibles duplicados y reservas viejas sin ficha: solo sugerencias, nunca se unen solas
    if (isAdmin && c) {
      // Valores entre comillas para que comas, paréntesis o "+" no rompan el filtro
      const q = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
      const ors = [
        c.phone && `phone.eq.${q(c.phone)}`,
        // El WhatsApp de la tarjeta puede coincidir con el teléfono de una reserva vieja (formatos distintos)
        c.whatsapp && `phone.ilike.${q("*" + c.whatsapp.replace(/\D/g, "").slice(-8))}`,
        c.phone && c.phone.replace(/\D/g, "").length >= 8 && `whatsapp.ilike.${q("*" + c.phone.replace(/\D/g, "").slice(-8))}`,
        c.email && `email.eq.${q(c.email)}`,
        c.last_name && `and(first_name.ilike.${q(c.first_name)},last_name.ilike.${q(c.last_name)})`,
      ].filter(Boolean).join(",");
      const [dup, un] = await Promise.all([
        ors ? supabase.from("clients").select("*").or(ors).neq("id", c.id).limit(10) : Promise.resolve({ data: [] as Client[] }),
        c.phone ? supabase.from("appointments").select("id, appointment_date, appointment_time, service_name, status, client_name, client_phone")
          .is("client_id", null).eq("client_phone", c.phone).order("appointment_date", { ascending: false }).limit(20)
          : Promise.resolve({ data: [] as Appt[] }),
      ]);
      setDuplicates(dup.data ?? []);
      setUnlinked((un.data ?? []) as Appt[]);
    } else {
      setDuplicates([]); setUnlinked([]);
    }
    setLoading(false);
  }, [clientId, isAdmin, user?.id]);

  useEffect(() => { setClient(null); load(); }, [load]);

  const changed = () => { setRefreshKey(k => k + 1); load(); onChanged(); };

  const channels = [
    { channel: "email" as const, label: "Email", consent: latestConsent(consents, "email") },
    { channel: "whatsapp" as const, label: "WhatsApp", consent: latestConsent(consents, "whatsapp") },
  ];
  const fullName = client ? `${client.first_name} ${client.last_name ?? ""}`.trim() : "";
  const visitByAppt = new Map(visits.filter(v => v.appointment_id).map(v => [v.appointment_id!, v]));

  // Historial unificado: turnos atendidos + visitas sin turno (walk-in / manual)
  const history = [
    ...appts.filter(a => a.status === "atendido").map(a => ({
      key: a.id, date: a.appointment_date, label: a.service_name, who: a.barbers?.name ?? null,
      visit: visitByAppt.get(a.id) ?? visits.find(v => v.appointment_id === a.id) ?? null, kind: "Turno",
    })),
    ...visits.filter(v => !v.appointment_id).map(v => ({
      key: v.id, date: v.visit_date, label: v.service_name ?? "Visita", who: null as string | null,
      visit: v, kind: v.source === "manual" ? "Manual" : "Sin turno",
    })),
  ].sort((x, y) => y.date.localeCompare(x.date));
  const totalServices = history.filter(h => !h.visit?.reversed_at).length;

  const recordUnsubscribe = async (channel: "email" | "whatsapp") => {
    if (!client || !confirm(`¿Registrar la baja de ${channel === "email" ? "emails" : "WhatsApp"} de ${fullName}?`)) return;
    const { error } = await supabase.rpc("staff_record_unsubscribe", { _client_id: client.id, _channel: channel });
    if (error) return toast.error(loyaltyErrorMessage(error));
    toast.success("Baja registrada");
    changed();
  };

  return (
    <Dialog open={!!clientId} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-card border-border">
        {!client ? (
          <>
            <DialogTitle className="sr-only">Cargando cliente</DialogTitle>
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl flex items-center gap-2 pr-6 text-left">
                {fullName}
                {client.user_id && <BadgeCheck className="h-5 w-5 text-primary" aria-label="Tarjeta verificada" />}
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-6">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                {client.phone && <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{client.phone}</a>}
                {client.email && <span className="flex items-center gap-1.5 break-all"><Mail className="h-3.5 w-3.5" />{client.email}{!client.user_id && <span className="text-[10px]">(sin verificar)</span>}</span>}
                {client.whatsapp && (
                  <a href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                    <MessageCircle className="h-3.5 w-3.5" />{client.whatsapp}
                  </a>
                )}
                {(client.birth_day || client.birth_date) && (
                  <span className="flex items-center gap-1.5"><Cake className="h-3.5 w-3.5" />
                    {client.birth_day ? formatBirthday(client.birth_day, client.birth_month, client.birth_year) + (isMinor(client.birth_day, client.birth_month, client.birth_year) ? " · menor de 18" : "") : new Date(client.birth_date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                  </span>
                )}
              </div>

              <ClientLoyaltyPanel clientId={client.id} name={fullName} compact refreshKey={refreshKey} onChanged={changed} />

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Button variant="goldOutline" size="sm" className="w-full" onClick={() => setWalkInOpen(true)} disabled={barbers.length === 0}>
                    <Scissors className="h-4 w-4" /> Cobrar cliente sin turno
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Vino sin reservar: registra el cobro y suma la visita.</p>
                </div>
                {isAdmin && (
                  <div className="space-y-1">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setManualOpen(true)}>
                      <Plus className="h-4 w-4" /> Corregir: sumar visita
                    </Button>
                    <p className="text-[11px] text-muted-foreground">Solo si una atención no quedó registrada. Pide motivo.</p>
                  </div>
                )}
              </div>
              {barbers.length === 0 && !isAdmin && (
                <p className="text-xs text-muted-foreground -mt-4">Tu usuario no está vinculado a un barbero activo.</p>
              )}

              {/* Historial */}
              <Section icon={History} title={`Servicios realizados (${totalServices})`}>
                {loading && history.length === 0 ? null : history.length === 0 ? (
                  <Empty>Todavía no tiene servicios registrados.</Empty>
                ) : (
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {history.map(h => (
                      <div key={h.key} className={cn("p-3 flex items-center gap-3 text-sm", h.visit?.reversed_at && "opacity-60")}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{h.label} <span className="text-xs text-muted-foreground">· {h.kind}</span></p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(h.date + "T12:00:00").toLocaleDateString("es-AR")}{h.who ? ` · ${h.who}` : ""}
                            {" · "}
                            {!h.visit ? "no suma (anterior a la tarjeta)" : h.visit.reversed_at ? `revertida: ${h.visit.reversal_reason}` : "sumó visita"}
                          </p>
                          {h.visit?.reason && <p className="text-xs text-muted-foreground italic truncate">Motivo: {h.visit.reason}</p>}
                        </div>
                        {isAdmin && h.visit && !h.visit.reversed_at && (
                          <Button variant="ghost" size="sm" onClick={() => setReverseVisit(h.visit)} title="Revertir visita">
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Premios */}
              <Section icon={Gift} title="Premios">
                {rewards.length === 0 ? <Empty>Sin premios todavía.</Empty> : (
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {rewards.map(r => (
                      <div key={r.id} className="p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate">{r.reward_description}</span>
                          <span className={cn("text-[10px] uppercase tracking-[0.02em] px-2 py-0.5 rounded-full border flex-shrink-0",
                            r.status === "available" && "border-primary text-primary",
                            r.status === "redeemed" && "border-border text-muted-foreground",
                            r.status === "voided" && "border-destructive/40 text-destructive")}>
                            {r.status === "available" ? "disponible" : r.status === "redeemed" ? "canjeado" : "anulado"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ganado {new Date(r.earned_at).toLocaleDateString("es-AR")} ({r.visits_required} visitas)
                          {r.redeemed_at && ` · canjeado ${new Date(r.redeemed_at).toLocaleDateString("es-AR")}`}
                          {r.void_reason && ` · ${r.void_reason}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Promociones */}
              <Section icon={Bell} title="Promociones y avisos">
                <div className="rounded-lg border border-border p-3 text-sm space-y-3">
                  {channels.map(({ channel, label, consent }) => (
                    <div key={channel} className="flex items-center justify-between gap-3">
                      <span>
                        {label}:{" "}
                        <span className={consent?.granted ? "text-primary" : "text-muted-foreground"}>
                          {consent?.granted ? "acepta" : consent ? "dado de baja" : "no aceptó"}
                        </span>
                      </span>
                      {isAdmin && consent?.granted && <Button size="sm" variant="ghost" onClick={() => recordUnsubscribe(channel)}>Registrar baja</Button>}
                    </div>
                  ))}
                  {consents.length > 0 && (
                    <div className="border-t border-border pt-2 space-y-1">
                      {consents.map(mc => (
                        <p key={mc.id} className="text-xs text-muted-foreground">
                          {new Date(mc.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                          {mc.channel === "whatsapp" ? "WhatsApp" : "Email"} · {mc.granted ? "aceptó" : "baja"} · {SOURCE_LABEL[mc.source] ?? mc.source} · texto {mc.text_version}
                        </p>
                      ))}
                    </div>
                  )}
                  {!client.user_id && <p className="text-xs text-muted-foreground">Solo los clientes con tarjeta verificada pueden aceptar promociones.</p>}
                </div>
              </Section>

              {/* Duplicados y reservas viejas (admin) */}
              {isAdmin && (duplicates.length > 0 || unlinked.length > 0) && (
                <Section icon={Users} title="Posibles duplicados">
                  <p className="text-xs text-muted-foreground mb-2">
                    Coinciden en teléfono, email o nombre. Uní o vinculá solo si confirmaste que es la misma persona.
                  </p>
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {duplicates.map(d => (
                      <div key={d.id} className="p-3 flex items-center gap-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate flex items-center gap-1">{d.user_id && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}{d.first_name} {d.last_name ?? ""}</p>
                          <p className="text-xs text-muted-foreground truncate">{[d.phone, d.email].filter(Boolean).join(" · ") || "sin contacto"}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setMergeSource(d)} disabled={!!(d.user_id && client.user_id)}>
                          Unir aquí
                        </Button>
                      </div>
                    ))}
                    {unlinked.map(a => (
                      <div key={a.id} className="p-3 flex items-center gap-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">Reserva sin ficha: {a.service_name}</p>
                          <p className="text-xs text-muted-foreground">{new Date(a.appointment_date + "T12:00:00").toLocaleDateString("es-AR")} · {a.client_name} · {a.status}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setLinkAppt(a)}><Link2 className="h-4 w-4" /> Vincular</Button>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Auditoría (admin) */}
              {isAdmin && events.length > 0 && (
                <Section icon={ScrollText} title="Historial de cambios">
                  <div className="rounded-lg border border-border divide-y divide-border max-h-64 overflow-y-auto">
                    {events.map(e => (
                      <div key={e.id} className="p-2.5 text-xs">
                        <span className="text-foreground">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                        <span className="text-muted-foreground"> · {new Date(e.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
                        {e.actor_id && <span className="text-muted-foreground"> · {e.actor_id === user?.id ? "vos" : "personal"}</span>}
                        {e.reason && <p className="text-muted-foreground italic">{e.reason}</p>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
              {walkInOpen && (
                <WalkInPaymentDialog date={new Date()} barbers={barbers}
                  client={{ id: client.id, first_name: client.first_name, last_name: client.last_name, user_id: client.user_id }}
                  onClose={() => { setWalkInOpen(false); changed(); }} />
              )}
            </Dialog>

            <ReasonDialog
              open={manualOpen} onOpenChange={setManualOpen} withDate
              title="Corregir: sumar una visita"
              description="Para corregir una atención que no quedó registrada (por ejemplo, una visita anterior con comprobante). Queda auditado."
              confirmLabel="Sumar visita"
              onConfirm={async (reason, date) => {
                const { error } = await supabase.rpc("admin_add_manual_visit", { _client_id: client.id, _visit_date: date, _reason: reason });
                if (error) { toast.error(loyaltyErrorMessage(error)); return false; }
                toast.success("Visita sumada"); changed(); return true;
              }}
            />
            <ReasonDialog
              open={!!reverseVisit} onOpenChange={o => !o && setReverseVisit(null)}
              title="Revertir visita"
              description="Descuenta la visita del ciclo. Si ya había generado un premio sin canjear, el premio se anula. Si el premio ya se canjeó, se mantiene y el cliente queda debiendo una visita."
              confirmLabel="Revertir"
              onConfirm={async reason => {
                const { error } = await supabase.rpc("admin_reverse_visit", { _visit_id: reverseVisit!.id, _reason: reason });
                if (error) { toast.error(loyaltyErrorMessage(error)); return false; }
                toast.success("Visita revertida"); changed(); return true;
              }}
            />
            <ReasonDialog
              open={!!mergeSource} onOpenChange={o => !o && setMergeSource(null)}
              title={`Unir "${mergeSource?.first_name} ${mergeSource?.last_name ?? ""}" a esta ficha`}
              description="Mueve reservas, visitas, premios y consentimientos a esta ficha y borra la otra. No se puede deshacer."
              confirmLabel="Unir fichas"
              onConfirm={async reason => {
                const { error } = await supabase.rpc("admin_merge_clients", { _source_id: mergeSource!.id, _target_id: client.id, _reason: reason });
                if (error) { toast.error(loyaltyErrorMessage(error)); return false; }
                toast.success("Fichas unidas"); changed(); return true;
              }}
            />
            <ReasonDialog
              open={!!linkAppt} onOpenChange={o => !o && setLinkAppt(null)}
              title="Vincular reserva a esta ficha"
              description="La reserva pasa a figurar en el historial del cliente. No suma visitas automáticamente: si corresponde, sumá una visita manual."
              confirmLabel="Vincular"
              onConfirm={async reason => {
                const { error } = await supabase.rpc("admin_link_appointment", { _appointment_id: linkAppt!.id, _client_id: client.id, _reason: reason });
                if (error) { toast.error(loyaltyErrorMessage(error)); return false; }
                toast.success("Reserva vinculada"); changed(); return true;
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Section = ({ icon: Icon, title, children }: { icon: typeof History; title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h3 className="text-xs uppercase tracking-[0.02em] text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-primary" /> {title}</h3>
    {children}
  </section>
);

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

const ReasonDialog = ({ open, onOpenChange, title, description, confirmLabel, withDate, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel: string;
  withDate?: boolean; onConfirm: (reason: string, date: string) => Promise<boolean>;
}) => {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setReason(""); setDate(toISODate(new Date())); } }, [open]);

  const submit = async () => {
    if (reason.trim().length < 3) return toast.error("Escribí el motivo (mínimo 3 caracteres).");
    setBusy(true);
    const ok = await onConfirm(reason.trim(), date);
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {withDate && (
            <div><Label>Fecha de la visita</Label><Input type="date" value={date} max={toISODate(new Date())} onChange={e => setDate(e.target.value)} /></div>
          )}
          <div><Label>Motivo</Label><Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Obligatorio: queda en el historial" /></div>
          <Button variant="gold" className="w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
