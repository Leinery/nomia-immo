import { Router, type IRouter } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, propertiesTable, unitsTable, contractsTable, documentsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRentalOverviewResponse,
  GetIncomeByMonthResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [propCount] = await db.select({ count: count() }).from(propertiesTable);
  const [unitCount] = await db.select({ count: count() }).from(unitsTable);
  const [occupiedCount] = await db
    .select({ count: count() })
    .from(unitsTable)
    .where(eq(unitsTable.status, "occupied"));
  const [vacantCount] = await db
    .select({ count: count() })
    .from(unitsTable)
    .where(eq(unitsTable.status, "vacant"));
  const [docCount] = await db.select({ count: count() }).from(documentsTable);
  const [activeContractCount] = await db
    .select({ count: count() })
    .from(contractsTable)
    .where(eq(contractsTable.status, "active"));

  // Monthly income from active contracts
  const incomeResult = await db
    .select({ total: sql<string>`COALESCE(SUM(monthly_rent), 0)` })
    .from(contractsTable)
    .where(eq(contractsTable.status, "active"));

  const totalUnits = unitCount.count;
  const occupiedUnits = occupiedCount.count;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100 * 10) / 10 : 0;

  const summary = {
    totalProperties: propCount.count,
    totalUnits,
    occupiedUnits,
    vacantUnits: vacantCount.count,
    monthlyIncome: parseFloat(incomeResult[0].total),
    totalDocuments: docCount.count,
    activeContracts: activeContractCount.count,
    occupancyRate,
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/rental-overview", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      propertyId: propertiesTable.id,
      propertyName: propertiesTable.name,
      unitId: unitsTable.id,
      unitName: unitsTable.name,
      status: unitsTable.status,
      monthlyRent: unitsTable.monthlyRent,
    })
    .from(unitsTable)
    .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
    .orderBy(propertiesTable.name, unitsTable.name);

  // For each occupied unit, find the active contract and tenant name
  const activeContracts = await db
    .select()
    .from(contractsTable)
    .where(eq(contractsTable.status, "active"));

  const result = await Promise.all(
    rows.map(async (row) => {
      const contract = activeContracts.find((c) => c.unitId === row.unitId);
      let tenantName: string | null = null;
      if (contract) {
        const tenantRows = await db
          .select({ firstName: sql<string>`first_name`, lastName: sql<string>`last_name` })
          .from(sql`tenants`)
          .where(sql`id = ${contract.tenantId}`);
        if (tenantRows.length > 0) {
          tenantName = `${tenantRows[0].firstName} ${tenantRows[0].lastName}`;
        }
      }
      return {
        propertyId: row.propertyId,
        propertyName: row.propertyName,
        unitId: row.unitId,
        unitName: row.unitName,
        status: row.status,
        tenantName,
        monthlyRent: row.monthlyRent != null ? parseFloat(row.monthlyRent) : null,
        contractStart: contract?.startDate ?? null,
        contractEnd: contract?.endDate ?? null,
      };
    }),
  );

  res.json(GetRentalOverviewResponse.parse(result));
});

router.get("/dashboard/income-by-month", async (_req, res): Promise<void> => {
  // Generate last 12 months of data
  const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }

  // Get active contracts with their start/end dates and monthly rents
  const contracts = await db
    .select({
      startDate: contractsTable.startDate,
      endDate: contractsTable.endDate,
      monthlyRent: contractsTable.monthlyRent,
      status: contractsTable.status,
    })
    .from(contractsTable)
    .where(eq(contractsTable.status, "active"));

  const result = months.map(({ month, year }) => {
    const income = contracts.reduce((sum, c) => {
      const start = new Date(c.startDate);
      const end = c.endDate ? new Date(c.endDate) : null;
      const d = new Date(year, month - 1, 1);
      if (start <= d && (!end || end >= d)) {
        return sum + parseFloat(c.monthlyRent);
      }
      return sum;
    }, 0);
    return {
      month,
      year,
      income: Math.round(income * 100) / 100,
      label: `${monthNames[month - 1]} ${year}`,
    };
  });

  res.json(GetIncomeByMonthResponse.parse(result));
});

export default router;
