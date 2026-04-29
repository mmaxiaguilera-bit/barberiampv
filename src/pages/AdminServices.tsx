import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Service, formatPrice } from "@/lib/booking";
import { Plus, Pencil, Loader2, Scissors, Clock } from "lucide-react";
import { toast } from "sonner";

const AdminServices = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("services").select("*").order("display_order").order("name");
    setServices(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <PanelLayout requireRole="admin">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl">Servicios</h1>
          <p className="text-sm text-muted-foreground">Catálogo y precios</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="gold" size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> Nuevo
            </Button>
          </DialogTrigger>
          <ServiceDialog editing={editing} onClose={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : services.length === 0 ? (
        <div className="luxury-card p-10 text-center text-muted-foreground">
          <Scissors className="h-8 w-8 mx-auto mb-3 opacity-40" />
          Aún no hay servicios. Creá el primero.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {services.map(s => (
            <div key={s.id} className="luxury-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{s.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.description || "Sin descripción"}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <span className="font-serif text-lg text-primary">{formatPrice(Number(s.price))}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {s.duration_minutes} min
                </span>
              </div>
              {!s.active && <div className="mt-2 text-[10px] uppercase tracking-wider text-destructive">Inactivo</div>}
            </div>
          ))}
        </div>
      )}
    </PanelLayout>
  );
};

const ServiceDialog = ({ editing, onClose }: { editing: Service | null; onClose: () => void }) => {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [price, setPrice] = useState<string>(String(editing?.price ?? "0"));
  const [duration, setDuration] = useState<string>(String(editing?.duration_minutes ?? "45"));
  const [active, setActive] = useState(editing?.active ?? true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setPrice(String(editing?.price ?? "0"));
    setDuration(String(editing?.duration_minutes ?? "45"));
    setActive(editing?.active ?? true);
  }, [editing]);

  const save = async () => {
    if (!name.trim()) return toast.error("Nombre requerido");
    const p = Number(price), d = Number(duration);
    if (!Number.isFinite(p) || p < 0) return toast.error("Precio inválido");
    if (!Number.isFinite(d) || d < 5) return toast.error("Duración mínima 5 min");
    setBusy(true);
    const payload = { name: name.trim(), description: description.trim() || null, price: p, duration_minutes: Math.round(d), active };
    const { error } = editing
      ? await supabase.from("services").update(payload).eq("id", editing.id)
      : await supabase.from("services").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Actualizado" : "Creado");
    onClose();
  };

  const remove = async () => {
    if (!editing || !confirm("¿Eliminar este servicio?")) return;
    const { error } = await supabase.from("services").delete().eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="font-serif text-2xl flex items-center gap-2">
          <Scissors className="h-5 w-5 text-primary" /> {editing ? "Editar servicio" : "Nuevo servicio"}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div><Label>Nombre</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
        <div><Label>Descripción</Label><Textarea value={description ?? ""} onChange={e => setDescription(e.target.value)} rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Precio</Label><Input type="number" min={0} step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></div>
          <div><Label>Duración (min)</Label><Input type="number" min={5} step="5" value={duration} onChange={e => setDuration(e.target.value)} /></div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-md bg-secondary/30 border border-border">
          <Label className="cursor-pointer">Activo</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <div className="flex gap-2">
          {editing && <Button variant="outline" onClick={remove} className="text-destructive hover:bg-destructive/10">Eliminar</Button>}
          <Button variant="gold" className="flex-1" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
};

export default AdminServices;
