import { supabase } from './supabaseClient';
import type { CustomFieldEntity } from './customFields';

// File/document attachments on contacts and deals (proposals, contracts,
// etc), stored in the private `crm-attachments` Supabase Storage bucket
// (db/migrations/2026-10-02_attachments.sql). Path convention keeps the
// owner's own uid as the first segment because storage.objects' RLS
// policies key off exactly that segment via storage.foldername(name)[1] -
// changing this convention here without updating the migration's policies
// would silently break access.
const BUCKET = 'crm-attachments';
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export interface Attachment {
  id: string;
  owner_id: string;
  entity_type: CustomFieldEntity;
  entity_id: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  content_type: string | null;
  created_at: string;
}

export async function listAttachments(entityType: CustomFieldEntity, entityId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Attachment[];
}

// `orgId` (not the signed-in user's own id) is the first path segment: with
// organizations, a member's uploads belong to the org, and the storage
// policy checks the segment against my_org_id(). For a solo owner the two
// are the same value.
export async function uploadAttachment(entityType: CustomFieldEntity, entityId: string, file: File, orgId: string): Promise<void> {
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error('That file is larger than the 20MB limit.');

  const safeName = file.name.replace(/[^\w.-]/g, '_');
  const storagePath = `${orgId}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('attachments').insert({
    entity_type: entityType,
    entity_id: entityId,
    file_name: file.name,
    storage_path: storagePath,
    file_size: file.size,
    content_type: file.type || null,
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw insertError;
  }
}

export async function deleteAttachment(att: Attachment): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([att.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('attachments').delete().eq('id', att.id);
  if (error) throw error;
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
