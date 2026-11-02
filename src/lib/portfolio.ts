import { supabase } from "@/integrations/supabase/client";

export const PORTFOLIO_BUCKET = "barber-portfolio";
const MAX_SIDE = 1600;
const PROFILE_SIDE = 600;
const QUALITY = 0.85;
export const MAX_PORTFOLIO_PHOTOS = 6;

export const portfolioUrl = (path: string) =>
  supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path).data.publicUrl;

// Las fotos del celular pesan varios MB: se achican y se pasan a JPEG antes de subir.
// square: recorta el centro en cuadrado (foto de perfil en círculo).
export const resizeImage = async (file: File, { maxSide = MAX_SIDE, square = false } = {}): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const [sx, sy, sw, sh] = square
    ? [(bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side]
    : [0, 0, bitmap.width, bitmap.height];
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", QUALITY),
  );
};

// Sube una foto a la carpeta del barbero y la registra en su portfolio
export const uploadPortfolioPhoto = async (barberId: string, file: File, userId: string | undefined) => {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} no es una imagen`);
  const blob = await resizeImage(file);
  const path = `${barberId}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage.from(PORTFOLIO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (upErr) throw upErr;
  const { error } = await supabase.from("barber_portfolio").insert({ barber_id: barberId, image_path: path, created_by: userId ?? null });
  if (error) {
    await supabase.storage.from(PORTFOLIO_BUCKET).remove([path]);
    throw error;
  }
};

export const deletePortfolioPhoto = async (id: string, path: string) => {
  const { error } = await supabase.from("barber_portfolio").delete().eq("id", id);
  if (error) throw error;
  await supabase.storage.from(PORTFOLIO_BUCKET).remove([path]);
};

// Ruta dentro del bucket a partir de la URL pública (para borrar la foto anterior)
const pathFromUrl = (url: string | null) => url?.split(`/object/public/${PORTFOLIO_BUCKET}/`)[1] ?? null;

// Foto de perfil del barbero (la cambia él mismo o un admin): sube, la asigna y borra la anterior
export const setProfilePhoto = async (barberId: string, file: File, currentUrl: string | null) => {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen");
  const blob = await resizeImage(file, { maxSide: PROFILE_SIDE, square: true });
  const path = `${barberId}/profile-${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage.from(PORTFOLIO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (upErr) throw upErr;
  const url = portfolioUrl(path);
  const { error } = await supabase.rpc("set_barber_photo", { _barber_id: barberId, _photo_url: url });
  if (error) {
    await supabase.storage.from(PORTFOLIO_BUCKET).remove([path]);
    throw error;
  }
  const old = pathFromUrl(currentUrl);
  if (old) await supabase.storage.from(PORTFOLIO_BUCKET).remove([old]);
  return url;
};

export const removeProfilePhoto = async (barberId: string, currentUrl: string | null) => {
  const { error } = await supabase.rpc("set_barber_photo", { _barber_id: barberId, _photo_url: null });
  if (error) throw error;
  const old = pathFromUrl(currentUrl);
  if (old) await supabase.storage.from(PORTFOLIO_BUCKET).remove([old]);
};
