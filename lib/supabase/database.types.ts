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
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          name: string;
          city?: string | null;
          address?: string | null;
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
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          sort_order?: number;
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
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          reference?: string | null;
          organization_id?: string | null;
          site_id: string;
          location_id?: string | null;
          location?: string | null;
          type: string;
          category: string;
          severity: string;
          status?: string;
          description: string;
          source?: string;
          is_anonymous?: boolean;
          reporter_name?: string | null;
          alert_sent_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["incidents"]["Insert"]>;
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
        };
        Returns: { id: string; reference: string; created_at: string }[];
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
