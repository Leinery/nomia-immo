import { db, propertiesTable, unitsTable, tenantsTable, contractsTable } from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  // Properties
  const [prop1] = await db
    .insert(propertiesTable)
    .values({
      name: "Mehrfamilienhaus Berliner Str.",
      address: "Berliner Straße 42, 10117 Berlin",
      type: "apartment_building",
      description: "Gründerzeithaus mit 4 Wohneinheiten, Baujahr 1910, vollständig saniert 2015",
      purchasePrice: "850000",
      purchaseYear: 2018,
      totalUnits: 4,
    })
    .onConflictDoNothing()
    .returning();

  const [prop2] = await db
    .insert(propertiesTable)
    .values({
      name: "Eigentumswohnung Schöneberg",
      address: "Hauptstraße 15, 10827 Berlin",
      type: "house",
      description: "3-Zimmer-Wohnung im 2. OG, 78 m², Balkon",
      purchasePrice: "320000",
      purchaseYear: 2020,
      totalUnits: 1,
    })
    .onConflictDoNothing()
    .returning();

  if (!prop1 || !prop2) {
    console.log("Seed data already exists, skipping.");
    return;
  }

  // Units for prop1
  const [u1] = await db
    .insert(unitsTable)
    .values({
      propertyId: prop1.id,
      name: "EG links",
      floor: 0,
      area: "72.50",
      rooms: "3",
      status: "occupied",
      monthlyRent: "950",
      deposit: "2850",
    })
    .returning();

  const [u2] = await db
    .insert(unitsTable)
    .values({
      propertyId: prop1.id,
      name: "EG rechts",
      floor: 0,
      area: "68.00",
      rooms: "2.5",
      status: "occupied",
      monthlyRent: "880",
      deposit: "2640",
    })
    .returning();

  const [u3] = await db
    .insert(unitsTable)
    .values({
      propertyId: prop1.id,
      name: "1. OG",
      floor: 1,
      area: "80.00",
      rooms: "3.5",
      status: "vacant",
      monthlyRent: "1050",
      deposit: "3150",
    })
    .returning();

  const [u4] = await db
    .insert(unitsTable)
    .values({
      propertyId: prop1.id,
      name: "2. OG / DG",
      floor: 2,
      area: "95.00",
      rooms: "4",
      status: "occupied",
      monthlyRent: "1250",
      deposit: "3750",
    })
    .returning();

  // Unit for prop2
  const [u5] = await db
    .insert(unitsTable)
    .values({
      propertyId: prop2.id,
      name: "Wohnung 2. OG",
      floor: 2,
      area: "78.00",
      rooms: "3",
      status: "occupied",
      monthlyRent: "1100",
      deposit: "3300",
    })
    .returning();

  // Tenants
  const [t1] = await db
    .insert(tenantsTable)
    .values({
      firstName: "Klaus",
      lastName: "Müller",
      email: "k.mueller@example.de",
      phone: "030 1234567",
    })
    .returning();

  const [t2] = await db
    .insert(tenantsTable)
    .values({
      firstName: "Sabine",
      lastName: "Schmidt",
      email: "s.schmidt@example.de",
      phone: "030 7654321",
    })
    .returning();

  const [t3] = await db
    .insert(tenantsTable)
    .values({
      firstName: "Thomas",
      lastName: "Weber",
      email: "t.weber@example.de",
      phone: "030 9876543",
    })
    .returning();

  // Contracts
  await db.insert(contractsTable).values({
    unitId: u1.id,
    tenantId: t1.id,
    startDate: "2021-03-01",
    monthlyRent: "950",
    deposit: "2850",
    status: "active",
  });

  await db.insert(contractsTable).values({
    unitId: u2.id,
    tenantId: t2.id,
    startDate: "2022-07-01",
    monthlyRent: "880",
    deposit: "2640",
    status: "active",
  });

  await db.insert(contractsTable).values({
    unitId: u4.id,
    tenantId: t3.id,
    startDate: "2023-01-01",
    monthlyRent: "1250",
    deposit: "3750",
    status: "active",
  });

  await db.insert(contractsTable).values({
    unitId: u5.id,
    tenantId: t2.id,
    startDate: "2020-09-01",
    monthlyRent: "1100",
    deposit: "3300",
    status: "active",
  });

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
