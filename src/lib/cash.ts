import { Database } from "@/integrations/supabase/types";

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type ExpenseCategory = Database["public"]["Enums"]["expense_category"];

export const PAYMENT_METHODS: PaymentMethod[] = ["efectivo", "transferencia", "tarjeta", "mercadopago", "otro"];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["insumos", "sueldos", "alquiler", "servicios", "otros"];

export const paymentMethodLabel = (m: PaymentMethod): string => ({
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  mercadopago: "MercadoPago",
  otro: "Otro",
}[m]);

export const expenseCategoryLabel = (c: ExpenseCategory): string => ({
  insumos: "Insumos",
  sueldos: "Sueldos",
  alquiler: "Alquiler",
  servicios: "Servicios",
  otros: "Otros",
}[c]);

export const paymentMethodIcon = (m: PaymentMethod): string => ({
  efectivo: "💵",
  transferencia: "🏦",
  tarjeta: "💳",
  mercadopago: "📱",
  otro: "•",
}[m]);
