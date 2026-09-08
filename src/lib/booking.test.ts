import { describe, it, expect, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { getAvailableSlots, getDayAgenda, type Schedule } from "@/lib/booking";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const BARBER_ID = "barber-1";

// Pick a fixed future date so "isToday" filtering never interferes,
// and derive day_of_week from it so the schedule always matches.
const DATE = new Date(2026, 8, 10); // 2026-09-10
const DOW = DATE.getDay();

const schedule: Schedule = {
  id: "sched-1",
  barber_id: BARBER_ID,
  day_of_week: DOW,
  start_time: "10:00:00",
  end_time: "13:00:00",
  slot_minutes: 20,
  active: true,
};

describe("getAvailableSlots", () => {
  it("blocks every slot inside a 60-minute appointment's real duration, not just its start time", async () => {
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "get_taken_slots") {
        return Promise.resolve({
          data: [{ appointment_time: "10:00:00", duration_minutes: 60 }],
          error: null,
        }) as any;
      }
      if (fn === "get_blocked_ranges") {
        return Promise.resolve({ data: [], error: null }) as any;
      }
      throw new Error(`unexpected rpc: ${fn}`);
    });

    const slots = await getAvailableSlots(BARBER_ID, DATE, [schedule]);

    // Corte + barba, 10:00-11:00 (60 min) should block 10:00 AND 10:40.
    expect(slots).not.toContain("10:00:00");
    expect(slots).not.toContain("10:40:00");
    // The next slot after the occupied interval must be free.
    expect(slots).toContain("11:00:00");
  });

  it("still allows booking the very next 40-minute slot after a 40-minute service", async () => {
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "get_taken_slots") {
        return Promise.resolve({
          data: [{ appointment_time: "10:00:00", duration_minutes: 40 }],
          error: null,
        }) as any;
      }
      if (fn === "get_blocked_ranges") {
        return Promise.resolve({ data: [], error: null }) as any;
      }
      throw new Error(`unexpected rpc: ${fn}`);
    });

    const slots = await getAvailableSlots(BARBER_ID, DATE, [schedule]);

    expect(slots).not.toContain("10:00:00");
    expect(slots).not.toContain("10:20:00");
    expect(slots).toContain("10:40:00");
  });
});

describe("getAvailableSlots ordering", () => {
  it("returns slots sorted chronologically even when the barber has split shifts stored out of order", async () => {
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "get_taken_slots") return Promise.resolve({ data: [], error: null }) as any;
      if (fn === "get_blocked_ranges") return Promise.resolve({ data: [], error: null }) as any;
      throw new Error(`unexpected rpc: ${fn}`);
    });

    // Split shifts returned from the DB out of chronological order,
    // as they would be if not explicitly sorted (e.g. by insertion order).
    const afternoon: Schedule = { ...schedule, id: "sched-pm", start_time: "17:00:00", end_time: "20:00:00" };
    const morning: Schedule = { ...schedule, id: "sched-am", start_time: "10:00:00", end_time: "12:00:00" };

    const slots = await getAvailableSlots(BARBER_ID, DATE, [afternoon, morning]);

    const sorted = [...slots].sort();
    expect(slots).toEqual(sorted);
  });
});

describe("getAvailableSlots with a service duration longer than the schedule's grid interval", () => {
  const grid40: Schedule = { ...schedule, start_time: "10:00:00", end_time: "14:00:00", slot_minutes: 40 };

  it("offers the exact moment the barber frees up, not just the next 40-minute grid point", async () => {
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "get_taken_slots") {
        return Promise.resolve({
          data: [{ appointment_time: "10:00:00", duration_minutes: 60 }],
          error: null,
        }) as any;
      }
      if (fn === "get_blocked_ranges") return Promise.resolve({ data: [], error: null }) as any;
      throw new Error(`unexpected rpc: ${fn}`);
    });

    // Someone booking another 60-minute "Corte + barba" should be able to
    // start right at 11:00, when the barber actually becomes free, instead
    // of waiting for 11:20 (the next point on the 40-minute grid).
    const slots = await getAvailableSlots(BARBER_ID, DATE, [grid40], 60);

    expect(slots).not.toContain("10:00:00");
    expect(slots).not.toContain("10:40:00");
    expect(slots).toContain("11:00:00");
  });

  it("keeps the plain 40-minute grid for a normal-duration service when nothing is booked", async () => {
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "get_taken_slots") return Promise.resolve({ data: [], error: null }) as any;
      if (fn === "get_blocked_ranges") return Promise.resolve({ data: [], error: null }) as any;
      throw new Error(`unexpected rpc: ${fn}`);
    });

    const slots = await getAvailableSlots(BARBER_ID, DATE, [grid40], 40);

    expect(slots).toEqual(["10:00:00", "10:40:00", "11:20:00", "12:00:00", "12:40:00", "13:20:00"]);
  });
});

describe("getDayAgenda", () => {
  it("marks every slot inside a 60-minute appointment as taken, not just its start time", async () => {
    vi.mocked(supabase.rpc).mockImplementation((fn: string) => {
      if (fn === "get_blocked_ranges") {
        return Promise.resolve({ data: [], error: null }) as any;
      }
      throw new Error(`unexpected rpc: ${fn}`);
    });

    const appointments = [
      { id: "appt-1", appointment_time: "10:00:00", status: "pendiente", service_duration_minutes: 60 },
    ];

    const { slots } = await getDayAgenda(BARBER_ID, DATE, [schedule], appointments);
    const byTime = Object.fromEntries(slots.map(s => [s.time, s]));

    expect(byTime["10:00"].status).toBe("taken");
    expect(byTime["10:20"].status).toBe("taken");
    expect(byTime["10:40"].status).toBe("taken");
    expect(byTime["11:00"].status).toBe("available");
  });
});
