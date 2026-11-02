import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Database } from "@/integrations/supabase/types";
import { toISODate, formatPrice } from "@/lib/booking";
import { Info, Lock, Unlock } from "lucide-react";

type Appt = Database["public"]["Tables"]["appointments"]["Row"];

const AdminOverview = () => {
  const [stats, setStats] = useState({ today: 0, week: 0, completed: 0, cancelled: 0 });
  const [byDay, setByDay] = useState<{ date: string; count: number }[]>([]);
  const [money, setMoney] = useState({ todayIncome: 0, weekIncome: 0, todayExpenses: 0 });
  const [closure, setClosure] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const today = new Date();
      const start = new Date(today); start.setDate(today.getDate() - 6); start.setHours(0,0,0,0);
      const startISO = toISODate(start);
      const todayISO = toISODate(today);

      const [{ data: appts }, { data: pays }, { data: exps }, { data: cl }] = await Promise.all([
        supabase.from("appointments").select("appointment_date, status").gte("appointment_date", startISO),
        supabase.from("payments").select("payment_date, amount, tip").gte("payment_date", startISO),
        supabase.from("expenses").select("expense_date, amount").eq("expense_date", todayISO),
        supabase.from("cash_closures").select("*").eq("closure_date", todayISO).maybeSingle(),
      ]);

      const all = (appts ?? []) as Pick<Appt, "appointment_date" | "status">[];
      const todayCount = all.filter(a => a.appointment_date === todayISO && a.status !== "cancelado").length;
      const weekCount = all.filter(a => a.status !== "cancelado").length;
      const completed = all.filter(a => a.status === "atendido").length;
      const cancelled = all.filter(a => a.status === "cancelado").length;
      setStats({ today: todayCount, week: weekCount, completed, cancelled });

      const map: Record<string, number> = {};
      for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate()+i); map[toISODate(d)] = 0; }
      all.forEach(a => { if (a.status !== "cancelado" && map[a.appointment_date] !== undefined) map[a.appointment_date]++; });
      setByDay(Object.entries(map).map(([date, count]) => ({ date, count })));

      const todayIncome = (pays ?? []).filter(p => p.payment_date === todayISO).reduce((s, p) => s + Number(p.amount), 0);
      const weekIncome = (pays ?? []).reduce((s, p) => s + Number(p.amount), 0);
      const todayExpenses = (exps ?? []).reduce((s, e) => s + Number(e.amount), 0);
      setMoney({ todayIncome, weekIncome, todayExpenses });
      setClosure(cl);
    })();
  }, []);

  const max = Math.max(...byDay.map(d => d.count), 1);

  return (
    <PanelLayout requireRole="admin">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-5 mb-6 border-b border-border">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl">Resumen</h1>
          <p className="text-sm text-muted-foreground mt-1">Vista general de hoy y los últimos 7 días</p>
        </div>
        <Link
          to="/admin/caja"
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${closure ? "border-success/40 text-success" : "border-primary/40 text-primary"}`}
        >
          {closure ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />} Caja de hoy {closure ? "cerrada" : "abierta"}
        </Link>
      </div>

      <h2 className="text-xs uppercase tracking-[0.02em] text-muted-foreground mb-3">Dinero</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
        <Stat label="Hoy facturado" value={formatPrice(money.todayIncome)} hint="Cobros registrados hoy (sin propinas)" />
        <Stat label="Semana facturado" value={formatPrice(money.weekIncome)} hint="Cobros de los últimos 7 días (sin propinas)" />
        <Stat label="Gastos hoy" value={formatPrice(money.todayExpenses)} hint="Gastos cargados hoy en Caja" />
      </div>

      <h2 className="text-xs uppercase tracking-[0.02em] text-muted-foreground mb-3">Turnos</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <Stat label="Turnos hoy" value={stats.today} hint="Turnos de hoy, sin contar cancelados" />
        <Stat label="Últimos 7 días" value={stats.week} hint="Turnos de los últimos 7 días, sin contar cancelados" />
        <Stat label="Atendidos" value={stats.completed} hint="Turnos marcados como atendidos en los últimos 7 días" />
        <Stat label="Cancelados" value={stats.cancelled} hint="Turnos cancelados en los últimos 7 días" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-serif text-xl mb-5">Turnos por día</h2>
        <div className="flex items-end gap-2 sm:gap-3 h-44">
          {byDay.map(d => {
            const dt = new Date(d.date + "T00:00:00");
            const isToday = d.date === toISODate(new Date());
            return (
              <div key={d.date} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
                <div className={`text-xs ${isToday ? "text-primary" : "text-muted-foreground"}`}>{d.count}</div>
                <div
                  className={`w-full rounded-lg ${isToday ? "bg-gradient-to-t from-primary to-primary/70" : "bg-muted-foreground/25"}`}
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: 4 }}
                />
                <div className={` text-[10px] uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dt.toLocaleDateString("es-AR", { weekday: "short" })}</div>
              </div>
            );
          })}
        </div>
      </div>
    </PanelLayout>
  );
};

// Tarjeta de número: título dorado chico con ayuda al pasar el mouse y valor grande
const Stat = ({ label, value, hint }: { label: string; value: string | number; hint: string }) => (
  <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex items-center gap-1.5 text-xs text-primary" title={hint}>
      {label} <Info className="h-3.5 w-3.5 opacity-70" />
    </div>
    <div className="mt-3 text-2xl sm:text-3xl font-semibold tabular-nums truncate">{value}</div>
  </div>
);

export default AdminOverview;
