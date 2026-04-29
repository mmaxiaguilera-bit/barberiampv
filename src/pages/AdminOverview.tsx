import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Database } from "@/integrations/supabase/types";
import { toISODate, formatPrice } from "@/lib/booking";
import { CalendarCheck, CheckCircle2, XCircle, TrendingUp, Wallet, Lock, Unlock, DollarSign } from "lucide-react";

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
      <h1 className="font-serif text-2xl sm:text-3xl mb-1">Resumen</h1>
      <p className="text-sm text-muted-foreground mb-6">Vista general de los últimos 7 días</p>

      {/* Money row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat icon={DollarSign} label="Hoy facturado" value={formatPrice(money.todayIncome)} color="text-success" />
        <Stat icon={TrendingUp} label="Semana facturado" value={formatPrice(money.weekIncome)} color="text-primary" />
        <Stat icon={Wallet} label="Gastos hoy" value={formatPrice(money.todayExpenses)} color="text-destructive" />
        <Link to="/admin/caja" className="block">
          <div className={`luxury-card p-4 hover:border-primary/40 transition-colors ${closure ? "border-success/30" : ""}`}>
            {closure ? <Lock className="h-5 w-5 text-success mb-2" /> : <Unlock className="h-5 w-5 text-primary mb-2" />}
            <div className="font-serif text-lg">{closure ? "Cerrada" : "Abierta"}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Caja de hoy</div>
          </div>
        </Link>
      </div>

      {/* Appointments row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat icon={CalendarCheck} label="Turnos hoy" value={stats.today} color="text-primary" />
        <Stat icon={TrendingUp} label="Últimos 7 días" value={stats.week} color="text-info" />
        <Stat icon={CheckCircle2} label="Atendidos" value={stats.completed} color="text-success" />
        <Stat icon={XCircle} label="Cancelados" value={stats.cancelled} color="text-destructive" />
      </div>

      <div className="luxury-card p-5">
        <h2 className="font-serif text-lg mb-4">Turnos por día</h2>
        <div className="flex items-end gap-2 h-40">
          {byDay.map(d => {
            const dt = new Date(d.date + "T00:00:00");
            const isToday = d.date === toISODate(new Date());
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="text-xs text-muted-foreground">{d.count}</div>
                <div className="w-full bg-secondary rounded-t-sm relative" style={{ height: `${(d.count / max) * 100}%`, minHeight: 4 }}>
                  <div className={`absolute inset-0 rounded-t-sm ${isToday ? "bg-gradient-to-t from-primary to-primary/70" : "bg-muted-foreground/40"}`} />
                </div>
                <div className="text-[10px] text-muted-foreground uppercase">{dt.toLocaleDateString("es-AR", { weekday: "short" })}</div>
              </div>
            );
          })}
        </div>
      </div>
    </PanelLayout>
  );
};

const Stat = ({ icon: Icon, label, value, color }: any) => (
  <div className="luxury-card p-4">
    <Icon className={`h-5 w-5 ${color} mb-3`} />
    <div className="text-2xl font-serif">{value}</div>
    <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
  </div>
);

export default AdminOverview;
