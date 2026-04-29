import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Database } from "@/integrations/supabase/types";
import { formatPrice } from "@/lib/booking";
import { paymentMethodLabel, PAYMENT_METHODS } from "@/lib/cash";
import { BarChart3, Download, Loader2, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";

type Payment = Database["public"]["Tables"]["payments"]["Row"] & { barbers?: { name: string } | null };
type Expense = Database["public"]["Tables"]["expenses"]["Row"];

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
};

const AdminReports = () => {
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const [y, mo] = month.split("-").map(Number);
    const start = `${month}-01`;
    const end = new Date(y, mo, 0); // last day
    const endIso = `${month}-${String(end.getDate()).padStart(2, "0")}`;
    return { start, end: endIso, days: end.getDate() };
  }, [month]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from("payments").select("*, barbers(name)").gte("payment_date", range.start).lte("payment_date", range.end).order("payment_date"),
      supabase.from("expenses").select("*").gte("expense_date", range.start).lte("expense_date", range.end),
    ]);
    setPayments((p ?? []) as Payment[]);
    setExpenses((e ?? []) as Expense[]);
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const income = payments.reduce((s, p) => s + Number(p.amount), 0);
    const tips = payments.reduce((s, p) => s + Number(p.tip), 0);
    const exp = expenses.reduce((s, e) => s + Number(e.amount), 0);

    const byService: Record<string, { count: number; amount: number }> = {};
    payments.forEach(p => {
      byService[p.service_name] ??= { count: 0, amount: 0 };
      byService[p.service_name].count++;
      byService[p.service_name].amount += Number(p.amount);
    });
    const topServices = Object.entries(byService).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

    const byBarber: Record<string, { count: number; amount: number }> = {};
    payments.forEach(p => {
      const name = p.barbers?.name ?? "—";
      byBarber[name] ??= { count: 0, amount: 0 };
      byBarber[name].count++;
      byBarber[name].amount += Number(p.amount);
    });
    const topBarbers = Object.entries(byBarber).sort((a, b) => b[1].amount - a[1].amount);

    const byMethod: Record<string, number> = {};
    PAYMENT_METHODS.forEach(m => { byMethod[m] = 0; });
    payments.forEach(p => { byMethod[p.payment_method] += Number(p.amount) + Number(p.tip); });

    const byDay: Record<string, number> = {};
    for (let d = 1; d <= range.days; d++) {
      const k = `${month}-${String(d).padStart(2, "0")}`;
      byDay[k] = 0;
    }
    payments.forEach(p => { byDay[p.payment_date] = (byDay[p.payment_date] ?? 0) + Number(p.amount); });

    return { income, tips, exp, net: income - exp, topServices, topBarbers, byMethod, byDay };
  }, [payments, expenses, month, range.days]);

  const exportCSV = () => {
    const rows = [
      ["Fecha", "Hora", "Cliente", "Servicio", "Barbero", "Método", "Monto", "Propina"],
      ...payments.map(p => [
        p.payment_date,
        new Date(p.paid_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
        p.client_name ?? "",
        p.service_name,
        p.barbers?.name ?? "",
        paymentMethodLabel(p.payment_method),
        String(Number(p.amount).toFixed(2)),
        String(Number(p.tip).toFixed(2)),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `reporte-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  const maxDay = Math.max(...Object.values(totals.byDay), 1);

  return (
    <PanelLayout requireRole="admin">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Reportes</h1>
          <p className="text-sm text-muted-foreground capitalize">{monthLabel(month)}</p>
        </div>
        <div className="flex gap-2">
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-[170px]" />
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4" /> CSV</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Stat icon={TrendingUp} label="Facturado" value={formatPrice(totals.income)} color="text-success" />
            <Stat icon={Wallet} label="Propinas" value={formatPrice(totals.tips)} color="text-primary" />
            <Stat icon={TrendingDown} label="Gastos" value={formatPrice(totals.exp)} color="text-destructive" />
            <Stat icon={Wallet} label="Ganancia neta" value={formatPrice(totals.net)} color="text-info" highlight />
          </div>

          <div className="luxury-card p-4 mb-6">
            <h3 className="font-serif text-lg mb-4">Ingresos por día</h3>
            <div className="flex items-end gap-1 h-32 overflow-x-auto">
              {Object.entries(totals.byDay).map(([d, v]) => {
                const day = Number(d.split("-")[2]);
                return (
                  <div key={d} className="flex flex-col items-center gap-1 min-w-[18px]">
                    <div className="w-full bg-secondary/40 rounded-t" style={{ height: `${(v / maxDay) * 100}%`, minHeight: 2 }}>
                      <div className="w-full h-full rounded-t bg-gradient-to-t from-primary to-primary/60" />
                    </div>
                    <div className="text-[9px] text-muted-foreground">{day}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <div className="luxury-card p-4">
              <h3 className="font-serif text-lg mb-3">Top servicios</h3>
              {totals.topServices.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos</p> : (
                <ul className="space-y-2">
                  {totals.topServices.map(([name, s]) => (
                    <li key={name} className="flex justify-between p-2 rounded bg-secondary/30 border border-border">
                      <span className="text-sm">{name} <span className="text-xs text-muted-foreground">({s.count})</span></span>
                      <span className="font-serif text-primary">{formatPrice(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="luxury-card p-4">
              <h3 className="font-serif text-lg mb-3">Ranking de barberos</h3>
              {totals.topBarbers.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos</p> : (
                <ul className="space-y-2">
                  {totals.topBarbers.map(([name, s]) => (
                    <li key={name} className="flex justify-between p-2 rounded bg-secondary/30 border border-border">
                      <span className="text-sm">{name} <span className="text-xs text-muted-foreground">({s.count})</span></span>
                      <span className="font-serif text-primary">{formatPrice(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="luxury-card p-4">
            <h3 className="font-serif text-lg mb-3">Por método de pago</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PAYMENT_METHODS.map(m => (
                <div key={m} className="p-3 rounded bg-secondary/30 border border-border">
                  <div className="text-xs text-muted-foreground">{paymentMethodLabel(m)}</div>
                  <div className="font-serif text-lg">{formatPrice(totals.byMethod[m])}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </PanelLayout>
  );
};

const Stat = ({ icon: Icon, label, value, color, highlight }: any) => (
  <div className={`luxury-card p-4 ${highlight ? "border-primary/40" : ""}`}>
    <Icon className={`h-5 w-5 ${color} mb-2`} />
    <div className="font-serif text-xl">{value}</div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
  </div>
);

export default AdminReports;
