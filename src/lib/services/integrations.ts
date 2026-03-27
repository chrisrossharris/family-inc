import { createHash } from 'node:crypto';
import db from '@/lib/db/connection';
import { parseIcsEvents } from '@/lib/utils/ics';

function eventHash(input: { startDate: string; summary: string; description: string | null; location: string | null }) {
  return createHash('sha1')
    .update([input.startDate, input.summary, input.description ?? '', input.location ?? ''].join('|'))
    .digest('hex');
}

export async function listHealthCalendarFeeds(tenantId: string) {
  return db.all<{
    id: number;
    feed_name: string;
    ical_url: string;
    default_member_id: number;
    default_member_name: string | null;
    active: number;
    last_synced_at: string | null;
  }>(
    `SELECT f.id, f.feed_name, f.ical_url, f.default_member_id, m.name AS default_member_name, f.active, f.last_synced_at
     FROM health_calendar_feeds f
     LEFT JOIN family_members m ON m.id = f.default_member_id
     WHERE f.tenant_id = ?
     ORDER BY f.active DESC, f.feed_name ASC`,
    [tenantId]
  );
}

export async function upsertHealthCalendarFeed(input: {
  tenantId: string;
  id?: number;
  feedName: string;
  icalUrl: string;
  defaultMemberId: number;
  active?: 0 | 1;
}) {
  if (input.id) {
    await db.run(
      `UPDATE health_calendar_feeds
       SET feed_name = ?, ical_url = ?, default_member_id = ?, active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [input.feedName, input.icalUrl, input.defaultMemberId, input.active ?? 1, input.tenantId, input.id]
    );
    return;
  }

  await db.run(
    `INSERT INTO health_calendar_feeds
      (tenant_id, feed_name, ical_url, default_member_id, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [input.tenantId, input.feedName, input.icalUrl, input.defaultMemberId, input.active ?? 1]
  );
}

export async function deleteHealthCalendarFeed(input: {
  tenantId: string;
  id: number;
}) {
  await db.transaction(async (tx) => {
    await tx.run(`DELETE FROM health_calendar_event_links WHERE tenant_id = ? AND feed_id = ?`, [input.tenantId, input.id]);
    await tx.run(`DELETE FROM health_calendar_feeds WHERE tenant_id = ? AND id = ?`, [input.tenantId, input.id]);
  });
}

export async function syncHealthCalendarFeed(input: {
  tenantId: string;
  feedId: number;
}) {
  const feed = await db.get<{
    id: number;
    feed_name: string;
    ical_url: string;
    default_member_id: number;
  }>(
    `SELECT id, feed_name, ical_url, default_member_id
     FROM health_calendar_feeds
     WHERE tenant_id = ? AND id = ?`,
    [input.tenantId, input.feedId]
  );
  if (!feed) throw new Error('Calendar feed not found');

  const response = await fetch(feed.ical_url, { headers: { accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.1' } });
  if (!response.ok) throw new Error(`Calendar fetch failed: ${response.status}`);
  const raw = await response.text();
  const events = parseIcsEvents(raw);

  let inserted = 0;
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const event of events) {
      if (!event.uid || !event.startDate) continue;
      const hash = eventHash(event);
      const link = await tx.get<{ appointment_id: number; event_hash: string }>(
        `SELECT appointment_id, event_hash
         FROM health_calendar_event_links
         WHERE tenant_id = ? AND feed_id = ? AND event_uid = ?`,
        [input.tenantId, feed.id, event.uid]
      );

      const notes = [event.description, event.location].filter(Boolean).join('\n\n');
      if (link) {
        if (link.event_hash !== hash) {
          await tx.run(
            `UPDATE health_appointments
             SET appointment_date = ?, provider = ?, appointment_type = ?, status = 'scheduled', notes = ?
             WHERE tenant_id = ? AND id = ?`,
            [event.startDate, 'Google Calendar', event.summary, notes || null, input.tenantId, link.appointment_id]
          );
          await tx.run(
            `UPDATE health_calendar_event_links
             SET event_hash = ?, last_seen_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND feed_id = ? AND event_uid = ?`,
            [hash, input.tenantId, feed.id, event.uid]
          );
          updated += 1;
        } else {
          await tx.run(
            `UPDATE health_calendar_event_links
             SET last_seen_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND feed_id = ? AND event_uid = ?`,
            [input.tenantId, feed.id, event.uid]
          );
        }
        continue;
      }

      const insertedAppointment = await tx.run(
        `INSERT INTO health_appointments
          (tenant_id, member_id, appointment_date, provider, appointment_type, status, notes)
         VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
         RETURNING id`,
        [input.tenantId, feed.default_member_id, event.startDate, 'Google Calendar', event.summary, notes || null]
      );
      const appointmentId = insertedAppointment.lastInsertRowid;
      if (!appointmentId) continue;

      await tx.run(
        `INSERT INTO health_calendar_event_links
          (tenant_id, feed_id, event_uid, appointment_id, event_hash, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [input.tenantId, feed.id, event.uid, appointmentId, hash]
      );
      inserted += 1;
    }

    await tx.run(
      `UPDATE health_calendar_feeds
       SET last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
      [input.tenantId, feed.id]
    );
  });

  return { inserted, updated, total: events.length };
}

export async function addHouseAssetDocument(input: {
  tenantId: string;
  assetId: number;
  fileName: string;
  mimeType?: string | null;
  fileSize: number;
  blobData: Uint8Array;
  notes?: string | null;
}) {
  await db.run(
    `INSERT INTO house_asset_documents
      (tenant_id, asset_id, file_name, mime_type, file_size, blob_data, notes, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [input.tenantId, input.assetId, input.fileName, input.mimeType ?? null, input.fileSize, input.blobData, input.notes ?? null]
  );
}

export async function listHouseAssetDocuments(tenantId: string) {
  return db.all<{
    id: number;
    asset_id: number;
    asset_name: string | null;
    file_name: string;
    mime_type: string | null;
    file_size: number;
    notes: string | null;
    uploaded_at: string;
  }>(
    `SELECT d.id, d.asset_id, a.asset_name, d.file_name, d.mime_type, d.file_size, d.notes, d.uploaded_at
     FROM house_asset_documents d
     LEFT JOIN house_assets a ON a.id = d.asset_id
     WHERE d.tenant_id = ?
     ORDER BY d.uploaded_at DESC, d.id DESC`,
    [tenantId]
  );
}

export async function getHouseAssetDocument(input: {
  tenantId: string;
  id: number;
}) {
  return db.get<{
    id: number;
    file_name: string;
    mime_type: string | null;
    file_size: number;
    blob_data: Uint8Array | Buffer;
  }>(
    `SELECT id, file_name, mime_type, file_size, blob_data
     FROM house_asset_documents
     WHERE tenant_id = ? AND id = ?`,
    [input.tenantId, input.id]
  );
}

export async function deleteHouseAssetDocument(input: {
  tenantId: string;
  id: number;
}) {
  await db.run(
    `DELETE FROM house_asset_documents
     WHERE tenant_id = ? AND id = ?`,
    [input.tenantId, input.id]
  );
}
