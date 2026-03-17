/**
 * Minimal hand-written Supabase types for tables the app queries directly.
 *
 * After connecting a Supabase project, REPLACE this entire file with
 * auto-generated types:
 *   npx supabase gen types typescript --local > types/database.ts
 */

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          academy_id: string;
          email: string;
          full_name: string;
          role: "student" | "admin" | "teacher";
          phone: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          academy_id: string;
          email: string;
          full_name: string;
          role?: "student" | "admin" | "teacher";
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
        };
        Update: {
          email?: string;
          full_name?: string;
          role?: "student" | "admin" | "teacher";
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      academies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          timezone: string;
          currency: string;
          address: string | null;
          contact_email: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          slug: string;
          timezone?: string;
          currency?: string;
          address?: string | null;
          contact_email?: string | null;
        };
        Update: {
          name?: string;
          slug?: string;
          timezone?: string;
          currency?: string;
          address?: string | null;
          contact_email?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      dance_styles: {
        Row: {
          id: string;
          name: string;
          requires_role_balance: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          name: string;
          requires_role_balance?: boolean;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          requires_role_balance?: boolean;
          sort_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      student_profiles: {
        Row: {
          id: string;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          date_of_birth: string | null;
          preferred_role: "leader" | "follower" | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          date_of_birth?: string | null;
          preferred_role?: "leader" | "follower" | null;
          notes?: string | null;
        };
        Update: {
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          date_of_birth?: string | null;
          preferred_role?: "leader" | "follower" | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      bookable_classes: {
        Row: {
          id: string;
          academy_id: string;
          class_id: string | null;
          dance_style_id: string | null;
          title: string;
          class_type: "class" | "social" | "student_practice";
          level: string | null;
          date: string;
          start_time: string;
          end_time: string;
          max_capacity: number | null;
          leader_cap: number | null;
          follower_cap: number | null;
          status: "scheduled" | "open" | "closed" | "cancelled";
          location: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          academy_id: string;
          class_id?: string | null;
          dance_style_id?: string | null;
          title: string;
          class_type: "class" | "social" | "student_practice";
          level?: string | null;
          date: string;
          start_time: string;
          end_time: string;
          max_capacity?: number | null;
          leader_cap?: number | null;
          follower_cap?: number | null;
          status?: "scheduled" | "open" | "closed" | "cancelled";
          location?: string | null;
          notes?: string | null;
        };
        Update: {
          title?: string;
          class_type?: "class" | "social" | "student_practice";
          level?: string | null;
          date?: string;
          start_time?: string;
          end_time?: string;
          max_capacity?: number | null;
          leader_cap?: number | null;
          follower_cap?: number | null;
          status?: "scheduled" | "open" | "closed" | "cancelled";
          location?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          bookable_class_id: string;
          student_id: string;
          dance_role: "leader" | "follower" | null;
          status: "confirmed" | "cancelled";
          subscription_id: string | null;
          booked_at: string;
          cancelled_at: string | null;
          cancel_reason: string | null;
        };
        Insert: {
          bookable_class_id: string;
          student_id: string;
          dance_role?: "leader" | "follower" | null;
          status?: "confirmed" | "cancelled";
          subscription_id?: string | null;
        };
        Update: {
          status?: "confirmed" | "cancelled";
          cancelled_at?: string | null;
          cancel_reason?: string | null;
        };
        Relationships: [];
      };
      student_subscriptions: {
        Row: {
          id: string;
          student_id: string;
          product_id: string;
          status: "active" | "paused" | "expired" | "exhausted" | "cancelled";
          total_credits: number | null;
          remaining_credits: number | null;
          valid_from: string;
          valid_until: string | null;
          dance_style_id: string | null;
          allowed_levels: string[] | null;
          stripe_subscription_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          student_id: string;
          product_id: string;
          status?: "active" | "paused" | "expired" | "exhausted" | "cancelled";
          total_credits?: number | null;
          remaining_credits?: number | null;
          valid_from?: string;
          valid_until?: string | null;
          dance_style_id?: string | null;
          allowed_levels?: string[] | null;
        };
        Update: {
          status?: "active" | "paused" | "expired" | "exhausted" | "cancelled";
          remaining_credits?: number | null;
          valid_until?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
