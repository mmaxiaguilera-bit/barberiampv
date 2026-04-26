import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Barber } from "@/lib/booking";
import { Pencil, Plus, Loader2, User } from "lucide-react";
import { toast } from "sonner";

const AdminBarbers = () => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Barber | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("barbers").select("*").order("display_order");
    setBarbers(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setEditing(null); setOpen(true); };
  const startEdit = (b: Barber) => { setEditing(b); setOpen(true); };

  return (
    <PanelLayout requireRole="admin">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl">Barberos</h1>
          <p className="text-sm text-muted-foreground">Gestioná tu equipo</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="gold" size="sm" onClick={startNew}><Plus className="h-4 w-4" /> Nuevo</Button></DialogTrigger>
          <BarberDialog editing={editing} onClose={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {barbers.map(b => (
            <div key={b.id} className="luxury-card p-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-serif text-lg">{b.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{b.name}</h3>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{b.bio}</p>
                  {!b.active && <span className="inline-block mt-2 text-[10px] uppercase tracking-wider text-destructive">Inactivo</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelLayout>
  );
};

const BarberDialog = ({ editing, onClose }: { editing: Barber | null; onClose: () => void }) => {
  const [name, setName] = useState(editing?.name ?? "");
  const [bio, setBio] = useState(editing?.bio ?? "");
  const [active, setActive] = useState(editing?.active ?? true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(editing?.name ?? ""); setBio(editing?.bio ?? ""); setActive(editing?.active ?? true);
  }, [editing]);

  const save = async () => {
    if (!name.trim()) return toast.error("Nombre requerido");
    setBusy(true);
    const payload = { name: name.trim(), bio: bio.trim() || null, active };
    const { error } = editing
      ? await supabase.from("barbers").update(payload).eq("id", editing.id)
      : await supabase.from("barbers").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Actualizado" : "Creado");
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle className="font-serif text-2xl flex items-center gap-2"><User className="h-5 w-5 text-primary" />{editing ? "Editar barbero" : "Nuevo barbero"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Nombre</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
        <div><Label>Bio / Especialidad</Label><Textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} /></div>
        <div className="flex items-center justify-between p-3 rounded-md bg-secondary/30 border border-border">
          <Label className="cursor-pointer">Activo (visible para reservas)</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <Button variant="gold" className="w-full" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
        </Button>
      </div>
    </DialogContent>
  );
};

export default AdminBarbers;
