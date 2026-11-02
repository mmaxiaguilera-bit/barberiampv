import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Database } from "@/integrations/supabase/types";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_PORTFOLIO_PHOTOS, deletePortfolioPhoto, portfolioUrl, removeProfilePhoto, setProfilePhoto, uploadPortfolioPhoto } from "@/lib/portfolio";
import { ImagePlus, Loader2, Trash2, ExternalLink, Images, Camera } from "lucide-react";
import { toast } from "sonner";

type Photo = Database["public"]["Tables"]["barber_portfolio"]["Row"];

// Carga y borrado de "Mis mejores cortes" (máximo 6): el barbero administra las suyas desde su panel
// y el admin las de cualquier barbero desde Admin → Barberos (asAdmin)
export const PortfolioManager = ({ barberId, barberName, slug, asAdmin = false }: {
  barberId: string; barberName: string; slug: string | null; asAdmin?: boolean;
}) => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: b }] = await Promise.all([
      supabase.from("barber_portfolio").select("*").eq("barber_id", barberId)
        .order("display_order").order("created_at", { ascending: false }),
      supabase.from("barbers").select("photo_url").eq("id", barberId).single(),
    ]);
    setPhotos(data ?? []);
    setProfileUrl(b?.photo_url ?? null);
    setLoading(false);
  }, [barberId]);

  const changeProfile = async (file: File | undefined) => {
    if (!file) return;
    setProfileBusy(true);
    try { setProfileUrl(await setProfilePhoto(barberId, file, profileUrl)); toast.success("Foto de perfil actualizada"); }
    catch (e) { toast.error((e as Error).message); }
    setProfileBusy(false);
    if (profileRef.current) profileRef.current.value = "";
  };

  const clearProfile = async () => {
    if (!confirm(asAdmin ? `¿Quitar la foto de perfil de ${barberName}?` : "¿Quitar tu foto de perfil?")) return;
    setProfileBusy(true);
    try { await removeProfilePhoto(barberId, profileUrl); setProfileUrl(null); toast.success("Foto de perfil quitada"); }
    catch (e) { toast.error((e as Error).message); }
    setProfileBusy(false);
  };

  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const free = MAX_PORTFOLIO_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, Math.max(free, 0));
    if (list.length < files.length) toast.warning(`Máximo ${MAX_PORTFOLIO_PHOTOS} fotos: se suben solo ${list.length}. Borrá alguna para agregar otras.`);
    if (!list.length) { if (inputRef.current) inputRef.current.value = ""; return; }
    setUploading({ done: 0, total: list.length });
    let failed = 0;
    for (const [i, f] of list.entries()) {
      try { await uploadPortfolioPhoto(barberId, f, user?.id); }
      catch (e) { failed++; toast.error(`${f.name}: ${(e as Error).message}`); }
      setUploading({ done: i + 1, total: list.length });
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
    if (failed < list.length) toast.success(`${list.length - failed} foto${list.length - failed !== 1 ? "s" : ""} agregada${list.length - failed !== 1 ? "s" : ""}`);
    load();
  };

  const saveCaption = async (p: Photo, caption: string) => {
    if ((p.caption ?? "") === caption.trim()) return;
    const { error } = await supabase.from("barber_portfolio").update({ caption: caption.trim() || null }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Descripción guardada");
    load();
  };

  const remove = async (p: Photo) => {
    if (!confirm("¿Borrar esta foto?")) return;
    setDeleting(p.id);
    try { await deletePortfolioPhoto(p.id, p.image_path); toast.success("Foto borrada"); }
    catch (e) { toast.error((e as Error).message); }
    setDeleting(null);
    load();
  };

  return (
    <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl">
      <DialogHeader>
        <DialogTitle className="font-serif text-2xl flex items-center gap-2"><Images className="h-5 w-5 text-primary" /> {asAdmin ? `Fotos de ${barberName}` : "Mis mejores cortes"}</DialogTitle>
        <DialogDescription>
          {asAdmin
            ? `La foto de perfil y hasta ${MAX_PORTFOLIO_PHOTOS} cortes se muestran en la página pública de ${barberName}.`
            : `Tu foto de perfil y hasta ${MAX_PORTFOLIO_PHOTOS} cortes se muestran en tu página pública (${barberName}). Subí fotos reales tuyas.`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-4 rounded-lg border border-border p-3">
        <div className="w-16 h-16 rounded-full overflow-hidden border border-primary/40 bg-primary/10 flex items-center justify-center font-serif text-2xl text-primary flex-shrink-0">
          {profileUrl ? <img src={profileUrl} alt={asAdmin ? `Foto de perfil de ${barberName}` : "Tu foto de perfil"} className="w-full h-full object-cover" /> : barberName[0]}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-sm font-medium">Foto de perfil</p>
          <input ref={profileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => changeProfile(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="goldOutline" onClick={() => profileRef.current?.click()} disabled={profileBusy}>
              {profileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {profileUrl ? "Cambiar" : "Subir foto"}
            </Button>
            {profileUrl && <Button size="sm" variant="ghost" onClick={clearProfile} disabled={profileBusy}>Quitar</Button>}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => upload(e.target.files)} />
        <Button variant="gold" onClick={() => inputRef.current?.click()} disabled={!!uploading || loading || photos.length >= MAX_PORTFOLIO_PHOTOS} className="flex-1">
          {uploading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo {uploading.done}/{uploading.total}…</>
            : photos.length >= MAX_PORTFOLIO_PHOTOS
              ? <>Límite de {MAX_PORTFOLIO_PHOTOS} fotos alcanzado</>
              : <><ImagePlus className="h-4 w-4" /> Agregar fotos ({photos.length}/{MAX_PORTFOLIO_PHOTOS})</>}
        </Button>
        {slug && (
          <Button variant="outline" asChild className="flex-1">
            <Link to={`/barberos/${slug}`} target="_blank"><ExternalLink className="h-4 w-4" /> Ver página pública</Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : photos.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Todavía no hay fotos. Agregá las primeras para que los clientes vean sus trabajos.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map(p => (
            <div key={p.id} className="space-y-1.5">
              <div className="relative aspect-[4/5] rounded-lg overflow-hidden border border-border bg-secondary/30">
                <img src={portfolioUrl(p.image_path)} alt={p.caption ?? "Corte"} loading="lazy" className="w-full h-full object-cover" />
                <button
                  onClick={() => remove(p)} disabled={deleting === p.id} aria-label="Borrar foto"
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-background/80 text-destructive hover:bg-background"
                >
                  {deleting === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
              <Input
                defaultValue={p.caption ?? ""} placeholder="Descripción (opcional)" maxLength={120} className="h-8 text-xs"
                onBlur={e => saveCaption(p, e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          ))}
        </div>
      )}
    </DialogContent>
  );
};
