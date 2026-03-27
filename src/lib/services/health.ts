import db, { isPostgres } from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { DEFAULT_REPORT_YEAR, normalizeReportYear } from '@/lib/utils/year';

export interface FamilyMember {
  id: number;
  tenant_id: string;
  name: string;
  relation: string;
  birth_date: string | null;
  notes: string | null;
  is_active: 0 | 1;
  created_at: string;
}

export interface SymptomLog {
  id: number;
  member_name: string | null;
  occurred_on: string;
  symptom: string;
  severity: number;
  duration_hours: number;
  trigger: string | null;
  notes: string | null;
}

function yearParam(year?: string): string {
  return normalizeReportYear(year ?? DEFAULT_REPORT_YEAR);
}

export async function listFamilyMembers(tenantId: string, options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;
  if (includeInactive) {
    return db.all<FamilyMember>("SELECT * FROM family_members WHERE tenant_id = ? AND relation <> 'calendar' ORDER BY is_active DESC, name ASC", [tenantId]);
  }
  return db.all<FamilyMember>("SELECT * FROM family_members WHERE tenant_id = ? AND is_active = 1 AND relation <> 'calendar' ORDER BY name ASC", [tenantId]);
}

export async function ensureFamilyCalendarMember(tenantId: string) {
  const existing = await db.get<{ id: number }>(
    "SELECT id FROM family_members WHERE tenant_id = ? AND relation = 'calendar' ORDER BY id ASC LIMIT 1",
    [tenantId]
  );
  if (existing?.id) return existing.id;

  const created = await db.run(
    `INSERT INTO family_members (tenant_id, name, relation, notes, is_active)
     VALUES (?, 'Family Calendar', 'calendar', 'System member used for shared calendar imports', 0)
     RETURNING id`,
    [tenantId]
  );
  if (created.lastInsertRowid && created.lastInsertRowid > 0) return created.lastInsertRowid;

  const inserted = await db.get<{ id: number }>(
    "SELECT id FROM family_members WHERE tenant_id = ? AND relation = 'calendar' ORDER BY id DESC LIMIT 1",
    [tenantId]
  );
  return inserted?.id ?? 0;
}

export async function createOrUpdateFamilyMember(input: {
  tenantId: string;
  id?: number;
  name: string;
  relation: string;
  birthDate?: string | null;
  notes?: string | null;
  isActive?: 0 | 1;
}) {
  if (input.id) {
    await db.run(
      `UPDATE family_members
       SET name = ?, relation = ?, birth_date = ?, notes = ?, is_active = ?
       WHERE tenant_id = ? AND id = ?`,
      [input.name, input.relation, input.birthDate ?? null, input.notes ?? null, input.isActive ?? 1, input.tenantId, input.id]
    );
    return;
  }

  await db.run(
    `INSERT INTO family_members (tenant_id, name, relation, birth_date, notes, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.name, input.relation, input.birthDate ?? null, input.notes ?? null, input.isActive ?? 1]
  );
}

export async function addSymptomLog(input: {
  tenantId: string;
  memberId?: number | null;
  occurredOn: string;
  symptom: string;
  severity: number;
  durationHours?: number;
  trigger?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO health_symptom_logs (tenant_id, member_id, occurred_on, symptom, severity, duration_hours, trigger, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.memberId ?? null, input.occurredOn, input.symptom, input.severity, input.durationHours ?? 0, input.trigger ?? null, input.notes ?? null]
  );
}

export async function addSickDay(input: {
  tenantId: string;
  memberId: number;
  startDate: string;
  endDate: string;
  reason: string;
  fever?: 0 | 1;
  schoolWorkMissed?: 0 | 1;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO health_sick_days (tenant_id, member_id, start_date, end_date, reason, fever, school_work_missed, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.memberId,
      input.startDate,
      input.endDate,
      input.reason,
      input.fever ?? 0,
      input.schoolWorkMissed ?? 1,
      input.notes ?? null
    ]
  );
}

export async function updateSickDay(input: {
  tenantId: string;
  id: number;
  memberId: number;
  startDate: string;
  endDate: string;
  reason: string;
  fever?: 0 | 1;
  schoolWorkMissed?: 0 | 1;
  notes?: string | null;
}) {
  await db.run(
    `UPDATE health_sick_days
     SET member_id = ?, start_date = ?, end_date = ?, reason = ?, fever = ?, school_work_missed = ?, notes = ?
     WHERE tenant_id = ? AND id = ?`,
    [
      input.memberId,
      input.startDate,
      input.endDate,
      input.reason,
      input.fever ?? 0,
      input.schoolWorkMissed ?? 1,
      input.notes ?? null,
      input.tenantId,
      input.id
    ]
  );
}

export async function deleteSickDay(input: {
  tenantId: string;
  id: number;
}) {
  await db.run(
    `DELETE FROM health_sick_days
     WHERE tenant_id = ? AND id = ?`,
    [input.tenantId, input.id]
  );
}

export async function addAllergy(input: {
  tenantId: string;
  memberId: number;
  allergen: string;
  reaction: string;
  severity: number;
  hasEpinephrine?: 0 | 1;
  notes?: string | null;
  active?: 0 | 1;
}) {
  await db.run(
    `INSERT INTO health_allergies (tenant_id, member_id, allergen, reaction, severity, has_epinephrine, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.memberId, input.allergen, input.reaction, input.severity, input.hasEpinephrine ?? 0, input.notes ?? null, input.active ?? 1]
  );
}

export async function addMedication(input: {
  tenantId: string;
  memberId: number;
  medicationName: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate?: string | null;
  prescribedBy?: string | null;
  notes?: string | null;
  active?: 0 | 1;
}) {
  await db.run(
    `INSERT INTO health_medications (tenant_id, member_id, medication_name, dosage, frequency, start_date, end_date, prescribed_by, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.memberId,
      input.medicationName,
      input.dosage,
      input.frequency,
      input.startDate,
      input.endDate ?? null,
      input.prescribedBy ?? null,
      input.notes ?? null,
      input.active ?? 1
    ]
  );
}

export async function addAppointment(input: {
  tenantId: string;
  memberId: number;
  appointmentDate: string;
  provider: string;
  appointmentType: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  followUpDate?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO health_appointments (tenant_id, member_id, appointment_date, provider, appointment_type, status, follow_up_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.memberId,
      input.appointmentDate,
      input.provider,
      input.appointmentType,
      input.status ?? 'scheduled',
      input.followUpDate ?? null,
      input.notes ?? null
    ]
  );
}

export async function updateAppointment(input: {
  tenantId: string;
  id: number;
  memberId: number;
  appointmentDate: string;
  provider: string;
  appointmentType: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  followUpDate?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `UPDATE health_appointments
     SET member_id = ?, appointment_date = ?, provider = ?, appointment_type = ?, status = ?, follow_up_date = ?, notes = ?
     WHERE tenant_id = ? AND id = ?`,
    [
      input.memberId,
      input.appointmentDate,
      input.provider,
      input.appointmentType,
      input.status ?? 'scheduled',
      input.followUpDate ?? null,
      input.notes ?? null,
      input.tenantId,
      input.id
    ]
  );
}

export async function deleteAppointment(input: {
  tenantId: string;
  id: number;
}) {
  await db.run(
    `DELETE FROM health_appointments
     WHERE tenant_id = ? AND id = ?`,
    [input.tenantId, input.id]
  );
}

export async function getHealthOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const yearExpr = sqlYearExpr('occurred_on');

  const symptomStats =
    (await db.get<{ total: number; high: number }>(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN severity >= 4 THEN 1 ELSE 0 END), 0) AS high
       FROM health_symptom_logs
       WHERE tenant_id = ? AND ${yearExpr} = ?`,
      [tenantId, reportYear]
    )) ?? { total: 0, high: 0 };

  const sickDaysRows = await db.all<{ start_date: string; end_date: string }>(
    `SELECT start_date, end_date
     FROM health_sick_days
     WHERE tenant_id = ? AND ${sqlYearExpr('start_date')} = ?`,
    [tenantId, reportYear]
  );

  const sickDaysTotal = sickDaysRows.reduce((acc, row) => {
    const start = new Date(`${row.start_date}T00:00:00`);
    const end = new Date(`${row.end_date}T00:00:00`);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    return acc + days;
  }, 0);

  const activeAllergies = (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_allergies WHERE tenant_id = ? AND active = 1', [tenantId]))
    ?.count ?? 0;

  const activeMeds = (await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM health_medications WHERE tenant_id = ? AND active = 1', [tenantId]))?.count ??
    0;

  const upcomingDateClause = isPostgres ? 'appointment_date::date >= CURRENT_DATE' : "appointment_date >= DATE('now')";
  const upcomingAppointments =
    (await db.get<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM health_appointments
       WHERE tenant_id = ? AND status = 'scheduled' AND ${upcomingDateClause}`,
      [tenantId]
    ))?.count ?? 0;

  const recentSymptoms = await db.all<SymptomLog>(
    `SELECT s.id, s.occurred_on, s.symptom, s.severity, s.duration_hours, s.trigger, s.notes, m.name AS member_name
     FROM health_symptom_logs s
     LEFT JOIN family_members m ON m.id = s.member_id
     WHERE s.tenant_id = ?
     ORDER BY s.occurred_on DESC, s.id DESC
     LIMIT 25`,
    [tenantId]
  );

  const upcomingApptList = await db.all<{
    id: number;
    member_id: number | null;
    member_name: string | null;
    appointment_date: string;
    provider: string;
    appointment_type: string;
    status: string;
    follow_up_date: string | null;
    notes: string | null;
  }>(
    `SELECT a.id, a.member_id, m.name AS member_name, a.appointment_date, a.provider, a.appointment_type, a.status, a.follow_up_date, a.notes
     FROM health_appointments a
     LEFT JOIN family_members m ON m.id = a.member_id
     WHERE a.tenant_id = ?
     ORDER BY a.appointment_date ASC
     LIMIT 25`,
    [tenantId]
  );

  const allergies = await db.all<{
    id: number;
    member_name: string | null;
    allergen: string;
    reaction: string;
    severity: number;
    has_epinephrine: 0 | 1;
    active: 0 | 1;
  }>(
    `SELECT a.id, m.name AS member_name, a.allergen, a.reaction, a.severity, a.has_epinephrine, a.active
     FROM health_allergies a
     LEFT JOIN family_members m ON m.id = a.member_id
     WHERE a.tenant_id = ?
     ORDER BY a.active DESC, a.severity DESC, a.id DESC`,
    [tenantId]
  );

  const sickDayList = await db.all<{
    id: number;
    member_id: number | null;
    member_name: string | null;
    start_date: string;
    end_date: string;
    reason: string;
    fever: 0 | 1;
    school_work_missed: 0 | 1;
    notes: string | null;
  }>(
    `SELECT d.id, d.member_id, m.name AS member_name, d.start_date, d.end_date, d.reason, d.fever, d.school_work_missed, d.notes
     FROM health_sick_days d
     LEFT JOIN family_members m ON m.id = d.member_id
     WHERE d.tenant_id = ? AND ${sqlYearExpr('d.start_date')} = ?
     ORDER BY d.start_date DESC, d.id DESC
     LIMIT 50`,
    [tenantId, reportYear]
  );

  const monthKeys = Array.from({ length: 12 }, (_, index) => `${reportYear}-${String(index + 1).padStart(2, '0')}`);
  const careCalendar = monthKeys.map((month) => ({
    month,
    appointments: upcomingApptList.filter((appointment) => appointment.appointment_date?.slice(0, 7) === month),
    sickDays: sickDayList.filter((day) => day.start_date?.slice(0, 7) === month)
  }));

  return {
    reportYear,
    stats: {
      symptomEntries: symptomStats.total,
      highSeverityEpisodes: symptomStats.high,
      sickDays: sickDaysTotal,
      activeAllergies,
      activeMedications: activeMeds,
      upcomingAppointments
    },
    recentSymptoms,
    upcomingApptList,
    allergies,
    sickDayList,
    careCalendar
  };
}
