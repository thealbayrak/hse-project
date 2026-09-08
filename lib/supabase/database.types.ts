export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AttachmentKind = "photo" | "voice";

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
        Update: {
          id?: string;
          name?: string;
          organization_number?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sites: {
        Row: {
          id: string;
          organization_id: string | null;
          name: string;
          city: string | null;
          address: string | null;
          organization_number: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          name: string;
          city?: string | null;
          address?: string | null;
          organization_number?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          name?: string;
          city?: string | null;
          address?: string | null;
          organization_number?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      site_locations: {
        Row: {
          id: string;
          site_id: string;
          name: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
        };
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
          source: string | null;
          is_anonymous: boolean | null;
          anonymous: boolean | null;
          reporter_name: string | null;
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
          source?: string | null;
          is_anonymous?: boolean | null;
          anonymous?: boolean | null;
          reporter_name?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          reference?: string | null;
          organization_id?: string | null;
          site_id?: string;
          location_id?: string | null;
          location?: string | null;
          type?: string;
          category?: string;
          severity?: string;
          status?: string;
          description?: string;
          source?: string | null;
          is_anonymous?: boolean | null;
          anonymous?: boolean | null;
          reporter_name?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      incident_attachments: {
        Row: {
          id: string;
          incident_id: string;
          storage_path: string;
          url: string | null;
          kind: string;
          mime_type: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          incident_id: string;
          storage_path: string;
          url?: string | null;
          kind: string;
          mime_type?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          incident_id?: string;
          storage_path?: string;
          url?: string | null;
          kind?: string;
          mime_type?: string | null;
          created_at?: string | null;
        };
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
          created_at: string | null;
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
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
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
          created_at?: string | null;
          updated_at?: string | null;
        };
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
          skyddsombud: string | null;
          attending_skyddsombud: string | null;
          completed_at: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          site_id: string;
          title: string;
          skyddsombud_name?: string | null;
          skyddsombud_role?: string | null;
          skyddsombud?: string | null;
          attending_skyddsombud?: string | null;
          completed_at?: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          site_id?: string;
          title?: string;
          skyddsombud_name?: string | null;
          skyddsombud_role?: string | null;
          skyddsombud?: string | null;
          attending_skyddsombud?: string | null;
          completed_at?: string;
          created_at?: string | null;
        };
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
          photo_url: string | null;
          photo_path: string | null;
          sort_order: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          safety_walk_id: string;
          domain: string;
          item_key: string;
          title: string;
          status: string;
          notes?: string | null;
          photo_url?: string | null;
          photo_path?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          safety_walk_id?: string;
          domain?: string;
          item_key?: string;
          title?: string;
          status?: string;
          notes?: string | null;
          photo_url?: string | null;
          photo_path?: string | null;
          sort_order?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type IncidentRow = Database["public"]["Tables"]["incidents"]["Row"];
export type ActionRow = Database["public"]["Tables"]["actions"]["Row"];
export type AttachmentRow = Database["public"]["Tables"]["incident_attachments"]["Row"];
export type SiteRow = Database["public"]["Tables"]["sites"]["Row"];
export type LocationRow = Database["public"]["Tables"]["site_locations"]["Row"];
export type SafetyWalkRow = Database["public"]["Tables"]["safety_walks"]["Row"];
export type SafetyWalkItemRow = Database["public"]["Tables"]["safety_walk_items"]["Row"];
