import { supabase } from "@/integrations/supabase/client";

export type Barber = { id: string; name: string; bio: string | null; photo_url: string | null; active: boolean; display_order: number };
export type Service = { id: string; name: string; description: string | null; duration_minutes: number; price: number; active: boolean };
export type Schedule = { id: string; barber_id: string; day_of_week: number; start_time: string; end_time: string; slot_minutes: number; active: boolean };

export const DAYS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
export const DAYS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

export const formatPrice = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

export const formatTime = (t: string) => t.slice(0, 5);

export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const minutesToTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

export const generateSlots = (schedule: Schedule): string[] => {
  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  const slots: string[] = [];
  for (let m = start; m + schedule.slot_minutes <= end; m += schedule.slot_minutes) {
    slots.push(minutesToTime(m));
  }
  return slots;
};

export const getAvailableSlots = async (
  barberId: string,
  date: Date,
  schedules: Schedule[]
): Promise<string[]> => {
  const dow = date.getDay();
  const daySchedules = schedules.filter(s => s.barber_id === barberId && s.day_of_week === dow && s.active);
  if (daySchedules.length === 0) return [];
  const allSlots = daySchedules.flatMap(generateSlots);
  const slotMinutes = daySchedules[0].slot_minutes;

  const isoDate = toISODate(date);
  const [{ data: taken }, { data: blocks }] = await Promise.all([
    supabase.rpc("get_taken_slots", { _barber_id: barberId, _date: isoDate }),
    supabase.rpc("get_blocked_ranges", { _barber_id: barberId, _date: isoDate }),
  ]);
  const takenSet = new Set((taken ?? []).map((r: any) => r.appointment_time.slice(0, 5)));
  const blockRanges = (blocks ?? []) as { start_time: string | null; end_time: string | null; full_day: boolean }[];
  const hasFullDayBlock = blockRanges.some(b => b.full_day);
  if (hasFullDayBlock) return [];

  const blockedMinuteRanges = blockRanges
    .filter(b => !b.full_day && b.start_time && b.end_time)
    .map(b => [timeToMinutes(b.start_time as string), timeToMinutes(b.end_time as string)] as const);

  const now = new Date();
  const isToday = isoDate === toISODate(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  return allSlots.filter(s => {
    const hhmm = s.slice(0, 5);
    if (takenSet.has(hhmm)) return false;
    const slotStart = timeToMinutes(s);
    const slotEnd = slotStart + slotMinutes;
    for (const [bs, be] of blockedMinuteRanges) {
      if (slotStart < be && slotEnd > bs) return false;
    }
    if (isToday && slotStart <= nowMins) return false;
    return true;
  });
};

/**
 * Returns the full day "agenda" for a barber: a row per slot, marking
 * status as taken/blocked/available, and the global open range.
 */
export type DaySlot = {
  time: string; // HH:MM
  status: "available" | "taken" | "blocked" | "closed";
  appointmentId?: string;
  blockId?: string;
  reason?: string;
};

export const getDayAgenda = async (
  barberId: string,
  date: Date,
  schedules: Schedule[],
  appointments: { id: string; appointment_time: string; status: string }[],
): Promise<{ slots: DaySlot[]; openStart: string; openEnd: string; slotMinutes: number; closed: boolean }> => {
  const dow = date.getDay();
  const daySchedules = schedules
    .filter(s => s.barber_id === barberId && s.day_of_week === dow && s.active)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  if (daySchedules.length === 0) {
    return { slots: [], openStart: "10:00", openEnd: "20:00", slotMinutes: 40, closed: true };
  }

  const slotMinutes = daySchedules[0].slot_minutes;
  const openStart = daySchedules[0].start_time.slice(0, 5);
  const openEnd = daySchedules[daySchedules.length - 1].end_time.slice(0, 5);

  // Build minute set of "open" slot starts from schedules
  const openSlotStarts = new Set<number>();
  for (const sch of daySchedules) {
    for (const t of generateSlots(sch)) openSlotStarts.add(timeToMinutes(t));
  }

  // Fetch blocks
  const isoDate = toISODate(date);
  const { data: blocks } = await supabase.rpc("get_blocked_ranges", { _barber_id: barberId, _date: isoDate });
  const blockRanges = (blocks ?? []) as { start_time: string | null; end_time: string | null; full_day: boolean }[];
  const fullDayBlocked = blockRanges.some(b => b.full_day);
  const blockedMinuteRanges = blockRanges
    .filter(b => !b.full_day && b.start_time && b.end_time)
    .map(b => [timeToMinutes(b.start_time as string), timeToMinutes(b.end_time as string)] as const);

  const apptMap = new Map<string, { id: string; status: string }>();
  for (const a of appointments) {
    if (a.status === "cancelado") continue;
    apptMap.set(a.appointment_time.slice(0, 5), { id: a.id, status: a.status });
  }

  // Build a continuous grid from openStart to openEnd
  const startM = timeToMinutes(daySchedules[0].start_time);
  const endM = timeToMinutes(daySchedules[daySchedules.length - 1].end_time);

  const slots: DaySlot[] = [];
  for (let m = startM; m + slotMinutes <= endM; m += slotMinutes) {
    const hhmm = minutesToTime(m).slice(0, 5);
    const isOpen = openSlotStarts.has(m);
    const appt = apptMap.get(hhmm);
    const slotEnd = m + slotMinutes;
    const isBlocked = fullDayBlocked || blockedMinuteRanges.some(([bs, be]) => m < be && slotEnd > bs);

    if (appt) slots.push({ time: hhmm, status: "taken", appointmentId: appt.id });
    else if (isBlocked) slots.push({ time: hhmm, status: "blocked" });
    else if (!isOpen) slots.push({ time: hhmm, status: "closed" });
    else slots.push({ time: hhmm, status: "available" });
  }

  return { slots, openStart, openEnd, slotMinutes, closed: fullDayBlocked };
};
