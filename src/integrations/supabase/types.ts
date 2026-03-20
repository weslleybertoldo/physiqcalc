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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          created_at: string | null
          id: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      exercicio_ordem_usuario: {
        Row: {
          exercicio_id: string
          grupo_id: string
          id: string
          posicao: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          exercicio_id: string
          grupo_id: string
          id?: string
          posicao: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          exercicio_id?: string
          grupo_id?: string
          id?: string
          posicao?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      grupos_musculares: {
        Row: {
          created_at: string | null
          criado_por: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          criado_por?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          criado_por?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      physiq_avaliacoes: {
        Row: {
          altura: number | null
          created_at: string | null
          created_by: string | null
          data_avaliacao: string
          dobra_1: number | null
          dobra_2: number | null
          dobra_3: number | null
          id: string
          massa_gorda: number | null
          massa_magra: number | null
          medida_abdomen: number | null
          medida_antebraco_d: number | null
          medida_antebraco_e: number | null
          medida_braco_d: number | null
          medida_braco_e: number | null
          medida_cintura: number | null
          medida_coxa_d: number | null
          medida_coxa_e: number | null
          medida_ombro: number | null
          medida_panturrilha_d: number | null
          medida_panturrilha_e: number | null
          medida_peitoral: number | null
          medida_pescoco: number | null
          medida_quadril: number | null
          observacao: string | null
          percentual_gordura: number | null
          peso: number | null
          tmb_katch: number | null
          tmb_mifflin: number | null
          user_id: string
        }
        Insert: {
          altura?: number | null
          created_at?: string | null
          created_by?: string | null
          data_avaliacao?: string
          dobra_1?: number | null
          dobra_2?: number | null
          dobra_3?: number | null
          id?: string
          massa_gorda?: number | null
          massa_magra?: number | null
          medida_abdomen?: number | null
          medida_antebraco_d?: number | null
          medida_antebraco_e?: number | null
          medida_braco_d?: number | null
          medida_braco_e?: number | null
          medida_cintura?: number | null
          medida_coxa_d?: number | null
          medida_coxa_e?: number | null
          medida_ombro?: number | null
          medida_panturrilha_d?: number | null
          medida_panturrilha_e?: number | null
          medida_peitoral?: number | null
          medida_pescoco?: number | null
          medida_quadril?: number | null
          observacao?: string | null
          percentual_gordura?: number | null
          peso?: number | null
          tmb_katch?: number | null
          tmb_mifflin?: number | null
          user_id: string
        }
        Update: {
          altura?: number | null
          created_at?: string | null
          created_by?: string | null
          data_avaliacao?: string
          dobra_1?: number | null
          dobra_2?: number | null
          dobra_3?: number | null
          id?: string
          massa_gorda?: number | null
          massa_magra?: number | null
          medida_abdomen?: number | null
          medida_antebraco_d?: number | null
          medida_antebraco_e?: number | null
          medida_braco_d?: number | null
          medida_braco_e?: number | null
          medida_cintura?: number | null
          medida_coxa_d?: number | null
          medida_coxa_e?: number | null
          medida_ombro?: number | null
          medida_panturrilha_d?: number | null
          medida_panturrilha_e?: number | null
          medida_peitoral?: number | null
          medida_pescoco?: number | null
          medida_quadril?: number | null
          observacao?: string | null
          percentual_gordura?: number | null
          peso?: number | null
          tmb_katch?: number | null
          tmb_mifflin?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "physiq_avaliacoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      physiq_profiles: {
        Row: {
          admin_locked: boolean | null
          ajuste_calorico: number | null
          altura: number | null
          created_at: string | null
          data_nascimento: string | null
          dobra_1: number | null
          dobra_2: number | null
          dobra_3: number | null
          email: string | null
          foto_url: string | null
          id: string
          idade: number | null
          macro_gordura_percentual: number | null
          macro_proteina_multiplicador: number | null
          massa_gorda: number | null
          massa_magra: number | null
          medida_abdomen: number | null
          medida_antebraco_d: number | null
          medida_antebraco_e: number | null
          medida_braco_d: number | null
          medida_braco_e: number | null
          medida_cintura: number | null
          medida_coxa_d: number | null
          medida_coxa_e: number | null
          medida_ombro: number | null
          medida_panturrilha_d: number | null
          medida_panturrilha_e: number | null
          medida_peitoral: number | null
          medida_pescoco: number | null
          medida_quadril: number | null
          nivel_atividade: number | null
          nome: string | null
          percentual_gordura: number | null
          peso: number | null
          plano_expiracao: string | null
          plano_nome: string | null
          sexo: string | null
          status: string | null
          tempo_descanso_segundos: number | null
          tmb_katch: number | null
          tmb_metodo: string | null
          tmb_mifflin: number | null
          user_code: number | null
        }
        Insert: {
          admin_locked?: boolean | null
          ajuste_calorico?: number | null
          altura?: number | null
          created_at?: string | null
          data_nascimento?: string | null
          dobra_1?: number | null
          dobra_2?: number | null
          dobra_3?: number | null
          email?: string | null
          foto_url?: string | null
          id: string
          idade?: number | null
          macro_gordura_percentual?: number | null
          macro_proteina_multiplicador?: number | null
          massa_gorda?: number | null
          massa_magra?: number | null
          medida_abdomen?: number | null
          medida_antebraco_d?: number | null
          medida_antebraco_e?: number | null
          medida_braco_d?: number | null
          medida_braco_e?: number | null
          medida_cintura?: number | null
          medida_coxa_d?: number | null
          medida_coxa_e?: number | null
          medida_ombro?: number | null
          medida_panturrilha_d?: number | null
          medida_panturrilha_e?: number | null
          medida_peitoral?: number | null
          medida_pescoco?: number | null
          medida_quadril?: number | null
          nivel_atividade?: number | null
          nome?: string | null
          percentual_gordura?: number | null
          peso?: number | null
          plano_expiracao?: string | null
          plano_nome?: string | null
          sexo?: string | null
          status?: string | null
          tempo_descanso_segundos?: number | null
          tmb_katch?: number | null
          tmb_metodo?: string | null
          tmb_mifflin?: number | null
          user_code?: number | null
        }
        Update: {
          admin_locked?: boolean | null
          ajuste_calorico?: number | null
          altura?: number | null
          created_at?: string | null
          data_nascimento?: string | null
          dobra_1?: number | null
          dobra_2?: number | null
          dobra_3?: number | null
          email?: string | null
          foto_url?: string | null
          id?: string
          idade?: number | null
          macro_gordura_percentual?: number | null
          macro_proteina_multiplicador?: number | null
          massa_gorda?: number | null
          massa_magra?: number | null
          medida_abdomen?: number | null
          medida_antebraco_d?: number | null
          medida_antebraco_e?: number | null
          medida_braco_d?: number | null
          medida_braco_e?: number | null
          medida_cintura?: number | null
          medida_coxa_d?: number | null
          medida_coxa_e?: number | null
          medida_ombro?: number | null
          medida_panturrilha_d?: number | null
          medida_panturrilha_e?: number | null
          medida_peitoral?: number | null
          medida_pescoco?: number | null
          medida_quadril?: number | null
          nivel_atividade?: number | null
          nome?: string | null
          percentual_gordura?: number | null
          peso?: number | null
          plano_expiracao?: string | null
          plano_nome?: string | null
          sexo?: string | null
          status?: string | null
          tempo_descanso_segundos?: number | null
          tmb_katch?: number | null
          tmb_metodo?: string | null
          tmb_mifflin?: number | null
          user_code?: number | null
        }
        Relationships: []
      }
      physiq_tags: {
        Row: {
          cor: string
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      physiq_user_tags: {
        Row: {
          created_at: string | null
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "physiq_user_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "physiq_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physiq_user_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_exercicio_comentarios: {
        Row: {
          comentario: string
          created_at: string | null
          exercicio_id: string | null
          exercicio_usuario_id: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comentario: string
          created_at?: string | null
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comentario?: string
          created_at?: string | null
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_exercicio_comentarios_exercicio_id_fkey"
            columns: ["exercicio_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_exercicio_comentarios_exercicio_usuario_id_fkey"
            columns: ["exercicio_usuario_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_exercicios: {
        Row: {
          created_at: string | null
          emoji: string | null
          grupo_muscular: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          grupo_muscular: string
          id?: string
          nome: string
          tipo?: string
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          grupo_muscular?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      tb_exercicios_usuario: {
        Row: {
          created_at: string | null
          emoji: string | null
          grupo_muscular: string
          id: string
          nome: string
          tipo: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          grupo_muscular: string
          id?: string
          nome: string
          tipo?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          grupo_muscular?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_exercicios_usuario_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_grupos_exercicios: {
        Row: {
          exercicio_id: string
          grupo_id: string
          id: string
          ordem: number | null
        }
        Insert: {
          exercicio_id: string
          grupo_id: string
          id?: string
          ordem?: number | null
        }
        Update: {
          exercicio_id?: string
          grupo_id?: string
          id?: string
          ordem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tb_grupos_exercicios_exercicio_id_fkey"
            columns: ["exercicio_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_grupos_exercicios_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_grupos_exercicios_usuario: {
        Row: {
          exercicio_id: string | null
          exercicio_usuario_id: string | null
          grupo_usuario_id: string | null
          id: string
          ordem: number | null
          user_id: string
        }
        Insert: {
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          ordem?: number | null
          user_id: string
        }
        Update: {
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          ordem?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_grupos_exercicios_usuario_exercicio_id_fkey"
            columns: ["exercicio_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_grupos_exercicios_usuario_exercicio_usuario_id_fkey"
            columns: ["exercicio_usuario_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_grupos_exercicios_usuario_grupo_usuario_id_fkey"
            columns: ["grupo_usuario_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_grupos_exercicios_usuario_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_grupos_treino: {
        Row: {
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tb_grupos_treino_usuario: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_grupos_treino_usuario_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_semana_treinos: {
        Row: {
          dia_semana: string
          grupo_id: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          dia_semana: string
          grupo_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          dia_semana?: string
          grupo_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb_semana_treinos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_treino_concluido: {
        Row: {
          concluido: boolean | null
          created_at: string | null
          data_treino: string
          id: string
          user_id: string
        }
        Insert: {
          concluido?: boolean | null
          created_at?: string | null
          data_treino: string
          id?: string
          user_id: string
        }
        Update: {
          concluido?: boolean | null
          created_at?: string | null
          data_treino?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_treino_concluido_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_treino_dia_override: {
        Row: {
          created_at: string | null
          data_treino: string
          grupo_id: string | null
          grupo_usuario_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_treino: string
          grupo_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_treino?: string
          grupo_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_treino_dia_override_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_treino_dia_override_grupo_usuario_id_fkey"
            columns: ["grupo_usuario_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_treino_dia_override_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_treino_series: {
        Row: {
          concluida: boolean | null
          created_at: string | null
          data_treino: string
          distancia_km: number | null
          exercicio_id: string
          exercicio_usuario_id: string | null
          id: string
          numero_serie: number
          pace_segundos_km: number | null
          peso: number | null
          reps: number | null
          tempo_segundos: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          concluida?: boolean | null
          created_at?: string | null
          data_treino: string
          distancia_km?: number | null
          exercicio_id: string
          exercicio_usuario_id?: string | null
          id?: string
          numero_serie: number
          pace_segundos_km?: number | null
          peso?: number | null
          reps?: number | null
          tempo_segundos?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          concluida?: boolean | null
          created_at?: string | null
          data_treino?: string
          distancia_km?: number | null
          exercicio_id?: string
          exercicio_usuario_id?: string | null
          id?: string
          numero_serie?: number
          pace_segundos_km?: number | null
          peso?: number | null
          reps?: number | null
          tempo_segundos?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_treino_series_exercicio_id_fkey"
            columns: ["exercicio_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_treino_series_exercicio_usuario_id_fkey"
            columns: ["exercicio_usuario_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_treino_series_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      treino_historico: {
        Row: {
          concluido_em: string
          created_at: string | null
          duracao_segundos: number
          exercicios_concluidos: Json | null
          id: string
          iniciado_em: string
          nome_treino: string
          user_id: string
        }
        Insert: {
          concluido_em: string
          created_at?: string | null
          duracao_segundos: number
          exercicios_concluidos?: Json | null
          id?: string
          iniciado_em: string
          nome_treino: string
          user_id: string
        }
        Update: {
          concluido_em?: string
          created_at?: string | null
          duracao_segundos?: number
          exercicios_concluidos?: Json | null
          id?: string
          iniciado_em?: string
          nome_treino?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treino_historico_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "physiq_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
