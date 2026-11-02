import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LoyaltySignupLayout } from "./StampCardPreview";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONSENT_TEXT, MONTHS, WHATSAPP_CONSENT_TEXT, authErrorMessage, isValidBirthday, normalizeWhatsapp, savePendingSignup, whatsappError } from "@/lib/loyalty";
import { Gift, Loader2, Mail, ArrowLeft, AlertCircle } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email("Ingresá un email válido").max(255);
const RESEND_SECONDS = 60;

// =====================================================================
// Acceso sin contraseña: crear tarjeta o entrar con código por email
// =====================================================================
export const LoyaltyAccessForm = ({ onVerified, showHeading = true, initialMode = "signup", withPreview = false }: {
  // Se llama cuando el código se validó y ya hay sesión
  onVerified?: () => void;
  showHeading?: boolean;
  initialMode?: "signup" | "login";
  // Tarjeta de ejemplo a la derecha con el nombre que se escribe (página /mi-tarjeta)
  withPreview?: boolean;
}) => {
  const [mode, setMode] = useState<"signup" | "login">(initialMode);
  const [step, setStep] = useState<"form" | "code">("form");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [birthDay, setBirthDay] = useState<string>("");
  const [birthMonth, setBirthMonth] = useState<string>("");
  const [whatsapp, setWhatsapp] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [waOptIn, setWaOptIn] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Error devuelto por un enlace de email vencido o ya usado (#error_code=otp_expired)
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error_code")) {
      setError(hash.get("error_code") === "otp_expired"
        ? "El enlace venció o ya fue usado. Pedí un código nuevo."
        : "No pudimos validar el enlace. Pedí un código nuevo.");
      setMode("login");
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    setError(null);
    if (mode === "signup" && (firstName.trim().length < 2 || firstName.trim().length > 50)) {
      return setError("Ingresá tu nombre (mínimo 2 letras).");
    }
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) return setError(parsedEmail.error.issues[0].message);

    if (mode === "signup") {
      const d = birthDay ? Number(birthDay) : null;
      const m = birthMonth ? Number(birthMonth) : null;
      const waError = whatsappError(whatsapp, waOptIn);
      if (waError) return setError(waError);
      if (!isValidBirthday(d, m)) return setError("Completá día y mes de tu cumpleaños, o dejá ambos vacíos.");
      if (!acceptedTerms) return setError("Para crear la tarjeta tenés que aceptar las condiciones.");
      savePendingSignup({
        email: parsedEmail.data, first_name: firstName.trim(), whatsapp: normalizeWhatsapp(whatsapp),
        birth_day: d, birth_month: m, marketing_opt_in: optIn, whatsapp_opt_in: waOptIn,
        accepted_terms: true,
      });
    }

    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: parsedEmail.data,
      options: {
        shouldCreateUser: mode === "signup",
        emailRedirectTo: `${window.location.origin}/mi-tarjeta`,
        ...(mode === "signup" ? { data: { full_name: firstName.trim() } } : {}),
      },
    });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    setEmail(parsedEmail.data);
    setStep("code");
    setCooldown(RESEND_SECONDS);
  };

  const verify = async () => {
    setError(null);
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return setError("Ingresá el código completo que te llegó por email.");
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    // useAuth detecta la sesión; /mi-tarjeta termina de crear la tarjeta con los datos guardados
    onVerified?.();
  };

  if (step === "code") {
    return (
      <div className={showHeading ? "luxury-card p-6 space-y-5" : "space-y-5"}>
        <button onClick={() => { setStep("form"); setCode(""); setError(null); }} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Cambiar email
        </button>
        <div className="text-center space-y-2">
          <Mail className="h-10 w-10 text-primary mx-auto" />
          <h1 className="font-serif text-2xl">Revisá tu email</h1>
          <p className="text-sm text-muted-foreground">
            Te enviamos un código a <strong className="text-foreground break-all">{email}</strong>.
            Ingresalo acá o tocá el enlace del email.
          </p>
        </div>
        <form onSubmit={e => { e.preventDefault(); verify(); }} className="space-y-3">
          <Label htmlFor="otp">Código</Label>
          <Input
            id="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={10}
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-2xl tracking-[0.5em] h-14" placeholder="••••••"
          />
          {error && <ErrorText>{error}</ErrorText>}
          <Button variant="gold" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </Button>
        </form>
        <div className="text-center text-sm text-muted-foreground">
          {cooldown > 0 ? (
            <span>Podés pedir otro código en {cooldown} s</span>
          ) : (
            <button className="text-primary hover:underline" onClick={sendCode} disabled={busy}>Reenviar código</button>
          )}
          <p className="text-xs mt-2">¿No te llegó? Revisá spam o promociones.</p>
        </div>
      </div>
    );
  }

  const form = (
    <div className={cn("space-y-6 w-full", !withPreview && "max-w-lg mx-auto")}>
      <div className={showHeading && !withPreview ? "text-center" : "hidden"}>
        <Gift className="h-10 w-10 text-primary mx-auto mb-3" />
        <h1 className="font-serif text-3xl mb-2">{mode === "signup" ? "Creá tu tarjeta" : "Entrá a tu tarjeta"}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "signup"
            ? "Sumá visitas cada vez que te atendemos y ganá premios. Sin contraseñas."
            : "Te mandamos un código a tu email para entrar."}
        </p>
      </div>

      <form onSubmit={e => { e.preventDefault(); sendCode(); }}
        className={withPreview ? "rounded-2xl border border-border bg-card p-6 sm:p-8 space-y-4" : showHeading ? "luxury-card p-6 space-y-4" : "space-y-4"}>
        {withPreview && (
          <div className="pb-2">
            <h2 className="font-serif text-3xl sm:text-4xl">{mode === "signup" ? "Creá tu tarjeta" : "Entrá a tu tarjeta"}</h2>
            <p className="text-muted-foreground mt-1">{mode === "signup" ? "Completá tus datos para empezar." : "Te mandamos un código a tu email para entrar."}</p>
          </div>
        )}
        {mode === "signup" && (
          <div>
            <Label htmlFor="fn">Nombre</Label>
            <Input id="fn" autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={50} />
          </div>
        )}
        <div>
          <Label htmlFor="em">Email</Label>
          <Input id="em" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={255} />
          {mode === "signup" && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Si ya reservaste turno, usá el mismo email: así tus próximas visitas se suman solas.
            </p>
          )}
        </div>
        {mode === "signup" && (
          <>
            <WhatsappField value={whatsapp} onChange={setWhatsapp} />
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
          </>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <Button variant="gold" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? "Crear mi tarjeta" : "Enviarme el código"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signup" ? "¿Ya tenés tarjeta? " : "¿Todavía no tenés tarjeta? "}
        <button className="text-primary hover:underline" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); }}>
          {mode === "signup" ? "Entrá acá" : "Creala gratis"}
        </button>
      </p>
    </div>
  );

  if (!withPreview) return form;
  return <LoyaltySignupLayout name={firstName}>{form}</LoyaltySignupLayout>;
};

// =====================================================================
const NONE = "none";

export const BirthdayPicker = ({ day, month, onDay, onMonth, allowClear = true }: {
  day: string; month: string; onDay: (v: string) => void; onMonth: (v: string) => void; allowClear?: boolean;
}) => (
  <div className="grid grid-cols-[5rem_1fr] gap-2 mt-1.5">
    <Select value={day || NONE} onValueChange={v => onDay(v === NONE ? "" : v)}>
      <SelectTrigger aria-label="Día"><SelectValue placeholder="Día" /></SelectTrigger>
      <SelectContent className="max-h-64">
        {allowClear && <SelectItem value={NONE}>Día</SelectItem>}
        {Array.from({ length: 31 }, (_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}
      </SelectContent>
    </Select>
    <Select value={month || NONE} onValueChange={v => onMonth(v === NONE ? "" : v)}>
      <SelectTrigger aria-label="Mes"><SelectValue placeholder="Mes" /></SelectTrigger>
      <SelectContent className="max-h-64">
        {allowClear && <SelectItem value={NONE}>Mes</SelectItem>}
        {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export const WhatsappField = ({ value, onChange, id = "wa" }: { value: string; onChange: (v: string) => void; id?: string }) => (
  <div>
    <Label htmlFor={id}>WhatsApp <span className="text-muted-foreground font-normal">(opcional)</span></Label>
    <Input
      id={id} type="tel" inputMode="tel" autoComplete="tel" value={value} maxLength={25}
      onChange={e => onChange(e.target.value)} placeholder="+54 9 297 412 3456"
    />
    <p className="text-[11px] text-muted-foreground mt-1">Con código de área. Solo te escribimos si marcás la casilla de WhatsApp.</p>
  </div>
);

export const ErrorText = ({ children }: { children: React.ReactNode }) => (
  <p role="alert" className="text-sm text-destructive flex items-start gap-1.5">
    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> {children}
  </p>
);

// Aceptación de las condiciones de la tarjeta (obligatoria, separada de las promociones)
export const TermsCheckbox = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-start gap-3 text-sm cursor-pointer">
    <Checkbox checked={checked} onCheckedChange={v => onChange(v === true)} className="mt-0.5" />
    <span className="text-muted-foreground">
      Leí y acepto las{" "}
      <Link to="/terminos#tarjeta" target="_blank" className="text-primary hover:underline">condiciones de la tarjeta de fidelidad</Link>.
    </span>
  </label>
);

export const SignupPrivacyNotice = () => (
  <p className="text-xs text-muted-foreground leading-relaxed">
    Usamos tu nombre y email para administrar la tarjeta. El cumpleaños y el WhatsApp son opcionales.
    Las dos casillas de promociones también: tu tarjeta funciona igual y podés darte de baja cuando quieras.
    Más información en la <Link to="/privacidad" target="_blank" className="text-primary hover:underline">política de privacidad</Link>.
  </p>
);
