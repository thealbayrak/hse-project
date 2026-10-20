export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AttachmentKind = "photo" | "voice";

/**
 * Hand-maintained mirror of supabase/migrations/*.sql.
 * Regenerate with `npx supabase gen types typescript --linked > lib/supabase/database.types.ts`
 * once the project is linked, or keep this in step with the migration by hand.
 */
export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          organization_number: string | null;
          address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          organization_number?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      sites: {
        Row: {
          id: string;
          organization_id: string | null;
          name: string;
          city: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          name: string;
          city?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sites"]["Insert"]>;
        Relationships: [];
      };
      site_locations: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          sort_order: number;
          latitude: number | null;
          longitude: number | null;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          sort_order?: number;
          latitude?: number | null;
          longitude?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["site_locations"]["Insert"]>;
        Relationships: [];
      };
      incidents: {
        Row: {
          id: string;
          reference: string | null;
          organization_id: string | null;
          site_id: string;
          location_id: string | null;
          location: string | null;
          type: string;
          category: string;
          severity: string;
          status: string;
          description: string;
          source: string;
          is_anonymous: boolean;
          reporter_name: string | null;
          alert_sent_at: string | null;
          original_language: string | null;
          original_text: string | null;
          summary_sv: string | null;
          ai_confidence: number | null;
          tracking_code: string | null;
          public_note: string | null;
          ai_analysis: Json | null;
          ai_analysis_language: string | null;
          ai_analyzed_at: string | null;
          reporter_profile_id: string | null;
          latitude: number | null;
          longitude: number | null;
          location_ids: string[];
          categories: string[];
          audit_id: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          reference?: string | null;
          organization_id?: string | null;
          site_id: string;
          location_id?: string | null;
          location_ids?: string[];
          location?: string | null;
          type: string;
          category?: string;
          categories?: string[];
          audit_id?: string | null;
          severity: string;
          status?: string;
          description: string;
          source?: string;
          is_anonymous?: boolean;
          reporter_name?: string | null;
          alert_sent_at?: string | null;
          original_language?: string | null;
          original_text?: string | null;
          summary_sv?: string | null;
          ai_confidence?: number | null;
          tracking_code?: string | null;
          public_note?: string | null;
          ai_analysis?: Json | null;
          ai_analysis_language?: string | null;
          ai_analyzed_at?: string | null;
          reporter_profile_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["incidents"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string | null;
          site_id: string | null;
          employee_no: string | null;
          full_name: string;
          email: string | null;
          phone: string | null;
          role: string;
          reports_to: string | null;
          language: string | null;
          active: boolean;
          auth_user_id: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          site_id?: string | null;
          employee_no?: string | null;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          role?: string;
          reports_to?: string | null;
          language?: string | null;
          active?: boolean;
          auth_user_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          organization_id: string | null;
          site_id: string | null;
          incident_id: string | null;
          title: string;
          description: string | null;
          priority: string;
          status: string;
          assignee_id: string | null;
          created_by: string | null;
          due_date: string | null;
          feedback: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          site_id?: string | null;
          incident_id?: string | null;
          title: string;
          description?: string | null;
          priority?: string;
          status?: string;
          assignee_id?: string | null;
          created_by?: string | null;
          due_date?: string | null;
          feedback?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      checklist_templates: {
        Row: {
          id: string;
          organization_id: string | null;
          name: string;
          description: string | null;
          items: Json;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          name: string;
          description?: string | null;
          items?: Json;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["checklist_templates"]["Insert"]>;
        Relationships: [];
      };
      audits: {
        Row: {
          id: string;
          organization_id: string | null;
          template_id: string | null;
          template_name: string;
          site_id: string | null;
          assignee_id: string | null;
          created_by: string | null;
          due_date: string | null;
          status: string;
          items: Json;
          note: string | null;
          submitted_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          template_id?: string | null;
          template_name: string;
          site_id?: string | null;
          assignee_id?: string | null;
          created_by?: string | null;
          due_date?: string | null;
          status?: string;
          items?: Json;
          note?: string | null;
          submitted_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["audits"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          incident_id: string | null;
          recipient_profile_id: string | null;
          recipient_email: string;
          reason: string;
          channel: string;
          email_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          incident_id?: string | null;
          recipient_profile_id?: string | null;
          recipient_email: string;
          reason: string;
          channel?: string;
          email_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          organization_id: string | null;
          name: string;
          email: string;
          role: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          name: string;
          email: string;
          role?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      meetings: {
        Row: {
          id: string;
          incident_id: string | null;
          title: string;
          scheduled_at: string;
          duration_minutes: number;
          location: string | null;
          note: string | null;
          recipients: Json;
          created_by: string | null;
          email_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          incident_id?: string | null;
          title: string;
          scheduled_at: string;
          duration_minutes?: number;
          location?: string | null;
          note?: string | null;
          recipients?: Json;
          created_by?: string | null;
          email_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meetings"]["Insert"]>;
        Relationships: [];
      };
      incident_attachments: {
        Row: {
          id: string;
          incident_id: string;
          storage_path: string;
          kind: string;
          mime_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          incident_id: string;
          storage_path: string;
          kind: string;
          mime_type?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["incident_attachments"]["Insert"]>;
        Relationships: [];
      };
      actions: {
        Row: {
          id: string;
          incident_id: string | null;
          safety_walk_id: string | null;
          safety_walk_item_id: string | null;
          title: string | null;
          description: string | null;
          assignee_id: string | null;
          assignee_name: string | null;
          due_date: string | null;
          status: string;
          notes: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          incident_id?: string | null;
          safety_walk_id?: string | null;
          safety_walk_item_id?: string | null;
          title?: string | null;
          description?: string | null;
          assignee_id?: string | null;
          assignee_name?: string | null;
          due_date?: string | null;
          status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["actions"]["Insert"]>;
        Relationships: [];
      };
      safety_walks: {
        Row: {
          id: string;
          organization_id: string | null;
          site_id: string;
          title: string;
          skyddsombud_name: string | null;
          skyddsombud_role: string | null;
          completed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          site_id: string;
          title: string;
          skyddsombud_name?: string | null;
          skyddsombud_role?: string | null;
          completed_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["safety_walks"]["Insert"]>;
        Relationships: [];
      };
      safety_walk_items: {
        Row: {
          id: string;
          safety_walk_id: string;
          domain: string;
          item_key: string;
          title: string;
          status: string;
          notes: string | null;
          photo_path: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          safety_walk_id: string;
          domain: string;
          item_key: string;
          title: string;
          status: string;
          notes?: string | null;
          photo_path?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["safety_walk_items"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_incident: {
        Args: {
          p_id: string;
          p_site_id: string;
          p_location_id: string | null;
          p_type: string;
          p_category: string;
          p_severity: string;
          p_description: string;
          p_is_anonymous: boolean;
          p_reporter_name: string | null;
          p_attachments: Json;
          p_original_language?: string | null;
          p_original_text?: string | null;
          p_summary_sv?: string | null;
          p_ai_confidence?: number | null;
          p_reporter_profile_id?: string | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_location_ids?: string[];
          p_categories?: string[];
        };
        Returns: { id: string; reference: string; created_at: string; tracking_code: string | null }[];
      };
      audit_open_nonconformities: {
        Args: { p_audit_id: string };
        Returns: number;
      };
      list_site_people: {
        Args: { p_site_id: string };
        Returns: { id: string; full_name: string; role: string; employee_no: string | null }[];
      };
      incident_recipients: {
        Args: { p_incident_id: string };
        Returns: { profile_id: string; full_name: string; email: string; role: string; reason: string }[];
      };
      log_notification: {
        Args: { p_incident_id: string; p_profile_id: string | null; p_email: string; p_reason: string; p_email_id?: string | null };
        Returns: boolean;
      };
      incident_for_notification: {
        Args: { p_incident_id: string };
        Returns: {
          id: string;
          reference: string;
          type: string;
          category: string;
          severity: string;
          description: string;
          summary_sv: string | null;
          site_name: string;
          location_name: string;
          created_at: string;
          reporter_name: string | null;
          is_anonymous: boolean;
          tracking_code: string | null;
        }[];
      };
      track_incident: {
        Args: { p_code: string };
        Returns: {
          reference: string;
          status: string;
          severity: string;
          created_at: string;
          updated_at: string | null;
          has_owner: boolean;
          due_date: string | null;
          public_note: string | null;
        }[];
      };
      claim_incident_alert: {
        Args: { p_id: string };
        Returns: {
          id: string;
          reference: string;
          type: string;
          category: string;
          severity: string;
          description: string;
          site_name: string;
          location_name: string;
          created_at: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type IncidentRow = Database["public"]["Tables"]["incidents"]["Row"];
export type ActionRow = Database["public"]["Tables"]["actions"]["Row"];
export type AttachmentRow = Database["public"]["Tables"]["incident_attachments"]["Row"];
export type SiteRow = Database["public"]["Tables"]["sites"]["Row"];
export type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
export type LocationRow = Database["public"]["Tables"]["site_locations"]["Row"];
export type SafetyWalkRow = Database["public"]["Tables"]["safety_walks"]["Row"];
export type SafetyWalkItemRow = Database["public"]["Tables"]["safety_walk_items"]["Row"];
export type ClaimedAlertRow = Database["public"]["Functions"]["claim_incident_alert"]["Returns"][number];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TemplateRow = Database["public"]["Tables"]["checklist_templates"]["Row"];
export type AuditRow = Database["public"]["Tables"]["audits"]["Row"];
