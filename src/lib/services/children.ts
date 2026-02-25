import db from '@/lib/db/connection';
import { sqlYearExpr } from '@/lib/db/sql-dialect';
import { DEFAULT_REPORT_YEAR, normalizeReportYear } from '@/lib/utils/year';

export interface ChildMember {
  id: number;
  name: string;
  relation: string;
  birth_date: string | null;
}

function yearParam(year?: string): string {
  return normalizeReportYear(year ?? DEFAULT_REPORT_YEAR);
}

export async function listChildrenMembers(tenantId: string) {
  return db.all<ChildMember>(
    `SELECT id, name, relation, birth_date
     FROM family_members
     WHERE tenant_id = ?
       AND is_active = 1
       AND (LOWER(relation) LIKE '%child%' OR LOWER(relation) LIKE '%son%' OR LOWER(relation) LIKE '%daughter%')
     ORDER BY name ASC`,
    [tenantId]
  );
}

export async function upsertChildProfile(input: {
  tenantId: string;
  memberId: number;
  schoolName?: string | null;
  gradeLevel?: string | null;
  learningStyle?: string | null;
  strengths?: string | null;
  supportNeeds?: string | null;
  longTermFocus?: string | null;
}) {
  await db.run(
    `INSERT INTO children_profiles (tenant_id, member_id, school_name, grade_level, learning_style, strengths, support_needs, long_term_focus, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id, member_id)
     DO UPDATE SET
       school_name = excluded.school_name,
       grade_level = excluded.grade_level,
       learning_style = excluded.learning_style,
       strengths = excluded.strengths,
       support_needs = excluded.support_needs,
       long_term_focus = excluded.long_term_focus,
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.tenantId,
      input.memberId,
      input.schoolName ?? null,
      input.gradeLevel ?? null,
      input.learningStyle ?? null,
      input.strengths ?? null,
      input.supportNeeds ?? null,
      input.longTermFocus ?? null
    ]
  );
}

export async function addChildCheckin(input: {
  tenantId: string;
  memberId: number;
  checkinDate: string;
  mood: number;
  sleepHours?: number;
  readingMinutes?: number;
  movementMinutes?: number;
  screenTimeMinutes?: number;
  socialConnection?: number;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO children_checkins (
      tenant_id, member_id, checkin_date, mood, sleep_hours, reading_minutes, movement_minutes, screen_time_minutes, social_connection, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.memberId,
      input.checkinDate,
      input.mood,
      input.sleepHours ?? 0,
      input.readingMinutes ?? 0,
      input.movementMinutes ?? 0,
      input.screenTimeMinutes ?? 0,
      input.socialConnection ?? 3,
      input.notes ?? null
    ]
  );
}

export async function addChildGoal(input: {
  tenantId: string;
  memberId: number;
  domain: string;
  goalTitle: string;
  targetDate?: string | null;
  progressPct?: number;
  status?: 'active' | 'on_hold' | 'completed';
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO children_goals (tenant_id, member_id, domain, goal_title, target_date, progress_pct, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.memberId, input.domain, input.goalTitle, input.targetDate ?? null, input.progressPct ?? 0, input.status ?? 'active', input.notes ?? null]
  );
}

export async function addChildMilestone(input: {
  tenantId: string;
  memberId: number;
  milestoneDate: string;
  domain: string;
  title: string;
  description?: string | null;
}) {
  await db.run(
    `INSERT INTO children_milestones (tenant_id, member_id, milestone_date, domain, title, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.memberId, input.milestoneDate, input.domain, input.title, input.description ?? null]
  );
}

export async function addAcademicRecord(input: {
  tenantId: string;
  memberId: number;
  recordedOn: string;
  term: string;
  subject: string;
  score?: string | null;
  teacherNote?: string | null;
  supportPlan?: string | null;
}) {
  await db.run(
    `INSERT INTO children_academics (tenant_id, member_id, recorded_on, term, subject, score, teacher_note, support_plan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.memberId, input.recordedOn, input.term, input.subject, input.score ?? null, input.teacherNote ?? null, input.supportPlan ?? null]
  );
}

export async function addChildActivity(input: {
  tenantId: string;
  memberId: number;
  activityName: string;
  category: string;
  schedule?: string | null;
  mentorOrCoach?: string | null;
  status?: 'active' | 'paused' | 'completed';
  monthlyCost?: number;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO children_activities (tenant_id, member_id, activity_name, category, schedule, mentor_or_coach, status, monthly_cost, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.tenantId,
      input.memberId,
      input.activityName,
      input.category,
      input.schedule ?? null,
      input.mentorOrCoach ?? null,
      input.status ?? 'active',
      input.monthlyCost ?? 0,
      input.notes ?? null
    ]
  );
}

export async function addSupportContact(input: {
  tenantId: string;
  memberId: number;
  contactName: string;
  role: string;
  organization?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO children_support_contacts (tenant_id, member_id, contact_name, role, organization, phone, email, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.tenantId, input.memberId, input.contactName, input.role, input.organization ?? null, input.phone ?? null, input.email ?? null, input.notes ?? null]
  );
}

export async function getChildrenOverview(tenantId: string, year?: string) {
  const reportYear = yearParam(year);
  const yearCheckins = sqlYearExpr('checkin_date');
  const yearMilestones = sqlYearExpr('milestone_date');

  const children = await listChildrenMembers(tenantId);

  const checkinAgg = await db.all<{ member_id: number; avg_sleep: number; avg_mood: number; avg_reading: number; entries: number }>(
    `SELECT member_id,
            AVG(sleep_hours) AS avg_sleep,
            AVG(mood) AS avg_mood,
            AVG(reading_minutes) AS avg_reading,
            COUNT(*) AS entries
     FROM children_checkins
     WHERE tenant_id = ? AND ${yearCheckins} = ?
     GROUP BY member_id`,
    [tenantId, reportYear]
  );

  const goalAgg = await db.all<{ member_id: number; active_goals: number; on_track: number }>(
    `SELECT member_id,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_goals,
            SUM(CASE WHEN status = 'active' AND progress_pct >= 60 THEN 1 ELSE 0 END) AS on_track
     FROM children_goals
     WHERE tenant_id = ?
     GROUP BY member_id`,
    [tenantId]
  );

  const profiles = await db.all<{
    member_id: number;
    school_name: string | null;
    grade_level: string | null;
    learning_style: string | null;
    strengths: string | null;
    support_needs: string | null;
    long_term_focus: string | null;
  }>(
    `SELECT member_id, school_name, grade_level, learning_style, strengths, support_needs, long_term_focus
     FROM children_profiles
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const goals = await db.all<{
    member_name: string;
    domain: string;
    goal_title: string;
    target_date: string | null;
    progress_pct: number;
    status: string;
    notes: string | null;
  }>(
    `SELECT m.name AS member_name, g.domain, g.goal_title, g.target_date, g.progress_pct, g.status, g.notes
     FROM children_goals g
     INNER JOIN family_members m ON m.id = g.member_id
     WHERE g.tenant_id = ?
     ORDER BY g.status ASC, CASE WHEN g.target_date IS NULL THEN 1 ELSE 0 END, g.target_date ASC, g.id DESC
     LIMIT 60`,
    [tenantId]
  );

  const milestones = await db.all<{ member_name: string; milestone_date: string; domain: string; title: string }>(
    `SELECT m.name AS member_name, c.milestone_date, c.domain, c.title
     FROM children_milestones c
     INNER JOIN family_members m ON m.id = c.member_id
     WHERE c.tenant_id = ? AND ${yearMilestones} = ?
     ORDER BY c.milestone_date DESC
     LIMIT 30`,
    [tenantId, reportYear]
  );

  const academics = await db.all<{ member_name: string; term: string; subject: string; score: string | null; teacher_note: string | null }>(
    `SELECT m.name AS member_name, a.term, a.subject, a.score, a.teacher_note
     FROM children_academics a
     INNER JOIN family_members m ON m.id = a.member_id
     WHERE a.tenant_id = ?
     ORDER BY a.recorded_on DESC, a.id DESC
     LIMIT 40`,
    [tenantId]
  );

  const activities = await db.all<{ member_name: string; activity_name: string; category: string; schedule: string | null; mentor_or_coach: string | null; status: string }>(
    `SELECT m.name AS member_name, a.activity_name, a.category, a.schedule, a.mentor_or_coach, a.status
     FROM children_activities a
     INNER JOIN family_members m ON m.id = a.member_id
     WHERE a.tenant_id = ?
     ORDER BY a.status ASC, a.activity_name ASC`,
    [tenantId]
  );

  const contacts = await db.all<{ member_name: string; contact_name: string; role: string; organization: string | null; phone: string | null; email: string | null }>(
    `SELECT m.name AS member_name, c.contact_name, c.role, c.organization, c.phone, c.email
     FROM children_support_contacts c
     INNER JOIN family_members m ON m.id = c.member_id
     WHERE c.tenant_id = ?
     ORDER BY m.name ASC, c.role ASC`,
    [tenantId]
  );

  const snapshots = children.map((child) => {
    const check = checkinAgg.find((c) => c.member_id === child.id);
    const goal = goalAgg.find((g) => g.member_id === child.id);
    const profile = profiles.find((p) => p.member_id === child.id);
    return {
      child,
      profile,
      avgSleep: check?.avg_sleep ?? 0,
      avgMood: check?.avg_mood ?? 0,
      avgReading: check?.avg_reading ?? 0,
      checkins: check?.entries ?? 0,
      activeGoals: goal?.active_goals ?? 0,
      onTrackGoals: goal?.on_track ?? 0
    };
  });

  const totalGoals = snapshots.reduce((acc, s) => acc + s.activeGoals, 0);
  const onTrackGoals = snapshots.reduce((acc, s) => acc + s.onTrackGoals, 0);

  const contactsCount = contacts.length;
  const milestonesCount = milestones.length;

  return {
    reportYear,
    snapshots,
    goals,
    milestones,
    academics,
    activities,
    contacts,
    stats: {
      childrenCount: children.length,
      totalGoals,
      onTrackGoals,
      milestonesCount,
      contactsCount
    }
  };
}
