/** Shared API types (mirrors backend payloads). */

export interface Profile {
  id: string;
  name: string;
  roll_number: string;
  avatar_color: string;
  bio?: string;
  email?: string;
  has_keys: boolean;
  is_self?: boolean;
  privacy?: { show_email: boolean; show_bio: boolean };
  public_key?: string | null;
}

export interface ClassInfo {
  class_code: string;
  class_name: string;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'team';
  team_id: string | null;
  title: string;
  avatar_color: string;
  member_count?: number;
  other_user?: Profile;
  unread: number;
  last_message?: Message | null;
  created_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  kind: 'text' | 'file';
  ciphertext: string;
  file_id: string | null;
  created_at: string;
  read_by: string[];
}

export interface FileMeta {
  id: string;
  owner_id: string;
  filename: string;
  mime: string;
  size: number;
  encrypted: boolean;
  scope_type: 'dm' | 'team' | 'class';
  scope_ref: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  avatar_color: string;
  owner_id: string;
  members: Profile[];
  conversation_id: string | null;
  role: 'member' | 'invited' | null;
  created_at: string;
}

export interface Invitation {
  id: string;
  team_id: string;
  team_name: string;
  team_color: string;
  invitee: Profile | null;
  inviter: Profile | null;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  responded_at: string | null;
}

export interface Post {
  id: string;
  kind: 'announcement' | 'question' | 'update';
  title: string;
  body: string;
  course: string;
  author: Profile;
  created_at: string;
  comment_count: number;
  reply_count: number;
  accepted_reply_id: string | null;
  answered?: boolean;
  replies?: Reply[];
}

export interface Comment {
  id: string;
  body: string;
  author: Profile;
  created_at: string;
}

export interface Reply {
  id: string;
  body: string;
  author: Profile;
  created_at: string;
  is_accepted: boolean;
}

export interface Note {
  id: string;
  title: string;
  description: string;
  course: string;
  topics: string[];
  link: string;
  body: string;
  owner: Profile;
  file: { id: string; filename: string; mime: string; size: number } | null;
  created_at: string;
}

export interface StudyGroup {
  id: string;
  name: string;
  description: string;
  course: string;
  schedule: string;
  members: Profile[];
  owner_id: string;
  is_member: boolean;
  created_at: string;
}

export interface ClassEvent {
  id: string;
  title: string;
  description: string;
  kind: 'event' | 'deadline';
  starts_at: string;
  ends_at: string | null;
  location: string;
  created_by: Profile | null;
  is_owner: boolean;
}
