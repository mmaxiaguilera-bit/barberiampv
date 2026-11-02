import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loyaltyErrorMessage } from "@/lib/loyalty";
import { Loader2, Search, UserPlus, X, BadgeCheck } from "lucide-react";
import { toast } from "sonner";

export interface PickedClient { id: string; first_name: string; last_name: string | null; user_id?: string | null }

// Caracteres con significado en los filtros de PostgREST
const sanitize = (q: string) => q.replace(/[,()*%\\]/g, " ").trim();

export const ClientPicker = ({ value, onChange }: { value: PickedClient | null; onChange: (c: PickedClient | null) => void }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<(PickedClient & { phone: string | null; email: string | null })[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = sanitize(q);
    if (value || term.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from("clients")
        .select("id, first_name, last_name, phone, email, user_id")
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
        .order("first_name").limit(8);
      setResults(data ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, value]);

  const create = async () => {
    const parts = sanitize(q).split(/\s+/);
    setBusy(true);
    const { data, error } = await supabase.rpc("staff_create_client", {
      _first_name: parts[0] ?? "", _last_name: parts.slice(1).join(" ") || undefined,
      _phone: newPhone.trim() || undefined, _email: newEmail.trim() || undefined,
    });
    setBusy(false);
    if (error) return toast.error(loyaltyErrorMessage(error));
    onChange({ id: data, first_name: parts[0], last_name: parts.slice(1).join(" ") || null });
    setCreating(false); setQ(""); setNewPhone(""); setNewEmail("");
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
        <span className="truncate flex items-center gap-1.5">
          {value.user_id && <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />}
          {value.first_name} {value.last_name ?? ""}
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label="Quitar cliente" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={e => { setQ(e.target.value); setCreating(false); }} placeholder="Buscar por nombre, email o teléfono" className="pl-9" />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {results.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border max-h-48 overflow-y-auto">
          {results.map(c => (
            <button key={c.id} type="button" onClick={() => onChange(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50">
              <span className="flex items-center gap-1.5">
                {c.user_id && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}
                {c.first_name} {c.last_name ?? ""}
              </span>
              <span className="block text-xs text-muted-foreground truncate">{[c.phone, c.email].filter(Boolean).join(" · ") || "sin contacto"}</span>
            </button>
          ))}
        </div>
      )}
      {sanitize(q).length >= 2 && !searching && (
        creating ? (
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Nuevo cliente: <strong className="text-foreground">{sanitize(q)}</strong></p>
            <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Teléfono (opcional)" maxLength={25} />
            <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="Email (opcional)" maxLength={255} />
            <Button type="button" size="sm" variant="goldOutline" className="w-full" onClick={create} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear cliente"}
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
            <UserPlus className="h-3.5 w-3.5" /> Crear cliente "{sanitize(q)}"
          </button>
        )
      )}
    </div>
  );
};
