/**
 * Supabase Database type definitions.
 *
 * Hand-maintained to match the current migration set (00001–00009).
 * Replace with `supabase gen types typescript` once the schema is
 * stable and the CLI is connected.
 */

export interface Database {
  public: {
    Tables: {
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
        Insert: Partial<Database["public"]["Tables"]["academies"]["Row"]> & {
          name: string;
          slug: string;
        };
        Update: Partial<Database["public"]["Tables"]["academies"]["Row"]>;
      };

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
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]> & {
          id: string;
          academy_id: string;
          email: string;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>;
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
        Insert: { id: string } & Partial<
          Omit<Database["public"]["Tables"]["student_profiles"]["Row"], "id">
        >;
        Update: Partial<Database["public"]["Tables"]["student_profiles"]["Row"]>;
      };

      teacher_profiles: {
        Row: {
          id: string;
          bio: string | null;
          specialties: string[] | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id: string } & Partial<
          Omit<Database["public"]["Tables"]["teacher_profiles"]["Row"], "id">
        >;
        Update: Partial<Database["public"]["Tables"]["teacher_profiles"]["Row"]>;
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
        Insert: Partial<Database["public"]["Tables"]["dance_styles"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["dance_styles"]["Row"]>;
      };

      classes: {
        Row: {
          id: string;
          academy_id: string;
          dance_style_id: string | null;
          title: string;
          class_type: "class" | "social" | "student_practice";
          level: string | null;
          day_of_week: number;
          start_time: string;
          end_time: string;
          max_capacity: number | null;
          leader_cap: number | null;
          follower_cap: number | null;
          location: string | null;
          is_active: boolean;
          term_bound: boolean | null;
          term_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["classes"]["Row"]> & {
          academy_id: string;
          title: string;
          class_type: "class" | "social" | "student_practice";
          day_of_week: number;
          start_time: string;
          end_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["classes"]["Row"]>;
      };

      teacher_pairs: {
        Row: {
          id: string;
          class_id: string;
          teacher_1_id: string;
          teacher_2_id: string | null;
          effective_from: string;
          effective_until: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["teacher_pairs"]["Row"]> & {
          class_id: string;
          teacher_1_id: string;
          effective_from: string;
        };
        Update: Partial<Database["public"]["Tables"]["teacher_pairs"]["Row"]>;
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
          teacher_override_1_id: string | null;
          teacher_override_2_id: string | null;
          term_bound: boolean | null;
          term_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bookable_classes"]["Row"]> & {
          academy_id: string;
          title: string;
          class_type: "class" | "social" | "student_practice";
          date: string;
          start_time: string;
          end_time: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookable_classes"]["Row"]>;
      };

      bookings: {
        Row: {
          id: string;
          bookable_class_id: string;
          student_id: string;
          dance_role: "leader" | "follower" | null;
          status: "confirmed" | "checked_in" | "cancelled" | "late_cancelled" | "missed";
          subscription_id: string | null;
          booked_at: string;
          cancelled_at: string | null;
          cancel_reason: string | null;
          check_in_method: string | null;
          check_in_token: string | null;
          source: string | null;
          admin_note: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["bookings"]["Row"]> & {
          bookable_class_id: string;
          student_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Row"]>;
      };

      waitlist: {
        Row: {
          id: string;
          bookable_class_id: string;
          student_id: string;
          dance_role: "leader" | "follower" | null;
          status: "waiting" | "offered" | "promoted" | "expired";
          position: number;
          booking_id: string | null;
          joined_at: string;
          offered_at: string | null;
          promoted_at: string | null;
          expired_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["waitlist"]["Row"]> & {
          bookable_class_id: string;
          student_id: string;
          position: number;
        };
        Update: Partial<Database["public"]["Tables"]["waitlist"]["Row"]>;
      };

      attendance: {
        Row: {
          id: string;
          bookable_class_id: string;
          student_id: string;
          status: "present" | "absent" | "late" | "excused";
          booking_id: string | null;
          marked_by: string | null;
          marked_at: string;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["attendance"]["Row"]> & {
          bookable_class_id: string;
          student_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["attendance"]["Row"]>;
      };

      terms: {
        Row: {
          id: string;
          academy_id: string;
          name: string;
          start_date: string;
          end_date: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["terms"]["Row"]> & {
          academy_id: string;
          name: string;
          start_date: string;
          end_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["terms"]["Row"]>;
      };

      products: {
        Row: {
          id: string;
          academy_id: string;
          name: string;
          description: string | null;
          long_description: string | null;
          product_type: "membership" | "pack" | "drop_in" | "promo_pass" | "pass";
          price_cents: number;
          currency: string;
          total_credits: number | null;
          duration_days: number | null;
          dance_style_id: string | null;
          allowed_levels: string[] | null;
          allowed_style_ids: string[] | null;
          allowed_style_names: string[] | null;
          style_name: string | null;
          span_terms: number | null;
          is_active: boolean;
          is_provisional: boolean;
          term_bound: boolean;
          recurring: boolean;
          classes_per_term: number | null;
          auto_renew: boolean;
          benefits: string[] | null;
          credits_model: string | null;
          validity_description: string | null;
          notes: string | null;
          stripe_price_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["products"]["Row"]> & {
          academy_id: string;
          name: string;
          product_type: "membership" | "pack" | "drop_in" | "promo_pass" | "pass";
          price_cents: number;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Row"]>;
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
          payment_method: string | null;
          payment_status: string;
          assigned_by: string | null;
          assigned_at: string | null;
          term_id: string | null;
          classes_used: number;
          classes_per_term: number | null;
          auto_renew: boolean;
          selected_style_names: string[] | null;
          notes: string | null;
          stripe_subscription_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["student_subscriptions"]["Row"]> & {
          student_id: string;
          product_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["student_subscriptions"]["Row"]>;
      };

      wallet_transactions: {
        Row: {
          id: string;
          student_id: string;
          subscription_id: string | null;
          booking_id: string | null;
          tx_type: "credit_used" | "credit_added" | "credit_refunded" | "credit_expired" | "penalty_charged";
          credits: number;
          balance_after: number | null;
          description: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["wallet_transactions"]["Row"]> & {
          student_id: string;
          tx_type: "credit_used" | "credit_added" | "credit_refunded" | "credit_expired" | "penalty_charged";
          credits: number;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["wallet_transactions"]["Row"]>;
      };

      payments: {
        Row: {
          id: string;
          academy_id: string;
          student_id: string;
          subscription_id: string | null;
          amount_cents: number;
          currency: string;
          status: "pending" | "completed" | "failed" | "refunded";
          stripe_payment_id: string | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          academy_id: string;
          student_id: string;
          amount_cents: number;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
      };

      penalties: {
        Row: {
          id: string;
          academy_id: string;
          student_id: string;
          booking_id: string | null;
          bookable_class_id: string;
          reason: "late_cancel" | "no_show";
          amount_cents: number;
          currency: string;
          payment_id: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["penalties"]["Row"]> & {
          academy_id: string;
          student_id: string;
          bookable_class_id: string;
          reason: "late_cancel" | "no_show";
          amount_cents: number;
        };
        Update: Partial<Database["public"]["Tables"]["penalties"]["Row"]>;
      };

      business_rules: {
        Row: {
          id: string;
          academy_id: string;
          key: string;
          value: Record<string, unknown>;
          description: string | null;
          is_provisional: boolean;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["business_rules"]["Row"]> & {
          academy_id: string;
          key: string;
          value: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["business_rules"]["Row"]>;
      };

      admin_tasks: {
        Row: {
          id: string;
          academy_id: string;
          performed_by: string;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          details: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["admin_tasks"]["Row"]> & {
          academy_id: string;
          performed_by: string;
          action: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_tasks"]["Row"]>;
      };

      coc_acceptances: {
        Row: {
          id: string;
          student_id: string;
          version: string;
          accepted_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["coc_acceptances"]["Row"]> & {
          student_id: string;
          version: string;
        };
        Update: Partial<Database["public"]["Tables"]["coc_acceptances"]["Row"]>;
      };

      birthday_redemptions: {
        Row: {
          id: string;
          student_id: string;
          year: number;
          redeemed_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["birthday_redemptions"]["Row"]> & {
          student_id: string;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["birthday_redemptions"]["Row"]>;
      };

      scan_sessions: {
        Row: {
          id: string;
          pairing_code: string;
          context_type: string;
          context_id: string | null;
          created_by: string;
          active: boolean;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          pairing_code: string;
          context_type: string;
          context_id?: string | null;
          created_by: string;
          active?: boolean;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          pairing_code?: string;
          context_type?: string;
          context_id?: string | null;
          created_by?: string;
          active?: boolean;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
    };

    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: "student" | "admin" | "teacher";
      class_type: "class" | "social" | "student_practice";
      instance_status: "scheduled" | "open" | "closed" | "cancelled";
      dance_role: "leader" | "follower";
      booking_status: "confirmed" | "checked_in" | "cancelled" | "late_cancelled" | "missed";
      waitlist_status: "waiting" | "offered" | "promoted" | "expired";
      attendance_mark: "present" | "absent" | "late" | "excused";
      product_type: "membership" | "pack" | "drop_in" | "promo_pass" | "pass";
      subscription_status: "active" | "paused" | "expired" | "exhausted" | "cancelled";
      payment_status: "pending" | "completed" | "failed" | "refunded";
      tx_type: "credit_used" | "credit_added" | "credit_refunded" | "credit_expired" | "penalty_charged";
      penalty_reason: "late_cancel" | "no_show";
    };
  };
}
