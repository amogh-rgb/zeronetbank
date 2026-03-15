import { Prisma } from '@prisma/client';

export type MoneyLike =
  | Prisma.Decimal
  | Prisma.DecimalJsLike
  | number
  | string
  | null
  | undefined;

export function toMoneyNumber(value: MoneyLike): number {
  if (value == null) return 0;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function toMoneyDecimal(value: MoneyLike): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value == null ? 0 : String(value));
}
