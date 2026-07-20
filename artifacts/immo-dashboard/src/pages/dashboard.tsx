import { useGetDashboardSummary, useGetRentalOverview, useGetIncomeByMonth } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Building2, UserCheck, Euro, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: overview, isLoading: isLoadingOverview } = useGetRentalOverview();
  const { data: income, isLoading: isLoadingIncome } = useGetIncomeByMonth();

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-serif">Cockpit</h1>
          <p className="text-muted-foreground mt-1 font-sans">Portfolio-Übersicht und Kennzahlen.</p>
        </div>
      </div>

      {isLoadingSummary ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Card key={i} className="h-32 animate-pulse bg-muted" />)}
        </div>
      ) : summary ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Immobilien</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{summary.totalProperties}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.totalUnits} Einheiten gesamt
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Belegungsrate</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {summary.occupancyRate != null ? summary.occupancyRate.toFixed(1) : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.occupiedUnits} vermietet / {summary.vacantUnits} leer
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monatsmiete</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500">
                {formatCurrency(summary.monthlyIncome)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Laufende Einnahmen
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verträge & Dokumente</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{summary.activeContracts}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Aktive Verträge ({summary.totalDocuments} Dok.)
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-8 grid-cols-1 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Einnahmen (12 Monate)</CardTitle>
            <CardDescription>Entwicklung der monatlichen Nettokaltmieten</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {isLoadingIncome ? (
              <div className="w-full h-full animate-pulse bg-muted rounded-md" />
            ) : income && income.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={income}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="label" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `€${value}`}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-md)'
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Einnahmen"]}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">
                Keine Daten verfügbar
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Schnellübersicht Einheiten</CardTitle>
            <CardDescription>Aktueller Status der Wohneinheiten</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {isLoadingOverview ? (
               <div className="space-y-4">
                 {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />)}
               </div>
            ) : overview && overview.length > 0 ? (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Einheit / Mieter</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Miete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.slice(0, 7).map((item) => (
                      <TableRow key={`${item.propertyId}-${item.unitId}`}>
                        <TableCell>
                          <div className="font-medium text-foreground">{item.unitName}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                            {item.tenantName || 'Kein Mieter'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            item.status === 'occupied' ? 'success' : 
                            item.status === 'vacant' ? 'warning' : 'info'
                          }>
                            {item.status === 'occupied' ? 'Vermietet' : 
                             item.status === 'vacant' ? 'Leerstand' : 'Renovierung'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(item.monthlyRent)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground py-12 border-2 border-dashed rounded-md">
                Keine Einheiten angelegt
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
