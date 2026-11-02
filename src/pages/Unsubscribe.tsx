import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Loader2, MailX, AlertCircle } from "lucide-react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Baja de promociones desde el link de un email, sin iniciar sesión
const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "invalid" | "error">(UUID_RE.test(token) ? "idle" : "invalid");

  const confirm = async () => {
    setState("busy");
    const { data, error } = await supabase.rpc("unsubscribe_by_token", { _token: token });
    if (error) return setState("error");
    setState(data ? "done" : "invalid");
  };

  useEffect(() => { document.title = "Baja de promociones — MVP Barber"; }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container px-4 py-16 max-w-md mx-auto">
        <div className="luxury-card p-6 text-center space-y-4">
          {state === "done" ? (
            <>
              <MailX className="h-10 w-10 text-primary mx-auto" />
              <h1 className="font-serif text-2xl">Listo, te diste de baja</h1>
              <p className="text-sm text-muted-foreground">No vas a recibir más promociones por email. Tu tarjeta de fidelidad sigue funcionando igual.</p>
            </>
          ) : state === "invalid" ? (
            <>
              <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
              <h1 className="font-serif text-2xl">Enlace no válido</h1>
              <p className="text-sm text-muted-foreground">Podés darte de baja desde <Link to="/mi-tarjeta" className="text-primary hover:underline">tu tarjeta</Link> o escribiendo a contacto@barberiampv.com.</p>
            </>
          ) : (
            <>
              <MailX className="h-10 w-10 text-primary mx-auto" />
              <h1 className="font-serif text-2xl">Dejar de recibir promociones</h1>
              <p className="text-sm text-muted-foreground">Vas a dejar de recibir novedades y promociones de MVP Barber por email.</p>
              {state === "error" && <p className="text-sm text-destructive">No pudimos procesar la baja. Intentá de nuevo.</p>}
              <Button variant="gold" className="w-full" onClick={confirm} disabled={state === "busy"}>
                {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar baja"}
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Unsubscribe;
