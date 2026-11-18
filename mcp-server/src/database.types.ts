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
      github_cards: {
        Row: {
          column_name: string
          is_draft: boolean
          item_id: string
          item_updated_at: string
          member_id: string
          moved_at: string
          number: number | null
          part: string | null
          room_id: string
          state: string
          title: string
          url: string | null
        }
        Insert: {
          column_name: string
          is_draft?: boolean
          item_id: string
          item_updated_at: string
          member_id: string
          moved_at: string
          number?: number | null
          part?: string | null
          room_id: string
          state: string
          title?: string
          url?: string | null
        }
        Update: {
          column_name?: string
          is_draft?: boolean
          item_id?: string
          item_updated_at?: string
          member_id?: string
          moved_at?: string
          number?: number | null
          part?: string | null
          room_id?: string
          state?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "github_cards_room_id_member_id_fkey"
            columns: ["room_id", "member_id"]
            isOneToOne: false
            referencedRelation: "effective_statuses"
            referencedColumns: ["room_id", "member_id"]
          },
          {
            foreignKeyName: "github_cards_room_id_member_id_fkey"
            columns: ["room_id", "member_id"]
            isOneToOne: false
            referencedRelation: "room_members"
            referencedColumns: ["room_id", "member_id"]
          },
        ]
      }
      issues: {
        Row: {
          created_at: string
          id: number
          member_id: string
          resolved_at: string | null
          room_id: string
          state: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: never
          member_id: string
          resolved_at?: string | null
          room_id: string
          state?: string
          title: string
        }
        Update: {
          created_at?: string
          id?: never
          member_id?: string
          resolved_at?: string | null
          room_id?: string
          state?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_room_id_member_id_fkey"
            columns: ["room_id", "member_id"]
            isOneToOne: false
            referencedRelation: "effective_statuses"
            referencedColumns: ["room_id", "member_id"]
          },
          {
            foreignKeyName: "issues_room_id_member_id_fkey"
            columns: ["room_id", "member_id"]
            isOneToOne: false
            referencedRelation: "room_members"
            referencedColumns: ["room_id", "member_id"]
          },
        ]
      }
      logs: {
        Row: {
          created_at: string
          id: number
          member_id: string
          room_id: string
          source: string
          status: string
          task: string
        }
        Insert: {
          created_at?: string
          id?: never
          member_id: string
          room_id: string
          source?: string
          status: string
          task?: string
        }
        Update: {
          created_at?: string
          id?: never
          member_id?: string
          room_id?: string
          source?: string
          status?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_room_id_member_id_fkey"
            columns: ["room_id", "member_id"]
            isOneToOne: false
            referencedRelation: "effective_statuses"
            referencedColumns: ["room_id", "member_id"]
          },
          {
            foreignKeyName: "logs_room_id_member_id_fkey"
            columns: ["room_id", "member_id"]
            isOneToOne: false
            referencedRelation: "room_members"
            referencedColumns: ["room_id", "member_id"]
          },
        ]
      }
      members: {
        Row: {
          auth_user_id: string | null
          avatar_color: string
          avatar_url: string | null
          created_at: string
          github_id: number
          github_login: string
          id: string
          name: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_color?: string
          avatar_url?: string | null
          created_at?: string
          github_id: number
          github_login: string
          id?: string
          name?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_color?: string
          avatar_url?: string | null
          created_at?: string
          github_id?: number
          github_login?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      room_members: {
        Row: {
          active: boolean
          avatar: string | null
          joined_at: string
          member_id: string
          part: string | null
          room_id: string
          status_source: string
        }
        Insert: {
          active?: boolean
          avatar?: string | null
          joined_at?: string
          member_id: string
          part?: string | null
          room_id: string
          status_source?: string
        }
        Update: {
          active?: boolean
          avatar?: string | null
          joined_at?: string
          member_id?: string
          part?: string | null
          room_id?: string
          status_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_secrets: {
        Row: {
          github_pat_enc: string
          pat_expires_at: string | null
          pat_last4: string | null
          pat_login: string
          room_id: string
          set_at: string
          set_by: string | null
        }
        Insert: {
          github_pat_enc: string
          pat_expires_at?: string | null
          pat_last4?: string | null
          pat_login: string
          room_id: string
          set_at?: string
          set_by?: string | null
        }
        Update: {
          github_pat_enc?: string
          pat_expires_at?: string | null
          pat_last4?: string | null
          pat_login?: string
          room_id?: string
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_secrets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_secrets_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string
          github_config: Json
          github_repo_id: number
          github_sync_error: string | null
          github_sync_failed_at: string | null
          github_synced_at: string | null
          id: string
          installation_id: number
          project_installation_id: number | null
          project_number: number | null
          project_owner: string | null
          project_owner_type: string | null
          synced_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name: string
          github_config?: Json
          github_repo_id: number
          github_sync_error?: string | null
          github_sync_failed_at?: string | null
          github_synced_at?: string | null
          id?: string
          installation_id: number
          project_installation_id?: number | null
          project_number?: number | null
          project_owner?: string | null
          project_owner_type?: string | null
          synced_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string
          github_config?: Json
          github_repo_id?: number
          github_sync_error?: string | null
          github_sync_failed_at?: string | null
          github_synced_at?: string | null
          id?: string
          installation_id?: number
          project_installation_id?: number | null
          project_number?: number | null
          project_owner?: string | null
          project_owner_type?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      statuses: {
        Row: {
          expires_at: string | null
          member_id: string
          mode: string
          room_id: string
          started_at: string
          status: string
          task: string
        }
        Insert: {
          expires_at?: string | null
          member_id: string
          mode?: string
          room_id: string
          started_at?: string
          status: string
          task?: string
        }
        Update: {
          expires_at?: string | null
          member_id?: string
          mode?: string
          room_id?: string
          started_at?: string
          status?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "statuses_room_id_member_id_fkey"
            columns: ["room_id", "member_id"]
            isOneToOne: true
            referencedRelation: "effective_statuses"
            referencedColumns: ["room_id", "member_id"]
          },
          {
            foreignKeyName: "statuses_room_id_member_id_fkey"
            columns: ["room_id", "member_id"]
            isOneToOne: true
            referencedRelation: "room_members"
            referencedColumns: ["room_id", "member_id"]
          },
        ]
      }
      usage: {
        Row: {
          hp_pct: number
          hp_resets_at: string | null
          member_id: string
          mp_pct: number
          mp_resets_at: string | null
          source: string
          updated_at: string
        }
        Insert: {
          hp_pct: number
          hp_resets_at?: string | null
          member_id: string
          mp_pct: number
          mp_resets_at?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          hp_pct?: number
          hp_resets_at?: string | null
          member_id?: string
          mp_pct?: number
          mp_resets_at?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      effective_statuses: {
        Row: {
          avatar: string | null
          card_draft: boolean | null
          card_number: number | null
          card_url: string | null
          expires_at: string | null
          member_id: string | null
          member_part: string | null
          part: string | null
          progress_count: number | null
          review: boolean | null
          room_id: string | null
          shadow_card_draft: boolean | null
          shadow_card_number: number | null
          shadow_card_url: string | null
          shadow_review: boolean | null
          shadow_status: string | null
          shadow_task: string | null
          source: string | null
          started_at: string | null
          status: string | null
          status_source: string | null
          task: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      release_status: {
        Args: { p_member: string; p_room: string }
        Returns: boolean
      }
      set_status: {
        Args: {
          p_member: string
          p_mode?: string
          p_room: string
          p_status: string
          p_task: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
