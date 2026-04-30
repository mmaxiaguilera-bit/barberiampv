import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { ArrowLeft, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});
type Creds = { email: string; password: string };

const Auth = () => {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (user) return <Navigate to={role === "admin" ? "/admin" : "/panel"} replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data as Creds);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("¡Bienvenido!");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      ...(parsed.data as Creds),
      options: {
        emailRedirectTo: `${window.location.origin}/panel`,
        data: { full_name: name },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Cuenta creada. Verificá tu email.");
  };

  const handleGoogle = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/panel` },
    });
    if (error) { setBusy(false); toast.error(error.message); }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="container px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4"><Logo size={56} /></div>
            <h1 className="font-serif text-3xl mb-1">Acceso staff</h1>
            <p className="text-sm text-muted-foreground">Solo para barberos y administración</p>
          </div>
          <div className="luxury-card p-6">
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div><Label htmlFor="e1">Email</Label><Input id="e1" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                  <div>
                    <Label htmlFor="p1">Contraseña</Label>
                    <div className="relative">
                      <Input id="p1" type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} className="pr-10" />
                      <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button variant="gold" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div><Label htmlFor="n2">Nombre</Label><Input id="n2" value={name} onChange={e => setName(e.target.value)} /></div>
                  <div><Label htmlFor="e2">Email</Label><Input id="e2" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                  <div>
                    <Label htmlFor="p2">Contraseña</Label>
                    <div className="relative">
                      <Input id="p2" type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} className="pr-10" />
                      <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button variant="gold" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrarme"}</Button>
                </form>
              </TabsContent>
            </Tabs>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">o</span></div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.5-1.71 4.4-5.27 4.4-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.43l2.53-2.43C16.84 4.1 14.71 3 12.18 3 6.99 3 2.8 7.18 2.8 12.36s4.19 9.36 9.38 9.36c5.41 0 9-3.8 9-9.16 0-.62-.07-1.09-.13-1.46z"/></svg>
              Continuar con Google
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-6">
              ¿Sos cliente? Reservá tu turno desde la <a href="/" className="text-primary hover:underline">página principal</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
