export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          barber_id: string
          client_id: string | null
          client_name: string
          client_phone: string
          created_at: string
          id: string
          notes: string | null
          privacy_notice_version: string | null
          service_duration_minutes: number
          service_id: string | null
          service_name: string
          service_price: number
          status: Database["public"]["Enums"]["appointment_status"]
          terms_version: string | null
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          barber_id: string
          client_id?: string | null
          client_name: string
          client_phone: string
          created_at?: string
          id?: string
          notes?: string | null
          privacy_notice_version?: string | null
          service_duration_minutes?: number
          service_id?: string | null
          service_name: string
          service_price?: number
          status?: Database["public"]["Enums"]["appointment_status"]
          terms_version?: string | null
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          barber_id?: string
          client_id?: string | null
          client_name?: string
          client_phone?: string
          created_at?: string
          id?: string
          notes?: string | null
          privacy_notice_version?: string | null
          service_duration_minutes?: number
          service_id?: string | null
          service_name?: string
          service_price?: number
          status?: Database["public"]["Enums"]["appointment_status"]
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_privacy_notice_version_fkey"
            columns: ["privacy_notice_version"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_terms_version_fkey"
            columns: ["terms_version"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      barber_blocks: {
        Row: {
          barber_id: string
          block_date: string
          created_at: string
          created_by: string | null
          end_time: string | null
          id: string
          reason: string | null
          start_time: string | null
        }
        Insert: {
          barber_id: string
          block_date: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          reason?: string | null
          start_time?: string | null
        }
        Update: {
          barber_id?: string
          block_date?: string
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          id?: string
          reason?: string | null
          start_time?: string | null
        }
        Relationships: []
      }
      barber_portfolio: {
        Row: {
          barber_id: string
          caption: string | null
          created_at: string
          created_by: string | null
          display_order: number
          id: string
          image_path: string
        }
        Insert: {
          barber_id: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          id?: string
          image_path: string
        }
        Update: {
          barber_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          id?: string
          image_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "barber_portfolio_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      barbers: {
        Row: {
          active: boolean
          bio: string | null
          created_at: string
          display_order: number
          id: string
          name: string
          photo_url: string | null
          slug: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          bio?: string | null
          created_at?: string
          display_order?: number
          id?: string
          name: string
          photo_url?: string | null
          slug?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          bio?: string | null
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          photo_url?: string | null
          slug?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cash_closures: {
        Row: {
          appointments_count: number
          closed_at: string
          closed_by: string | null
          closure_date: string
          id: string
          income_by_method: Json
          notes: string | null
          total_cash: number
          total_expenses: number
          total_income: number
          total_tips: number
        }
        Insert: {
          appointments_count?: number
          closed_at?: string
          closed_by?: string | null
          closure_date: string
          id?: string
          income_by_method?: Json
          notes?: string | null
          total_cash?: number
          total_expenses?: number
          total_income?: number
          total_tips?: number
        }
        Update: {
          appointments_count?: number
          closed_at?: string
          closed_by?: string | null
          closure_date?: string
          id?: string
          income_by_method?: Json
          notes?: string | null
          total_cash?: number
          total_expenses?: number
          total_income?: number
          total_tips?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          birth_date: string | null
          birth_day: number | null
          birth_year: number | null
          birth_month: number | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          phone: string | null
          source: string
          unsubscribe_token: string
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          birth_date?: string | null
          birth_day?: number | null
          birth_year?: number | null
          birth_month?: number | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          phone?: string | null
          source?: string
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          birth_date?: string | null
          birth_day?: number | null
          birth_year?: number | null
          birth_month?: number | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          phone?: string | null
          source?: string
          unsubscribe_token?: string
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      data_export_log: {
        Row: {
          export_type: string
          exported_at: string
          exported_by: string
          id: number
          row_count: number
        }
        Insert: {
          export_type: string
          exported_at?: string
          exported_by: string
          id?: never
          row_count: number
        }
        Update: {
          export_type?: string
          exported_at?: string
          exported_by?: string
          id?: never
          row_count?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          id: string
        }
        Insert: {
          amount: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          description: string
          expense_date?: string
          id?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
        }
        Relationships: []
      }
      legal_document_versions: {
        Row: {
          created_at: string
          document: string
          published_on: string
          summary: string
          version: string
        }
        Insert: {
          created_at?: string
          document: string
          published_on: string
          summary: string
          version: string
        }
        Update: {
          created_at?: string
          document?: string
          published_on?: string
          summary?: string
          version?: string
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          client_id: string
          cycle_visits: number
          privacy_notice_version: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          total_visits: number
          updated_at: string
        }
        Insert: {
          client_id: string
          cycle_visits?: number
          privacy_notice_version?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          total_visits?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          cycle_visits?: number
          privacy_notice_version?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          total_visits?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_privacy_notice_version_fkey"
            columns: ["privacy_notice_version"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "loyalty_accounts_terms_version_fkey"
            columns: ["terms_version"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      loyalty_events: {
        Row: {
          actor_id: string | null
          client_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: number
          reason: string | null
          reward_id: string | null
          visit_id: string | null
        }
        Insert: {
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: never
          reason?: string | null
          reward_id?: string | null
          visit_id?: string | null
        }
        Update: {
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: never
          reason?: string | null
          reward_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          id: string
          is_demo: boolean
          milestones: Json
          name: string
          reward_description: string
          visits_required: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          id?: string
          is_demo?: boolean
          milestones?: Json
          name: string
          reward_description: string
          visits_required: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          id?: string
          is_demo?: boolean
          milestones?: Json
          name?: string
          reward_description?: string
          visits_required?: number
        }
        Relationships: []
      }
      loyalty_rewards: {
        Row: {
          client_id: string
          earned_at: string
          earned_visit_id: string | null
          id: string
          is_demo: boolean
          program_id: string
          redeemed_appointment_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          redemption_note: string | null
          reward_description: string
          status: string
          visits_required: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          client_id: string
          earned_at?: string
          earned_visit_id?: string | null
          id?: string
          is_demo?: boolean
          program_id: string
          redeemed_appointment_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          redemption_note?: string | null
          reward_description: string
          status?: string
          visits_required: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          client_id?: string
          earned_at?: string
          earned_visit_id?: string | null
          id?: string
          is_demo?: boolean
          program_id?: string
          redeemed_appointment_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          redemption_note?: string | null
          reward_description?: string
          status?: string
          visits_required?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_earned_visit_id_fkey"
            columns: ["earned_visit_id"]
            isOneToOne: false
            referencedRelation: "loyalty_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_redeemed_appointment_id_fkey"
            columns: ["redeemed_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          birthday_enabled: boolean
          birthday_reward: string | null
          enabled: boolean
          id: boolean
          starts_on: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          birthday_enabled?: boolean
          birthday_reward?: string | null
          enabled?: boolean
          id?: boolean
          starts_on: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          birthday_enabled?: boolean
          birthday_reward?: string | null
          enabled?: boolean
          id?: boolean
          starts_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      loyalty_visits: {
        Row: {
          appointment_id: string | null
          barber_id: string | null
          client_id: string
          credited_at: string
          credited_by: string | null
          id: string
          payment_id: string | null
          program_id: string | null
          reason: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          service_name: string | null
          source: string
          visit_date: string
        }
        Insert: {
          appointment_id?: string | null
          barber_id?: string | null
          client_id: string
          credited_at?: string
          credited_by?: string | null
          id?: string
          payment_id?: string | null
          program_id?: string | null
          reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          service_name?: string | null
          source: string
          visit_date: string
        }
        Update: {
          appointment_id?: string | null
          barber_id?: string | null
          client_id?: string
          credited_at?: string
          credited_by?: string | null
          id?: string
          payment_id?: string | null
          program_id?: string | null
          reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          service_name?: string | null
          source?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_visits_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_visits_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_visits_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_visits_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_consent_texts: {
        Row: {
          channel: string
          created_at: string
          text: string
          version: string
        }
        Insert: {
          channel?: string
          created_at?: string
          text: string
          version: string
        }
        Update: {
          channel?: string
          created_at?: string
          text?: string
          version?: string
        }
        Relationships: []
      }
      marketing_consents: {
        Row: {
          actor_id: string | null
          channel: string
          client_id: string
          created_at: string
          email: string | null
          granted: boolean
          id: string
          seq: number
          source: string
          text_version: string
        }
        Insert: {
          actor_id?: string | null
          channel?: string
          client_id: string
          created_at?: string
          email?: string | null
          granted: boolean
          id?: string
          seq?: never
          source: string
          text_version: string
        }
        Update: {
          actor_id?: string | null
          channel?: string
          client_id?: string
          created_at?: string
          email?: string | null
          granted?: boolean
          id?: string
          seq?: never
          source?: string
          text_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_consents_text_version_fkey"
            columns: ["text_version"]
            isOneToOne: false
            referencedRelation: "marketing_consent_texts"
            referencedColumns: ["version"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          barber_id: string | null
          barber_name: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          service_name: string
          tip: number
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          barber_id?: string | null
          barber_name?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          service_name: string
          tip?: number
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          barber_id?: string | null
          barber_name?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          service_name?: string
          tip?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          active: boolean
          barber_id: string
          day_of_week: number
          end_time: string
          id: string
          slot_minutes: number
          start_time: string
        }
        Insert: {
          active?: boolean
          barber_id: string
          day_of_week: number
          end_time: string
          id?: string
          slot_minutes?: number
          start_time: string
        }
        Update: {
          active?: boolean
          barber_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          slot_minutes?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          display_order: number
          duration_minutes: number
          id: string
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          duration_minutes?: number
          id?: string
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          duration_minutes?: number
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _loyalty_credit: {
        Args: {
          _actor: string
          _appointment_id: string
          _barber_id: string
          _client_id: string
          _payment_id: string
          _reason: string
          _service_name: string
          _source: string
          _visit_date: string
        }
        Returns: string
      }
      _loyalty_reverse: {
        Args: { _actor: string; _reason: string; _visit_id: string }
        Returns: boolean
      }
      admin_add_manual_visit: {
        Args: {
          _client_id: string
          _reason: string
          _service_name?: string
          _visit_date: string
        }
        Returns: string
      }
      admin_create_card: {
        Args: {
          _birth_day?: number
          _birth_month?: number
          _birth_year?: number
          _client_id: string | null
          _email?: string
          _first_name?: string
          _initial_visits?: number
          _last_name?: string
          _note?: string
          _phone?: string
          _whatsapp?: string
        }
        Returns: string
      }
      admin_export_marketing_contacts: {
        Args: never
        Returns: {
          birthday: string
          consent_at: string
          consent_source: string
          consent_text: string
          consent_version: string
          email: string
          first_name: string
          last_name: string
          unsubscribe_token: string
          whatsapp: string
          whatsapp_opt_in: boolean
        }[]
      }
      admin_link_appointment: {
        Args: { _appointment_id: string; _client_id: string; _reason: string }
        Returns: undefined
      }
      admin_merge_clients: {
        Args: { _reason: string; _source_id: string; _target_id: string }
        Returns: undefined
      }
      admin_reverse_visit: {
        Args: { _reason: string; _visit_id: string }
        Returns: boolean
      }
      admin_update_loyalty_settings: {
        Args: {
          _birthday_enabled: boolean
          _birthday_reward: string
          _enabled: boolean
          _starts_on: string
        }
        Returns: undefined
      }
      admin_update_loyalty_program: {
        Args: {
          _milestones?: Json
          _name?: string
          _reward_description: string
          _visits_required: number
        }
        Returns: string
      }
      can_manage_barber: { Args: { _barber_id: string }; Returns: boolean }
      cancel_my_appointment: {
        Args: { _appointment_id: string; _phone: string }
        Returns: boolean
      }
      claim_first_admin: { Args: never; Returns: boolean }
      client_channel_opt_in: {
        Args: { _channel: string; _client_id: string }
        Returns: boolean
      }
      client_marketing_opt_in: {
        Args: { _client_id: string }
        Returns: boolean
      }
      current_client_id: { Args: never; Returns: string }
      get_blocked_ranges: {
        Args: { _barber_id: string; _date: string }
        Returns: {
          end_time: string
          full_day: boolean
          start_time: string
        }[]
      }
      get_client_by_phone: {
        Args: { _phone: string }
        Returns: {
          id: string
        }[]
      }
      get_my_appointments: {
        Args: { _phone: string }
        Returns: {
          appointment_date: string
          appointment_time: string
          barber_name: string
          id: string
          service_name: string
          status: string
        }[]
      }
      get_my_service_history: {
        Args: never
        Returns: {
          barber_name: string
          counted: boolean
          service_name: string
          visit_date: string
        }[]
      }
      get_taken_slots: {
        Args: { _barber_id: string; _date: string }
        Returns: {
          appointment_time: string
          duration_minutes: number
        }[]
      }
      has_any_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      loyalty_prefill: {
        Args: never
        Returns: {
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          first_name: string
          last_name: string | null
          whatsapp: string | null
        }[]
      }
      loyalty_register: {
        Args: {
          _birth_year?: number
          _birth_day?: number
          _birth_month?: number
          _consent_version?: string
          _first_name: string
          _last_name?: string
          _marketing_opt_in?: boolean
          _privacy_notice_version?: string
          _terms_version?: string
          _whatsapp?: string
          _whatsapp_consent_version?: string
          _whatsapp_opt_in?: boolean
        }
        Returns: string
      }
      normalize_whatsapp: { Args: { _raw: string }; Returns: string }
      redeem_reward: {
        Args: { _appointment_id?: string; _note?: string; _reward_id: string }
        Returns: undefined
      }
      set_barber_photo: {
        Args: { _barber_id: string; _photo_url: string }
        Returns: undefined
      }
      set_my_barber_photo: { Args: { _photo_url: string }; Returns: undefined }
      set_my_marketing_consent: {
        Args: { _consent_version: string; _granted: boolean }
        Returns: undefined
      }
      slugify: { Args: { _text: string }; Returns: string }
      staff_create_client: {
        Args: {
          _email?: string
          _first_name: string
          _last_name?: string
          _phone?: string
        }
        Returns: string
      }
      staff_record_unsubscribe: {
        Args: { _channel?: string; _client_id: string }
        Returns: undefined
      }
      staff_register_walk_in: {
        Args: {
          _amount: number
          _barber_id: string
          _client_id: string
          _method: Database["public"]["Enums"]["payment_method"]
          _notes?: string
          _payment_date: string
          _payment_id: string
          _service_name: string
          _tip: number
        }
        Returns: string
      }
      unsubscribe_by_token: { Args: { _token: string }; Returns: boolean }
      update_my_profile: {
        Args: {
          _birth_day: number
          _birth_month: number
          _first_name: string
          _last_name: string
          _whatsapp: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "barber"
      appointment_status: "pendiente" | "confirmado" | "atendido" | "cancelado"
      expense_category:
        | "insumos"
        | "sueldos"
        | "alquiler"
        | "servicios"
        | "otros"
      payment_method:
        | "efectivo"
        | "transferencia"
        | "tarjeta"
        | "mercadopago"
        | "otro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "barber"],
      appointment_status: ["pendiente", "confirmado", "atendido", "cancelado"],
      expense_category: [
        "insumos",
        "sueldos",
        "alquiler",
        "servicios",
        "otros",
      ],
      payment_method: [
        "efectivo",
        "transferencia",
        "tarjeta",
        "mercadopago",
        "otro",
      ],
    },
  },
} as const
