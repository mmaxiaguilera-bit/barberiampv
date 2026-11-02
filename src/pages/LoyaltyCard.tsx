import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { BookingDialog } from "@/components/BookingDialog";
import { StampCard } from "@/components/loyalty/StampCard";
import { LoyaltySignupLayout } from "@/components/loyalty/StampCardPreview";
import { cn } from "@/lib/utils";
import { LoyaltyAccessForm, BirthdayPicker, ErrorText, SignupPrivacyNotice, TermsCheckbox, WhatsappField } from "@/components/loyalty/LoyaltyAccessForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Database } from "@/integrations/supabase/types";
import {
  CONSENT_TEXT, CONSENT_VERSION, WHATSAPP_CONSENT_TEXT, WHATSAPP_CONSENT_VERSION, clearPendingSignup,
  isValidBirthday, loyaltyErrorMessage, loyaltyProgress, normalizeWhatsapp,
  readPendingSignup, whatsappError, type PendingSignup,
} from "@/lib/loyalty";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { Gift, Loader2, LogOut, Scissors, AlertCircle, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

type Program = Database["public"]["Tables"]["loyalty_programs"]["Row"];
type Reward = Database["public"]["Tables"]["loyalty_rewards"]["Row"];


const LoyaltyCard = () => {
  const { user, customerId, loading } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className={cn("flex-1 container px-4 py-8 sm:py-12 mx-auto w-full", user && customerId ? "max-w-lg" : "max-w-6xl")}>
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !user ? (
          <LoyaltyAccessForm withPreview />
        ) : !customerId ? (
          <CompleteSignup />
        ) : (
          <CardDashboard clientId={customerId} />
        )}
      </main>
    </div>
  );
};

export default LoyaltyCard;

// =====================================================================
// Usuario verificado sin tarjeta: crearla con los datos del formulario
// =====================================================================
const CompleteSignup = () => {
  const { user, refreshRole, signOut } = useAuth();
  const [checking, setChecking] = useState(true);
  const [firstName, setFirstName] = useState((user?.user_metadata?.full_name as string) ?? "");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [waOptIn, setWaOptIn] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knownName, setKnownName] = useState<string | null>(null);
  const checkedFor = useRef<string | null>(null);

  const register = useCallback(async (p: Omit<PendingSignup, "email">) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("loyalty_register", {
      _first_name: p.first_name,
      _whatsapp: p.whatsapp || undefined,
      _birth_day: p.birth_day ?? undefined,
      _birth_month: p.birth_month ?? undefined,
      _marketing_opt_in: p.marketing_opt_in,
      _consent_version: CONSENT_VERSION,
      _whatsapp_opt_in: p.whatsapp_opt_in,
      _whatsapp_consent_version: WHATSAPP_CONSENT_VERSION,
      _terms_version: TERMS_VERSION,
      _privacy_notice_version: PRIVACY_VERSION,
    });
    setBusy(false);
    if (err) { setError(loyaltyErrorMessage(err)); return; }
    clearPendingSignup();
    toast.success("¡Tu tarjeta está lista!");
    await refreshRole();
  }, [refreshRole]);

  useEffect(() => {
    // Una sola vez por usuario (refreshRole cambia de identidad en cada render del contexto)
    if (!user || checkedFor.current === user.id) return;
    checkedFor.current = user.id;
    (async () => {
      // Puede que ya tenga tarjeta y el contexto todavía no lo sepa
      const { data } = await supabase.from("clients").select("id").eq("user_id", user!.id).maybeSingle();
      if (data) { await refreshRole(); return; }
      const pending = readPendingSignup();
      if (pending && pending.email === user!.email?.toLowerCase()) {
        // Datos guardados al pedir el código: precargar y crear la tarjeta si están completos
        setFirstName(pending.first_name);
        setWhatsapp(pending.whatsapp ?? "");
        setBirthDay(pending.birth_day ? String(pending.birth_day) : "");
        setBirthMonth(pending.birth_month ? String(pending.birth_month) : "");
        setOptIn(pending.marketing_opt_in);
        setWaOptIn(pending.whatsapp_opt_in ?? false);
        setAcceptedTerms(pending.accepted_terms === true);
        // Solo se crea sola si aceptó las condiciones en el formulario anterior
        if (pending.accepted_terms === true && !whatsappError(pending.whatsapp ?? "", pending.whatsapp_opt_in)) await register(pending);
      } else {
        // Email ya verificado: si es cliente por sus turnos, precargar sus datos
        const { data: known } = await supabase.rpc("loyalty_prefill");
        const k = known?.[0];
        if (k) {
          setKnownName(k.first_name);
          setFirstName(k.first_name ?? "");
          setWhatsapp(k.whatsapp ?? "");
          setBirthDay(k.birth_day ? String(k.birth_day) : "");
          setBirthMonth(k.birth_month ? String(k.birth_month) : "");
        }
      }
      setChecking(false);
    })();
  }, [user, refreshRole, register]);

  if (checking) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const submit = () => {
    const d = birthDay ? Number(birthDay) : null;
    const m = birthMonth ? Number(birthMonth) : null;
    if (firstName.trim().length < 2) return setError("Ingresá tu nombre (mínimo 2 letras).");
    const waError = whatsappError(whatsapp, waOptIn);
    if (waError) return setError(waError);
    if (!isValidBirthday(d, m)) return setError("Completá día y mes de tu cumpleaños, o dejá ambos vacíos.");
    if (!acceptedTerms) return setError("Para crear la tarjeta tenés que aceptar las condiciones.");
    register({
      first_name: firstName.trim(), whatsapp: normalizeWhatsapp(whatsapp), birth_day: d, birth_month: m,
      marketing_opt_in: optIn, whatsapp_opt_in: waOptIn, accepted_terms: true,
    });
  };

  return (
    <LoyaltySignupLayout name={firstName}>
    <div className="space-y-6 w-full">
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4">
        <div className="pb-2">
          <h2 className="font-serif text-3xl sm:text-4xl">{knownName ? `¡Hola ${knownName}!` : "Creá tu tarjeta"}</h2>
          <p className="text-muted-foreground mt-1">
            {knownName
              ? "Ya te conocemos: completamos tus datos. Revisalos, sumá tu cumpleaños y listo."
              : "Completá tus datos para empezar."}
          </p>
        </div>
        <div>
          <Label htmlFor="fn2">Nombre</Label>
          <Input id="fn2" value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={50} />
        </div>
        <div>
          <Label htmlFor="em2">Email</Label>
          <div className="relative">
            <Input id="em2" value={user?.email ?? ""} readOnly className="pr-24 text-muted-foreground" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-primary flex items-center gap-1">
              <BadgeCheck className="h-3.5 w-3.5" /> Verificado
            </span>
          </div>
        </div>
        <WhatsappField id="wa2" value={whatsapp} onChange={setWhatsapp} />
        <div>
          <Label>Cumpleaños <span className="text-muted-foreground font-normal">(opcional)</span></Label>
          <BirthdayPicker day={birthDay} month={birthMonth} onDay={setBirthDay} onMonth={setBirthMonth} />
        </div>
        <TermsCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} />
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <Checkbox checked={optIn} onCheckedChange={v => setOptIn(v === true)} className="mt-0.5" />
          <span className="text-muted-foreground">{CONSENT_TEXT}</span>
        </label>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <Checkbox checked={waOptIn} onCheckedChange={v => setWaOptIn(v === true)} className="mt-0.5" />
          <span className="text-muted-foreground">{WHATSAPP_CONSENT_TEXT}</span>
        </label>
        <SignupPrivacyNotice />
        {error && <ErrorText>{error}</ErrorText>}
        <Button variant="gold" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear mi tarjeta"}
        </Button>
      </form>
      <button onClick={signOut} className="block mx-auto text-sm text-muted-foreground hover:text-foreground">Salir</button>
    </div>
    </LoyaltySignupLayout>
  );
};

// =====================================================================
// Panel del cliente
// =====================================================================
interface CardData {
  client: { first_name: string; last_name: string | null; email: string | null; whatsapp: string | null; birth_day: number | null; birth_month: number | null };
  account: { total_visits: number; cycle_visits: number } | null;
  program: Program | null;
  rewards: Reward[];
}

const CardDashboard = ({ clientId }: { clientId: string }) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<CardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const [c, a, p, r] = await Promise.all([
      supabase.from("clients").select("first_name, last_name, email, whatsapp, birth_day, birth_month").eq("id", clientId).single(),
      supabase.from("loyalty_accounts").select("total_visits, cycle_visits").eq("client_id", clientId).maybeSingle(),
      supabase.from("loyalty_programs").select("*").eq("active", true).maybeSingle(),
      supabase.from("loyalty_rewards").select("*").eq("client_id", clientId).order("earned_at", { ascending: false }),
    ]);
    if (c.error || p.error || r.error) { setLoadError(true); return; }
    setData({ client: c.data, account: a.data, program: p.data, rewards: r.data ?? [] });
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (loadError) {
    return (
      <div className="luxury-card p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
        <p className="text-sm text-muted-foreground">No pudimos cargar tu tarjeta.</p>
        <Button variant="goldOutline" onClick={load}>Reintentar</Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const { client, account, program, rewards } = data;
  const cycle = account?.cycle_visits ?? 0;
  const required = program?.visits_required ?? 10;
  const progress = loyaltyProgress(cycle, required);
  const available = rewards.filter(r => r.status === "available");
  const redeemed = rewards.filter(r => r.status === "redeemed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-luxury text-primary">Hola</p>
          <h1 className="font-serif text-3xl truncate">{client.first_name}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/"); }}>
          <LogOut className="h-4 w-4" /> Salir
        </Button>
      </div>

      {program ? (
        <StampCard
          name={`${client.first_name} ${client.last_name ?? ""}`.trim()}
          cycleVisits={cycle}
          visitsRequired={required}
          rewardDescription={program.reward_description}
          isDemo={program.is_demo}
        />
      ) : (
        <div className="luxury-card p-6 text-sm text-muted-foreground text-center">El programa de fidelidad no está activo en este momento.</div>
      )}

      <div className="luxury-card p-4 text-center">
        {progress.owed > 0 ? (
          <p className="text-sm">Se corrigió una visita: sumá <strong className="text-primary">{progress.remaining}</strong> visitas para tu próximo premio.</p>
        ) : (
          <p className="text-sm">
            Te {progress.remaining === 1 ? "falta" : "faltan"} <strong className="text-primary text-lg">{progress.remaining}</strong> {progress.remaining === 1 ? "visita" : "visitas"} para tu próximo premio
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{account?.total_visits ?? 0} visitas en total</p>
      </div>

      <Button variant="gold" size="lg" className="w-full uppercase tracking-[0.02em]" onClick={() => setBookingOpen(true)}>
        <Scissors className="h-5 w-5" /> Reservar turno
      </Button>

      {/* Premios */}
      <section className="space-y-3">
        <h2 className="font-serif text-xl flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> Premios</h2>
        {available.length === 0 && redeemed.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no ganaste premios. ¡Ya falta menos!</p>
        )}
        {available.map(r => (
          <div key={r.id} className="rounded-xl border border-primary/60 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <Gift className="h-6 w-6 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">{r.reward_description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Disponible · ganado el {new Date(r.earned_at).toLocaleDateString("es-AR")}.
                  Mostrá esta pantalla en el local: el personal confirma el canje.
                </p>
              </div>
            </div>
          </div>
        ))}
        {redeemed.length > 0 && (
          <div className="luxury-card divide-y divide-border">
            {redeemed.map(r => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground truncate">{r.reward_description}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">Canjeado {new Date(r.redeemed_at!).toLocaleDateString("es-AR")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <BookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
};

