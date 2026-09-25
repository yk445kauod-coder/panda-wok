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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          created_at: string
          entity: string | null
          entity_id: string | null
          event: string
          id: number
          metadata: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          event: string
          id?: number
          metadata?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          event?: string
          id?: number
          metadata?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          accuracy_m: number | null
          address_line: string
          apartment: string | null
          area: string | null
          building: string | null
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          floor: string | null
          id: string
          is_default: boolean
          label: string
          landmark: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          address_line: string
          apartment?: string | null
          area?: string | null
          building?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          address_line?: string
          apartment?: string | null
          area?: string | null
          building?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_knowledge_sources: {
        Row: {
          content: string | null
          id: string
          is_enabled: boolean
          kind: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          content?: string | null
          id?: string
          is_enabled?: boolean
          kind?: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          content?: string | null
          id?: string
          is_enabled?: boolean
          kind?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          id: string
          is_active: boolean
          key: string
          max_tokens: number
          name: string
          system_instruction: string
          temperature: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          key: string
          max_tokens?: number
          name: string
          system_instruction: string
          temperature?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          key?: string
          max_tokens?: number
          name?: string
          system_instruction?: string
          temperature?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          base_url: string | null
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          is_fallback: boolean
          kind: string
          max_requests_per_minute: number
          model: string | null
          monthly_token_quota: number | null
          name: string
          priority: number
          secret_ref: string | null
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_fallback?: boolean
          kind?: string
          max_requests_per_minute?: number
          model?: string | null
          monthly_token_quota?: number | null
          name: string
          priority?: number
          secret_ref?: string | null
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_fallback?: boolean
          kind?: string
          max_requests_per_minute?: number
          model?: string | null
          monthly_token_quota?: number | null
          name?: string
          priority?: number
          secret_ref?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_requests: {
        Row: {
          completion_tokens: number | null
          created_at: string
          error: string | null
          estimated_cost: number | null
          id: string
          latency_ms: number | null
          model: string | null
          prompt_key: string | null
          prompt_tokens: number | null
          provider: string | null
          status: string
          surface: string
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_key?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          status?: string
          surface?: string
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_key?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          status?: string
          surface?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          completion_tokens: number
          day: string
          errors: number
          estimated_cost: number
          prompt_tokens: number
          provider: string
          requests: number
        }
        Insert: {
          completion_tokens?: number
          day: string
          errors?: number
          estimated_cost?: number
          prompt_tokens?: number
          provider?: string
          requests?: number
        }
        Update: {
          completion_tokens?: number
          day?: string
          errors?: number
          estimated_cost?: number
          prompt_tokens?: number
          provider?: string
          requests?: number
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          device: string | null
          event: string
          id: number
          metadata: Json
          path: string | null
          referrer: string | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device?: string | null
          event: string
          id?: number
          metadata?: Json
          path?: string | null
          referrer?: string | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device?: string | null
          event?: string
          id?: number
          metadata?: Json
          path?: string | null
          referrer?: string | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          created_at: string
          ends_at: string | null
          href: string | null
          id: string
          is_active: boolean
          locale: string
          message: string
          restaurant_id: string
          sort_order: number
          starts_at: string | null
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          href?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          message: string
          restaurant_id?: string
          sort_order?: number
          starts_at?: string | null
          tone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          href?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          message?: string
          restaurant_id?: string
          sort_order?: number
          starts_at?: string | null
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["staff_role"] | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          ip: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["staff_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: number
          ip?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["staff_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: number
          ip?: string | null
        }
        Relationships: []
      }
      backup_records: {
        Row: {
          bytes: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["backup_kind"]
          label: string | null
          manifest: Json
          status: Database["public"]["Enums"]["backup_status"]
          storage_path: string | null
        }
        Insert: {
          bytes?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["backup_kind"]
          label?: string | null
          manifest?: Json
          status?: Database["public"]["Enums"]["backup_status"]
          storage_path?: string | null
        }
        Update: {
          bytes?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["backup_kind"]
          label?: string | null
          manifest?: Json
          status?: Database["public"]["Enums"]["backup_status"]
          storage_path?: string | null
        }
        Relationships: []
      }
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          created_at: string
          delivered_at: string | null
          failed_reason: string | null
          id: number
          read_at: string | null
          user_id: string
        }
        Insert: {
          broadcast_id: string
          created_at?: string
          delivered_at?: string | null
          failed_reason?: string | null
          id?: number
          read_at?: string | null
          user_id: string
        }
        Update: {
          broadcast_id?: string
          created_at?: string
          delivered_at?: string | null
          failed_reason?: string | null
          id?: number
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience_label: string | null
          body: string
          channel: Database["public"]["Enums"]["broadcast_channel"]
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          estimated_recipients: number
          failed_count: number
          id: string
          scheduled_for: string | null
          segment: Json
          sent_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["broadcast_status"]
          title: string
        }
        Insert: {
          audience_label?: string | null
          body: string
          channel?: Database["public"]["Enums"]["broadcast_channel"]
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          estimated_recipients?: number
          failed_count?: number
          id?: string
          scheduled_for?: string | null
          segment?: Json
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["broadcast_status"]
          title: string
        }
        Update: {
          audience_label?: string | null
          body?: string
          channel?: Database["public"]["Enums"]["broadcast_channel"]
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          estimated_recipients?: number
          failed_count?: number
          id?: string
          scheduled_for?: string | null
          segment?: Json
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["broadcast_status"]
          title?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          image_url: string | null
          is_enabled: boolean
          name_ar: string | null
          name_en: string
          name_ja: string | null
          restaurant_id: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          name_ar?: string | null
          name_en: string
          name_ja?: string | null
          restaurant_id?: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          name_ar?: string | null
          name_en?: string
          name_ja?: string | null
          restaurant_id?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_unread: number
          id: string
          last_message_at: string
          related_order_id: string | null
          staff_unread: number
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_unread?: number
          id?: string
          last_message_at?: string
          related_order_id?: string | null
          staff_unread?: number
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_unread?: number
          id?: string
          last_message_at?: string
          related_order_id?: string | null
          staff_unread?: number
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          areas: string[]
          created_at: string
          eta_minutes: number | null
          fee: number
          free_over: number | null
          id: string
          is_active: boolean
          name_ar: string | null
          name_en: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          areas?: string[]
          created_at?: string
          eta_minutes?: number | null
          fee?: number
          free_over?: number | null
          id?: string
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          areas?: string[]
          created_at?: string
          eta_minutes?: number | null
          fee?: number
          free_over?: number | null
          id?: string
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          bytes: number | null
          completed_at: string | null
          created_at: string
          dataset: string
          error: string | null
          expires_at: string | null
          filters: Json
          format: Database["public"]["Enums"]["export_format"]
          id: string
          requested_by: string | null
          row_count: number | null
          status: Database["public"]["Enums"]["export_status"]
          storage_path: string | null
        }
        Insert: {
          bytes?: number | null
          completed_at?: string | null
          created_at?: string
          dataset: string
          error?: string | null
          expires_at?: string | null
          filters?: Json
          format?: Database["public"]["Enums"]["export_format"]
          id?: string
          requested_by?: string | null
          row_count?: number | null
          status?: Database["public"]["Enums"]["export_status"]
          storage_path?: string | null
        }
        Update: {
          bytes?: number | null
          completed_at?: string | null
          created_at?: string
          dataset?: string
          error?: string | null
          expires_at?: string | null
          filters?: Json
          format?: Database["public"]["Enums"]["export_format"]
          id?: string
          requested_by?: string | null
          row_count?: number | null
          status?: Database["public"]["Enums"]["export_status"]
          storage_path?: string | null
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_published: boolean
          locale: string
          question: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_published?: boolean
          locale?: string
          question: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_published?: boolean
          locale?: string
          question?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          is_enabled: boolean
          key: string
          label: string
          module: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          description?: string | null
          is_enabled?: boolean
          key: string
          label: string
          module: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          description?: string | null
          is_enabled?: boolean
          key?: string
          label?: string
          module?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_response: string | null
          category: Database["public"]["Enums"]["feedback_category"]
          created_at: string
          id: string
          image_urls: string[]
          is_public: boolean
          message: string
          order_id: string | null
          rating: number
          responded_at: string | null
          responded_by: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          title: string | null
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          category?: Database["public"]["Enums"]["feedback_category"]
          created_at?: string
          id?: string
          image_urls?: string[]
          is_public?: boolean
          message: string
          order_id?: string | null
          rating: number
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          title?: string | null
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          category?: Database["public"]["Enums"]["feedback_category"]
          created_at?: string
          id?: string
          image_urls?: string[]
          is_public?: boolean
          message?: string
          order_id?: string | null
          rating?: number
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          lifetime_points: number
          points_balance: number
          tier: Database["public"]["Enums"]["loyalty_tier"]
          tier_progress: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          lifetime_points?: number
          points_balance?: number
          tier?: Database["public"]["Enums"]["loyalty_tier"]
          tier_progress?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          lifetime_points?: number
          points_balance?: number
          tier?: Database["public"]["Enums"]["loyalty_tier"]
          tier_progress?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_redemptions: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          points_spent: number
          reward_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          points_spent: number
          reward_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          points_spent?: number
          reward_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_enabled: boolean
          kind: string
          menu_item_id: string | null
          min_order_total: number
          name_ar: string | null
          name_en: string
          points_cost: number
          redeemed_count: number
          stock_limit: number | null
          tier_required: Database["public"]["Enums"]["loyalty_tier"]
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          value: number
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_enabled?: boolean
          kind?: string
          menu_item_id?: string | null
          min_order_total?: number
          name_ar?: string | null
          name_en: string
          points_cost: number
          redeemed_count?: number
          stock_limit?: number | null
          tier_required?: Database["public"]["Enums"]["loyalty_tier"]
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_enabled?: boolean
          kind?: string
          menu_item_id?: string | null
          min_order_total?: number
          name_ar?: string | null
          name_en?: string
          points_cost?: number
          redeemed_count?: number
          stock_limit?: number | null
          tier_required?: Database["public"]["Enums"]["loyalty_tier"]
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: number
          order_id: string | null
          points: number
          reason: string | null
          type: Database["public"]["Enums"]["loyalty_txn_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: number
          order_id?: string | null
          points: number
          reason?: string | null
          type: Database["public"]["Enums"]["loyalty_txn_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: number
          order_id?: string | null
          points?: number
          reason?: string | null
          type?: Database["public"]["Enums"]["loyalty_txn_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_images: {
        Row: {
          alt_ar: string | null
          alt_en: string | null
          bytes: number | null
          created_at: string
          external_url: string | null
          format: string | null
          height: number | null
          id: string
          menu_item_id: string
          role: string
          sort_order: number
          storage_path: string | null
          width: number | null
        }
        Insert: {
          alt_ar?: string | null
          alt_en?: string | null
          bytes?: number | null
          created_at?: string
          external_url?: string | null
          format?: string | null
          height?: number | null
          id?: string
          menu_item_id: string
          role?: string
          sort_order?: number
          storage_path?: string | null
          width?: number | null
        }
        Update: {
          alt_ar?: string | null
          alt_en?: string | null
          bytes?: number | null
          created_at?: string
          external_url?: string | null
          format?: string | null
          height?: number | null
          id?: string
          menu_item_id?: string
          role?: string
          sort_order?: number
          storage_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_images_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_stock: {
        Row: {
          menu_item_id: string
          quantity_per_unit: number
          stock_item_id: string
        }
        Insert: {
          menu_item_id: string
          quantity_per_unit?: number
          stock_item_id: string
        }
        Update: {
          menu_item_id?: string
          quantity_per_unit?: number
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_stock_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_stock_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[]
          availability_mode: string
          calories: number | null
          category_id: string
          compare_at_price: number | null
          contains_nuts: boolean
          created_at: string
          description_ar: string | null
          description_en: string | null
          has_transparent_png: boolean
          id: string
          image_alt: string | null
          image_url: string | null
          ingredients: string[]
          is_archived: boolean
          is_available: boolean
          is_featured: boolean
          is_spicy: boolean
          is_vegan: boolean
          is_vegetarian: boolean
          name_ar: string | null
          name_en: string
          name_ja: string | null
          prep_minutes: number
          price: number
          restaurant_id: string
          seo_description: string | null
          seo_keywords: string[]
          seo_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allergens?: string[]
          availability_mode?: string
          calories?: number | null
          category_id: string
          compare_at_price?: number | null
          contains_nuts?: boolean
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          has_transparent_png?: boolean
          id?: string
          image_alt?: string | null
          image_url?: string | null
          ingredients?: string[]
          is_archived?: boolean
          is_available?: boolean
          is_featured?: boolean
          is_spicy?: boolean
          is_vegan?: boolean
          is_vegetarian?: boolean
          name_ar?: string | null
          name_en: string
          name_ja?: string | null
          prep_minutes?: number
          price: number
          restaurant_id?: string
          seo_description?: string | null
          seo_keywords?: string[]
          seo_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allergens?: string[]
          availability_mode?: string
          calories?: number | null
          category_id?: string
          compare_at_price?: number | null
          contains_nuts?: boolean
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          has_transparent_png?: boolean
          id?: string
          image_alt?: string | null
          image_url?: string | null
          ingredients?: string[]
          is_archived?: boolean
          is_available?: boolean
          is_featured?: boolean
          is_spicy?: boolean
          is_vegan?: boolean
          is_vegetarian?: boolean
          name_ar?: string | null
          name_en?: string
          name_ja?: string | null
          prep_minutes?: number
          price?: number
          restaurant_id?: string
          seo_description?: string | null
          seo_keywords?: string[]
          seo_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          conversation_id: string
          created_at: string
          id: string
          is_internal_note: boolean
          read_at: string | null
          sender_id: string
          sender_kind: string
        }
        Insert: {
          attachments?: Json
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          read_at?: string | null
          sender_id: string
          sender_kind: string
        }
        Update: {
          attachments?: Json
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          read_at?: string | null
          sender_id?: string
          sender_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          id: string
          is_required: boolean
          max_select: number
          menu_item_id: string
          min_select: number
          name_ar: string | null
          name_en: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_required?: boolean
          max_select?: number
          menu_item_id: string
          min_select?: number
          name_ar?: string | null
          name_en: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_required?: boolean
          max_select?: number
          menu_item_id?: string
          min_select?: number
          name_ar?: string | null
          name_en?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_options: {
        Row: {
          group_id: string
          id: string
          is_available: boolean
          name_ar: string | null
          name_en: string
          price_delta: number
          sort_order: number
        }
        Insert: {
          group_id: string
          id?: string
          is_available?: boolean
          name_ar?: string | null
          name_en: string
          price_delta?: number
          sort_order?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_available?: boolean
          name_ar?: string | null
          name_en?: string
          price_delta?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          broadcast_id: string | null
          created_at: string
          id: number
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          broadcast_id?: string | null
          created_at?: string
          id?: number
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          broadcast_id?: string | null
          created_at?: string
          id?: number
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          menu_item_id: string | null
          modifiers: Json
          name_ar_snapshot: string | null
          name_snapshot: string
          notes: string | null
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          menu_item_id?: string | null
          modifiers?: Json
          name_ar_snapshot?: string | null
          name_snapshot: string
          notes?: string | null
          order_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          menu_item_id?: string | null
          modifiers?: Json
          name_ar_snapshot?: string | null
          name_snapshot?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          changed_by_role: Database["public"]["Enums"]["staff_role"] | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          note: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          changed_by_role?: Database["public"]["Enums"]["staff_role"] | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: number
          note?: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          changed_by_role?: Database["public"]["Enums"]["staff_role"] | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: number
          note?: string | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          address_snapshot: Json | null
          cancel_reason: string | null
          canceled_at: string | null
          created_at: string
          currency: string
          customer_note: string | null
          delivery_fee: number
          discount_total: number
          dispatched_at: string | null
          eta_minutes: number | null
          finished_at: string | null
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          idempotency_key: string
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          points_earned: number
          points_redeemed: number
          prepared_at: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          address_snapshot?: Json | null
          cancel_reason?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string
          customer_note?: string | null
          delivery_fee?: number
          discount_total?: number
          dispatched_at?: string | null
          eta_minutes?: number | null
          finished_at?: string | null
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          idempotency_key: string
          order_number: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          points_earned?: number
          points_redeemed?: number
          prepared_at?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          address_snapshot?: Json | null
          cancel_reason?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string
          customer_note?: string | null
          delivery_fee?: number
          discount_total?: number
          dispatched_at?: string | null
          eta_minutes?: number | null
          finished_at?: string | null
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          idempotency_key?: string
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          points_earned?: number
          points_redeemed?: number
          prepared_at?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      page_content: {
        Row: {
          body: string | null
          created_at: string
          heading: string | null
          id: string
          is_published: boolean
          locale: string
          page_key: string
          restaurant_id: string
          section_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          heading?: string | null
          id?: string
          is_published?: boolean
          locale?: string
          page_key: string
          restaurant_id?: string
          section_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          heading?: string | null
          id?: string
          is_published?: boolean
          locale?: string
          page_key?: string
          restaurant_id?: string
          section_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_content_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      page_seo: {
        Row: {
          created_at: string
          description: string | null
          id: string
          locale: string
          noindex: boolean
          og_image_url: string | null
          page_key: string
          restaurant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          locale?: string
          noindex?: boolean
          og_image_url?: string | null
          page_key: string
          restaurant_id?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          locale?: string
          noindex?: boolean
          og_image_url?: string | null
          page_key?: string
          restaurant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_seo_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
          is_blocked: boolean
          last_seen_at: string | null
          locale: string
          marketing_opt_in: boolean
          notifications_opt_in: boolean
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_blocked?: boolean
          last_seen_at?: string | null
          locale?: string
          marketing_opt_in?: boolean
          notifications_opt_in?: boolean
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          last_seen_at?: string | null
          locale?: string
          marketing_opt_in?: boolean
          notifications_opt_in?: boolean
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          area: string | null
          city: string | null
          country: string | null
          created_at: string
          cuisine_tags: string[]
          currency: string
          description_ar: string | null
          description_en: string | null
          email: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name_ar: string | null
          name_en: string
          opening_hours: Json
          phone: string | null
          slug: string
          social: Json
          story_md: string | null
          tagline_ar: string | null
          tagline_en: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          area?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          cuisine_tags?: string[]
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name_ar?: string | null
          name_en: string
          opening_hours?: Json
          phone?: string | null
          slug: string
          social?: Json
          story_md?: string | null
          tagline_ar?: string | null
          tagline_en?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          area?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          cuisine_tags?: string[]
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name_ar?: string | null
          name_en?: string
          opening_hours?: Json
          phone?: string | null
          slug?: string
          social?: Json
          story_md?: string | null
          tagline_ar?: string | null
          tagline_en?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          display_name: string | null
          is_active: boolean
          login_id: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          login_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          login_id?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          auto_link_availability: boolean
          cost_per_unit: number | null
          created_at: string
          id: string
          last_updated_at: string
          min_threshold: number
          name_ar: string | null
          name_en: string
          notes: string | null
          quantity: number
          status: Database["public"]["Enums"]["stock_status"]
          supplier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          auto_link_availability?: boolean
          cost_per_unit?: number | null
          created_at?: string
          id?: string
          last_updated_at?: string
          min_threshold?: number
          name_ar?: string | null
          name_en: string
          notes?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["stock_status"]
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          auto_link_availability?: boolean
          cost_per_unit?: number | null
          created_at?: string
          id?: string
          last_updated_at?: string
          min_threshold?: number
          name_ar?: string | null
          name_en?: string
          notes?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["stock_status"]
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["stock_direction"]
          id: number
          order_id: string | null
          quantity: number
          reason: string | null
          stock_item_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["stock_direction"]
          id?: number
          order_id?: string | null
          quantity: number
          reason?: string | null
          stock_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["stock_direction"]
          id?: number
          order_id?: string | null
          quantity?: number
          reason?: string | null
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      upsell_rules: {
        Row: {
          created_at: string
          discount_percent: number
          headline_ar: string | null
          headline_en: string | null
          id: string
          is_enabled: boolean
          name: string
          priority: number
          suggest_category_id: string | null
          suggest_kind: string
          suggest_menu_item_id: string | null
          trigger_category_id: string | null
          trigger_kind: string
          trigger_menu_item_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          headline_ar?: string | null
          headline_en?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          priority?: number
          suggest_category_id?: string | null
          suggest_kind: string
          suggest_menu_item_id?: string | null
          trigger_category_id?: string | null
          trigger_kind: string
          trigger_menu_item_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          headline_ar?: string | null
          headline_en?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          priority?: number
          suggest_category_id?: string | null
          suggest_kind?: string
          suggest_menu_item_id?: string | null
          trigger_category_id?: string | null
          trigger_kind?: string
          trigger_menu_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upsell_rules_suggest_category_id_fkey"
            columns: ["suggest_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_rules_suggest_menu_item_id_fkey"
            columns: ["suggest_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_rules_trigger_category_id_fkey"
            columns: ["trigger_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_rules_trigger_menu_item_id_fkey"
            columns: ["trigger_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_backup: { Args: never; Returns: boolean }
      can_broadcast: { Args: never; Returns: boolean }
      can_export: { Args: never; Returns: boolean }
      can_manage_feedback: { Args: never; Returns: boolean }
      can_manage_marketing: { Args: never; Returns: boolean }
      can_manage_orders: { Args: never; Returns: boolean }
      crm_customer_count: { Args: { p_search?: string }; Returns: number }
      crm_customers: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          avg_order_value: number
          created_at: string
          days_since_last_order: number
          email: string
          favorite_items: Json
          full_name: string
          is_blocked: boolean
          last_order_at: string
          last_seen_at: string
          lifetime_value: number
          marketing_opt_in: boolean
          order_count: number
          phone: string
          points_balance: number
          tier: Database["public"]["Enums"]["loyalty_tier"]
          user_id: string
        }[]
      }
      crm_estimate_segment: {
        Args: { p_segment: string; p_value?: number }
        Returns: number
      }
      crm_ordered_item: {
        Args: { p_menu_item_id: string }
        Returns: {
          user_id: string
        }[]
      }
      crm_segment: {
        Args: { p_segment: string; p_value?: number }
        Returns: {
          user_id: string
        }[]
      }
      crm_stats: {
        Args: never
        Returns: {
          at_risk_customers: number
          blocked_customers: number
          customer_count: number
          lifetime_value: number
          marketing_opt_in: number
          repeat_customers: number
        }[]
      }
      current_restaurant_id: { Args: never; Returns: string }
      current_staff_role: {
        Args: never
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      feedback_count: {
        Args: {
          p_category?: Database["public"]["Enums"]["feedback_category"]
          p_search?: string
          p_status?: Database["public"]["Enums"]["feedback_status"]
        }
        Returns: number
      }
      has_role: {
        Args: { required: Database["public"]["Enums"]["staff_role"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      log_audit_event: {
        Args: {
          p_action: string
          p_after?: Json
          p_entity: string
          p_entity_id: string
        }
        Returns: undefined
      }
      next_order_number: { Args: never; Returns: string }
      order_is_editable: {
        Args: { s: Database["public"]["Enums"]["order_status"] }
        Returns: boolean
      }
      order_is_terminal: {
        Args: { s: Database["public"]["Enums"]["order_status"] }
        Returns: boolean
      }
      place_order: {
        Args: {
          p_address_id?: string
          p_customer_note?: string
          p_fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          p_idempotency_key: string
          p_items: Json
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_points_redeem?: number
        }
        Returns: {
          order_id: string
          order_number: string
          reused: boolean
          total: number
        }[]
      }
      recompute_stock_status: { Args: { item_id: string }; Returns: undefined }
      segment_user_ids: {
        Args: { p_segment: string; p_value?: number }
        Returns: string[]
      }
      send_broadcast: {
        Args: {
          p_body: string
          p_channel: Database["public"]["Enums"]["broadcast_channel"]
          p_segment: string
          p_segment_value?: number
          p_title: string
        }
        Returns: {
          broadcast_id: string
          recipients: number
        }[]
      }
      setting_numeric: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
    }
    Enums: {
      backup_kind:
        | "database"
        | "configuration"
        | "menu"
        | "media_refs"
        | "snapshot"
      backup_status: "queued" | "running" | "ready" | "failed"
      broadcast_channel: "in_app" | "email" | "sms" | "push"
      broadcast_status:
        | "draft"
        | "queued"
        | "sending"
        | "sent"
        | "failed"
        | "canceled"
      conversation_status: "open" | "pending" | "closed"
      export_format: "csv" | "json"
      export_status: "queued" | "running" | "ready" | "failed" | "expired"
      feedback_category:
        | "food_quality"
        | "delivery"
        | "service"
        | "overall"
        | "other"
      feedback_status:
        | "new"
        | "reviewed"
        | "responded"
        | "resolved"
        | "archived"
      fulfillment_type: "delivery" | "pickup"
      loyalty_tier: "bronze" | "silver" | "gold" | "platinum"
      loyalty_txn_type:
        | "earn"
        | "redeem"
        | "expire"
        | "adjust"
        | "bonus"
        | "clawback"
      order_status:
        | "new"
        | "accepted"
        | "in_progress"
        | "prepared"
        | "out_for_delivery"
        | "finished"
        | "canceled"
        | "rejected"
        | "failed"
        | "refunded"
      payment_method: "cash_on_delivery" | "card_on_delivery" | "online"
      payment_status: "unpaid" | "authorized" | "paid" | "refunded" | "failed"
      staff_role:
        | "owner"
        | "admin"
        | "manager"
        | "kitchen"
        | "support"
        | "marketing"
      stock_direction: "in" | "out" | "adjust"
      stock_status: "ok" | "low" | "out"
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
      backup_kind: [
        "database",
        "configuration",
        "menu",
        "media_refs",
        "snapshot",
      ],
      backup_status: ["queued", "running", "ready", "failed"],
      broadcast_channel: ["in_app", "email", "sms", "push"],
      broadcast_status: [
        "draft",
        "queued",
        "sending",
        "sent",
        "failed",
        "canceled",
      ],
      conversation_status: ["open", "pending", "closed"],
      export_format: ["csv", "json"],
      export_status: ["queued", "running", "ready", "failed", "expired"],
      feedback_category: [
        "food_quality",
        "delivery",
        "service",
        "overall",
        "other",
      ],
      feedback_status: ["new", "reviewed", "responded", "resolved", "archived"],
      fulfillment_type: ["delivery", "pickup"],
      loyalty_tier: ["bronze", "silver", "gold", "platinum"],
      loyalty_txn_type: [
        "earn",
        "redeem",
        "expire",
        "adjust",
        "bonus",
        "clawback",
      ],
      order_status: [
        "new",
        "accepted",
        "in_progress",
        "prepared",
        "out_for_delivery",
        "finished",
        "canceled",
        "rejected",
        "failed",
        "refunded",
      ],
      payment_method: ["cash_on_delivery", "card_on_delivery", "online"],
      payment_status: ["unpaid", "authorized", "paid", "refunded", "failed"],
      staff_role: [
        "owner",
        "admin",
        "manager",
        "kitchen",
        "support",
        "marketing",
      ],
      stock_direction: ["in", "out", "adjust"],
      stock_status: ["ok", "low", "out"],
    },
  },
} as const
