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
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: number
          user_id?: string
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
      exercicio_substituicao_usuario: {
        Row: {
          created_at: string | null
          data_treino: string | null
          exercicio_novo_id: string | null
          exercicio_novo_usuario_id: string | null
          exercicio_origem_id: string
          grupo_id: string
          id: string
          slot_idx: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_treino?: string | null
          exercicio_novo_id?: string | null
          exercicio_novo_usuario_id?: string | null
          exercicio_origem_id: string
          grupo_id: string
          id?: string
          slot_idx?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_treino?: string | null
          exercicio_novo_id?: string | null
          exercicio_novo_usuario_id?: string | null
          exercicio_origem_id?: string
          grupo_id?: string
          id?: string
          slot_idx?: number
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
          professor_id: string | null
        }
        Insert: {
          created_at?: string | null
          criado_por?: string | null
          id?: string
          nome: string
          professor_id?: string | null
        }
        Update: {
          created_at?: string | null
          criado_por?: string | null
          id?: string
          nome?: string
          professor_id?: string | null
        }
        Relationships: []
      }
      physiq_assinaturas: {
        Row: {
          contexto: string
          created_at: string
          id: string
          mp_preapproval_id: string | null
          status: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          contexto?: string
          created_at?: string
          id?: string
          mp_preapproval_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          contexto?: string
          created_at?: string
          id?: string
          mp_preapproval_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      physiq_avaliacoes: {
        Row: {
          agua_corporal: number | null
          altura: number | null
          created_at: string | null
          created_by: string | null
          data_avaliacao: string
          dobra_1: number | null
          dobra_2: number | null
          dobra_3: number | null
          dobra_4: number | null
          dobra_5: number | null
          dobra_6: number | null
          dobra_7: number | null
          gordura_visceral: number | null
          id: string
          massa_gorda: number | null
          massa_magra: number | null
          massa_muscular: number | null
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
          metodo_avaliacao: string | null
          observacao: string | null
          percentual_gordura: number | null
          peso: number | null
          tmb_balanca: number | null
          tmb_katch: number | null
          tmb_metodo: string | null
          tmb_mifflin: number | null
          user_id: string
        }
        Insert: {
          agua_corporal?: number | null
          altura?: number | null
          created_at?: string | null
          created_by?: string | null
          data_avaliacao?: string
          dobra_1?: number | null
          dobra_2?: number | null
          dobra_3?: number | null
          dobra_4?: number | null
          dobra_5?: number | null
          dobra_6?: number | null
          dobra_7?: number | null
          gordura_visceral?: number | null
          id?: string
          massa_gorda?: number | null
          massa_magra?: number | null
          massa_muscular?: number | null
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
          metodo_avaliacao?: string | null
          observacao?: string | null
          percentual_gordura?: number | null
          peso?: number | null
          tmb_balanca?: number | null
          tmb_katch?: number | null
          tmb_metodo?: string | null
          tmb_mifflin?: number | null
          user_id: string
        }
        Update: {
          agua_corporal?: number | null
          altura?: number | null
          created_at?: string | null
          created_by?: string | null
          data_avaliacao?: string
          dobra_1?: number | null
          dobra_2?: number | null
          dobra_3?: number | null
          dobra_4?: number | null
          dobra_5?: number | null
          dobra_6?: number | null
          dobra_7?: number | null
          gordura_visceral?: number | null
          id?: string
          massa_gorda?: number | null
          massa_magra?: number | null
          massa_muscular?: number | null
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
          metodo_avaliacao?: string | null
          observacao?: string | null
          percentual_gordura?: number | null
          peso?: number | null
          tmb_balanca?: number | null
          tmb_katch?: number | null
          tmb_metodo?: string | null
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
      physiq_avisos_plano: {
        Row: {
          canal: string
          ciclo_vence_em: string
          dia: number
          enviado_em: string
          id: number
          mensagem: string | null
          professor_id: string
        }
        Insert: {
          canal?: string
          ciclo_vence_em: string
          dia: number
          enviado_em?: string
          id?: number
          mensagem?: string | null
          professor_id: string
        }
        Update: {
          canal?: string
          ciclo_vence_em?: string
          dia?: number
          enviado_em?: string
          id?: number
          mensagem?: string | null
          professor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "physiq_avisos_plano_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "physiq_professores"
            referencedColumns: ["id"]
          },
        ]
      }
      physiq_convites: {
        Row: {
          aceito_em: string | null
          criado_por: string | null
          email: string
          enviado_em: string
          id: string
          papel: string
          professor_id: string | null
          status: string
        }
        Insert: {
          aceito_em?: string | null
          criado_por?: string | null
          email: string
          enviado_em?: string
          id?: string
          papel?: string
          professor_id?: string | null
          status?: string
        }
        Update: {
          aceito_em?: string | null
          criado_por?: string | null
          email?: string
          enviado_em?: string
          id?: string
          papel?: string
          professor_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "physiq_convites_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "physiq_professores"
            referencedColumns: ["id"]
          },
        ]
      }
      physiq_espelho_membros: {
        Row: {
          ativo: boolean
          atualizado_em: string
          conta_id: string
          papeis: string[]
          treino_user_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          conta_id: string
          papeis?: string[]
          treino_user_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          conta_id?: string
          papeis?: string[]
          treino_user_id?: string
        }
        Relationships: []
      }
      physiq_identidade_conflitos: {
        Row: {
          criado_em: string
          email: string
          motivo: string
          principal_user_id: string
          resolvido_em: string | null
          tentativas: number
          treino_user_id: string | null
          ultima_em: string
        }
        Insert: {
          criado_em?: string
          email: string
          motivo?: string
          principal_user_id: string
          resolvido_em?: string | null
          tentativas?: number
          treino_user_id?: string | null
          ultima_em?: string
        }
        Update: {
          criado_em?: string
          email?: string
          motivo?: string
          principal_user_id?: string
          resolvido_em?: string | null
          tentativas?: number
          treino_user_id?: string | null
          ultima_em?: string
        }
        Relationships: []
      }
      physiq_identidades: {
        Row: {
          criado_em: string
          email: string | null
          origem: string
          principal_user_id: string
          treino_user_id: string
          visto_em: string | null
        }
        Insert: {
          criado_em?: string
          email?: string | null
          origem: string
          principal_user_id: string
          treino_user_id: string
          visto_em?: string | null
        }
        Update: {
          criado_em?: string
          email?: string | null
          origem?: string
          principal_user_id?: string
          treino_user_id?: string
          visto_em?: string | null
        }
        Relationships: []
      }
      physiq_integracoes: {
        Row: {
          atualizado_em: string
          config: Json
          professor_id: string
          status: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          config?: Json
          professor_id: string
          status?: string
          tipo?: string
        }
        Update: {
          atualizado_em?: string
          config?: Json
          professor_id?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "physiq_integracoes_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: true
            referencedRelation: "physiq_professores"
            referencedColumns: ["id"]
          },
        ]
      }
      physiq_pagamentos: {
        Row: {
          comprovante_path: string | null
          confirmado_por: string | null
          contexto: string
          created_at: string
          id: string
          mes_ref: string
          metodo: string | null
          mp_payment_id: string | null
          pix_expira_em: string | null
          pix_qr_code: string | null
          pix_qr_code_base64: string | null
          plano_id: string | null
          recusado_motivo: string | null
          status: string
          tipo: string
          tipo_cobranca: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          comprovante_path?: string | null
          confirmado_por?: string | null
          contexto?: string
          created_at?: string
          id?: string
          mes_ref: string
          metodo?: string | null
          mp_payment_id?: string | null
          pix_expira_em?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          plano_id?: string | null
          recusado_motivo?: string | null
          status?: string
          tipo: string
          tipo_cobranca?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          comprovante_path?: string | null
          confirmado_por?: string | null
          contexto?: string
          created_at?: string
          id?: string
          mes_ref?: string
          metodo?: string | null
          mp_payment_id?: string | null
          pix_expira_em?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          plano_id?: string | null
          recusado_motivo?: string | null
          status?: string
          tipo?: string
          tipo_cobranca?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      physiq_planos: {
        Row: {
          created_at: string
          id: string
          nome: string
          professor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          professor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          professor_id?: string | null
        }
        Relationships: []
      }
      physiq_planos_professor: {
        Row: {
          ativo: boolean
          atualizado_em: string
          created_at: string
          id: string
          max_alunos: number | null
          min_alunos: number
          nome: string
          ordem: number
          valor_anual: number | null
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          created_at?: string
          id?: string
          max_alunos?: number | null
          min_alunos?: number
          nome: string
          ordem?: number
          valor_anual?: number | null
          valor_mensal: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          created_at?: string
          id?: string
          max_alunos?: number | null
          min_alunos?: number
          nome?: string
          ordem?: number
          valor_anual?: number | null
          valor_mensal?: number
        }
        Relationships: []
      }
      physiq_planos_professor_hist: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          antes: Json | null
          depois: Json | null
          id: number
          plano_id: string | null
          professor_id: string | null
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          antes?: Json | null
          depois?: Json | null
          id?: number
          plano_id?: string | null
          professor_id?: string | null
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          antes?: Json | null
          depois?: Json | null
          id?: number
          plano_id?: string | null
          professor_id?: string | null
        }
        Relationships: []
      }
      physiq_professores: {
        Row: {
          acesso_liberado_ate: string | null
          adesao_paga_em: string | null
          alunos_bloqueados_em: string | null
          alunos_bloqueados_msg: string | null
          anual_ate: string | null
          ciclo_inicio: string | null
          ciclo_valor: number | null
          ciclo_vence_em: string | null
          cobranca_pausada: boolean
          codigo_convite: string
          created_at: string
          email: string | null
          foto_url: string | null
          id: string
          nome: string
          nucleo_acesso_ate: string | null
          pix_banco: string | null
          pix_chave: string | null
          pix_exibir: boolean
          pix_favorecido: string | null
          pix_tipo: string | null
          plano_id: string | null
          status: string
          trial_ate: string | null
        }
        Insert: {
          acesso_liberado_ate?: string | null
          adesao_paga_em?: string | null
          alunos_bloqueados_em?: string | null
          alunos_bloqueados_msg?: string | null
          anual_ate?: string | null
          ciclo_inicio?: string | null
          ciclo_valor?: number | null
          ciclo_vence_em?: string | null
          cobranca_pausada?: boolean
          codigo_convite: string
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id: string
          nome: string
          nucleo_acesso_ate?: string | null
          pix_banco?: string | null
          pix_chave?: string | null
          pix_exibir?: boolean
          pix_favorecido?: string | null
          pix_tipo?: string | null
          plano_id?: string | null
          status?: string
          trial_ate?: string | null
        }
        Update: {
          acesso_liberado_ate?: string | null
          adesao_paga_em?: string | null
          alunos_bloqueados_em?: string | null
          alunos_bloqueados_msg?: string | null
          anual_ate?: string | null
          ciclo_inicio?: string | null
          ciclo_valor?: number | null
          ciclo_vence_em?: string | null
          cobranca_pausada?: boolean
          codigo_convite?: string
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          nucleo_acesso_ate?: string | null
          pix_banco?: string | null
          pix_chave?: string | null
          pix_exibir?: boolean
          pix_favorecido?: string | null
          pix_tipo?: string | null
          plano_id?: string | null
          status?: string
          trial_ate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "physiq_professores_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "physiq_planos_professor"
            referencedColumns: ["id"]
          },
        ]
      }
      physiq_profiles: {
        Row: {
          admin_locked: boolean | null
          agua_corporal: number | null
          ajuste_calorico: number | null
          altura: number | null
          cobranca_pausada: boolean
          conta_id: string | null
          created_at: string | null
          data_nascimento: string | null
          dobra_1: number | null
          dobra_2: number | null
          dobra_3: number | null
          dobra_4: number | null
          dobra_5: number | null
          dobra_6: number | null
          dobra_7: number | null
          email: string | null
          foto_url: string | null
          gordura_visceral: number | null
          id: string
          idade: number | null
          macro_gordura_percentual: number | null
          macro_proteina_multiplicador: number | null
          massa_gorda: number | null
          massa_magra: number | null
          massa_muscular: number | null
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
          mensalidade_valor: number | null
          metodo_avaliacao: string | null
          nivel_atividade: number | null
          nome: string | null
          percentual_gordura: number | null
          peso: number | null
          plano_expiracao: string | null
          plano_nome: string | null
          professor_id: string | null
          proxima_avaliacao: string | null
          proxima_troca_treino: string | null
          series_modo: string
          series_padrao_qtd: number
          series_travadas: boolean
          sexo: string | null
          status: string | null
          tempo_descanso_segundos: number | null
          tmb_balanca: number | null
          tmb_katch: number | null
          tmb_metodo: string | null
          tmb_mifflin: number | null
          user_code: number | null
        }
        Insert: {
          admin_locked?: boolean | null
          agua_corporal?: number | null
          ajuste_calorico?: number | null
          altura?: number | null
          cobranca_pausada?: boolean
          conta_id?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          dobra_1?: number | null
          dobra_2?: number | null
          dobra_3?: number | null
          dobra_4?: number | null
          dobra_5?: number | null
          dobra_6?: number | null
          dobra_7?: number | null
          email?: string | null
          foto_url?: string | null
          gordura_visceral?: number | null
          id: string
          idade?: number | null
          macro_gordura_percentual?: number | null
          macro_proteina_multiplicador?: number | null
          massa_gorda?: number | null
          massa_magra?: number | null
          massa_muscular?: number | null
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
          mensalidade_valor?: number | null
          metodo_avaliacao?: string | null
          nivel_atividade?: number | null
          nome?: string | null
          percentual_gordura?: number | null
          peso?: number | null
          plano_expiracao?: string | null
          plano_nome?: string | null
          professor_id?: string | null
          proxima_avaliacao?: string | null
          proxima_troca_treino?: string | null
          series_modo?: string
          series_padrao_qtd?: number
          series_travadas?: boolean
          sexo?: string | null
          status?: string | null
          tempo_descanso_segundos?: number | null
          tmb_balanca?: number | null
          tmb_katch?: number | null
          tmb_metodo?: string | null
          tmb_mifflin?: number | null
          user_code?: number | null
        }
        Update: {
          admin_locked?: boolean | null
          agua_corporal?: number | null
          ajuste_calorico?: number | null
          altura?: number | null
          cobranca_pausada?: boolean
          conta_id?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          dobra_1?: number | null
          dobra_2?: number | null
          dobra_3?: number | null
          dobra_4?: number | null
          dobra_5?: number | null
          dobra_6?: number | null
          dobra_7?: number | null
          email?: string | null
          foto_url?: string | null
          gordura_visceral?: number | null
          id?: string
          idade?: number | null
          macro_gordura_percentual?: number | null
          macro_proteina_multiplicador?: number | null
          massa_gorda?: number | null
          massa_magra?: number | null
          massa_muscular?: number | null
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
          mensalidade_valor?: number | null
          metodo_avaliacao?: string | null
          nivel_atividade?: number | null
          nome?: string | null
          percentual_gordura?: number | null
          peso?: number | null
          plano_expiracao?: string | null
          plano_nome?: string | null
          professor_id?: string | null
          proxima_avaliacao?: string | null
          proxima_troca_treino?: string | null
          series_modo?: string
          series_padrao_qtd?: number
          series_travadas?: boolean
          sexo?: string | null
          status?: string | null
          tempo_descanso_segundos?: number | null
          tmb_balanca?: number | null
          tmb_katch?: number | null
          tmb_metodo?: string | null
          tmb_mifflin?: number | null
          user_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "physiq_profiles_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "physiq_professores"
            referencedColumns: ["id"]
          },
        ]
      }
      physiq_recebimentos: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          pix_banco: string | null
          pix_chave: string | null
          pix_favorecido: string | null
          pix_tipo: string | null
          professor_id: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          pix_banco?: string | null
          pix_chave?: string | null
          pix_favorecido?: string | null
          pix_tipo?: string | null
          professor_id: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          pix_banco?: string | null
          pix_chave?: string | null
          pix_favorecido?: string | null
          pix_tipo?: string | null
          professor_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "physiq_recebimentos_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "physiq_professores"
            referencedColumns: ["id"]
          },
        ]
      }
      physiq_registros_fotos: {
        Row: {
          created_at: string
          id: string
          mes_ref: string
          storage_path: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mes_ref: string
          storage_path: string
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mes_ref?: string
          storage_path?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      physiq_tags: {
        Row: {
          cor: string
          created_at: string | null
          id: string
          nome: string
          professor_id: string | null
        }
        Insert: {
          cor?: string
          created_at?: string | null
          id?: string
          nome: string
          professor_id?: string | null
        }
        Update: {
          cor?: string
          created_at?: string | null
          id?: string
          nome?: string
          professor_id?: string | null
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
      tb_academia_pesos: {
        Row: {
          academia_id: string
          exercicio_id: string | null
          exercicio_usuario_id: string | null
          id: string
          numero_serie: number
          peso: number
          updated_at: string
          user_id: string
        }
        Insert: {
          academia_id: string
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          id?: string
          numero_serie: number
          peso?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          academia_id?: string
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          id?: string
          numero_serie?: number
          peso?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_academia_pesos_academia_id_fkey"
            columns: ["academia_id"]
            isOneToOne: false
            referencedRelation: "tb_academias"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_academias: {
        Row: {
          created_at: string
          equipamentos: string[] | null
          id: string
          nome: string
          user_id: string
        }
        Insert: {
          created_at?: string
          equipamentos?: string[] | null
          id?: string
          nome: string
          user_id: string
        }
        Update: {
          created_at?: string
          equipamentos?: string[] | null
          id?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
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
          dica: string | null
          emoji: string | null
          equipamento: string | null
          grupo_muscular: string
          id: string
          imagem_url: string | null
          nome: string
          padrao_movimento: string | null
          professor_id: string | null
          subgrupo: string | null
          tipo: string
          variacao: string | null
        }
        Insert: {
          created_at?: string | null
          dica?: string | null
          emoji?: string | null
          equipamento?: string | null
          grupo_muscular: string
          id?: string
          imagem_url?: string | null
          nome: string
          padrao_movimento?: string | null
          professor_id?: string | null
          subgrupo?: string | null
          tipo?: string
          variacao?: string | null
        }
        Update: {
          created_at?: string | null
          dica?: string | null
          emoji?: string | null
          equipamento?: string | null
          grupo_muscular?: string
          id?: string
          imagem_url?: string | null
          nome?: string
          padrao_movimento?: string | null
          professor_id?: string | null
          subgrupo?: string | null
          tipo?: string
          variacao?: string | null
        }
        Relationships: []
      }
      tb_exercicios_usuario: {
        Row: {
          created_at: string | null
          emoji: string | null
          equipamento: string | null
          grupo_muscular: string
          id: string
          nome: string
          padrao_movimento: string | null
          tipo: string
          updated_at: string | null
          user_id: string
          variacao: string | null
        }
        Insert: {
          created_at?: string | null
          emoji?: string | null
          equipamento?: string | null
          grupo_muscular: string
          id?: string
          nome: string
          padrao_movimento?: string | null
          tipo?: string
          updated_at?: string | null
          user_id: string
          variacao?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string | null
          equipamento?: string | null
          grupo_muscular?: string
          id?: string
          nome?: string
          padrao_movimento?: string | null
          tipo?: string
          updated_at?: string | null
          user_id?: string
          variacao?: string | null
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
          professor_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
          professor_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          professor_id?: string | null
        }
        Relationships: []
      }
      tb_grupos_treino_perfis: {
        Row: {
          created_at: string
          grupo_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grupo_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grupo_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_grupos_treino_perfis_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino"
            referencedColumns: ["id"]
          },
        ]
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
      tb_pastas_treino: {
        Row: {
          created_at: string
          id: string
          nome: string
          professor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          professor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          professor_id?: string | null
        }
        Relationships: []
      }
      tb_pastas_treino_grupos: {
        Row: {
          created_at: string
          grupo_id: string
          id: string
          pasta_id: string
        }
        Insert: {
          created_at?: string
          grupo_id: string
          id?: string
          pasta_id: string
        }
        Update: {
          created_at?: string
          grupo_id?: string
          id?: string
          pasta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_pastas_treino_grupos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_pastas_treino_grupos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "tb_pastas_treino"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_semana_dia_config: {
        Row: {
          alternado: boolean
          alternado_inicio: string | null
          dia_semana: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alternado?: boolean
          alternado_inicio?: string | null
          dia_semana: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alternado?: boolean
          alternado_inicio?: string | null
          dia_semana?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tb_semana_treinos: {
        Row: {
          dia_semana: string
          extra: boolean
          extra_atrelado_grupo_id: string | null
          extra_atrelado_grupo_usuario_id: string | null
          grupo_id: string | null
          grupo_usuario_id: string | null
          id: string
          slot_idx: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          dia_semana: string
          extra?: boolean
          extra_atrelado_grupo_id?: string | null
          extra_atrelado_grupo_usuario_id?: string | null
          grupo_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          slot_idx?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          dia_semana?: string
          extra?: boolean
          extra_atrelado_grupo_id?: string | null
          extra_atrelado_grupo_usuario_id?: string | null
          grupo_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          slot_idx?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb_semana_treinos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_semana_treinos_grupo_usuario_id_fkey"
            columns: ["grupo_usuario_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_series_padrao_usuario: {
        Row: {
          carga_sugerida_kg: number | null
          descanso_segundos: number | null
          exercicio_id: string | null
          exercicio_usuario_id: string | null
          grupo_id: string | null
          grupo_usuario_id: string | null
          id: string
          num_series: number
          observacao: string | null
          reps_alvo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          carga_sugerida_kg?: number | null
          descanso_segundos?: number | null
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          grupo_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          num_series?: number
          observacao?: string | null
          reps_alvo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          carga_sugerida_kg?: number | null
          descanso_segundos?: number | null
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          grupo_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          num_series?: number
          observacao?: string | null
          reps_alvo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_series_padrao_usuario_exercicio_id_fkey"
            columns: ["exercicio_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_series_padrao_usuario_exercicio_usuario_id_fkey"
            columns: ["exercicio_usuario_id"]
            isOneToOne: false
            referencedRelation: "tb_exercicios_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_series_padrao_usuario_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_series_padrao_usuario_grupo_usuario_id_fkey"
            columns: ["grupo_usuario_id"]
            isOneToOne: false
            referencedRelation: "tb_grupos_treino_usuario"
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
          slot_idx: number
          user_id: string
        }
        Insert: {
          concluido?: boolean | null
          created_at?: string | null
          data_treino: string
          id?: string
          slot_idx?: number
          user_id: string
        }
        Update: {
          concluido?: boolean | null
          created_at?: string | null
          data_treino?: string
          id?: string
          slot_idx?: number
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
          slot_idx: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_treino: string
          grupo_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          slot_idx?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_treino?: string
          grupo_id?: string | null
          grupo_usuario_id?: string | null
          id?: string
          slot_idx?: number
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
          academia_nome: string | null
          concluida: boolean | null
          created_at: string | null
          data_treino: string
          distancia_km: number | null
          exercicio_id: string | null
          exercicio_usuario_id: string | null
          id: string
          numero_serie: number
          pace_segundos_km: number | null
          peso: number | null
          reps: number | null
          slot_idx: number
          tempo_segundos: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          academia_nome?: string | null
          concluida?: boolean | null
          created_at?: string | null
          data_treino: string
          distancia_km?: number | null
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          id?: string
          numero_serie: number
          pace_segundos_km?: number | null
          peso?: number | null
          reps?: number | null
          slot_idx?: number
          tempo_segundos?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          academia_nome?: string | null
          concluida?: boolean | null
          created_at?: string | null
          data_treino?: string
          distancia_km?: number | null
          exercicio_id?: string | null
          exercicio_usuario_id?: string | null
          id?: string
          numero_serie?: number
          pace_segundos_km?: number | null
          peso?: number | null
          reps?: number | null
          slot_idx?: number
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
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_max_count: number
          p_user_id: string
          p_window_secs: number
        }
        Returns: boolean
      }
      physiq_aluno_bloqueado: { Args: { uid: string }; Returns: boolean }
      physiq_auth_user_id_por_email: {
        Args: { p_email: string }
        Returns: string
      }
      physiq_avisos_tolerancia: { Args: never; Returns: number }
      physiq_gerar_codigo_professor: {
        Args: { p_nome: string }
        Returns: string
      }
      physiq_is_master: { Args: never; Returns: boolean }
      physiq_is_staff: { Args: never; Returns: boolean }
      physiq_meu_professor: {
        Args: never
        Returns: {
          alunos_bloqueados: boolean
          alunos_bloqueados_msg: string
          id: string
          nome: string
          pix_banco: string
          pix_chave: string
          pix_favorecido: string
          pix_tipo: string
        }[]
      }
      physiq_papel: { Args: never; Returns: string }
      physiq_professor_acesso_ok: { Args: { pid: string }; Returns: boolean }
      physiq_professor_pode_convidar: {
        Args: { pid: string }
        Returns: boolean
      }
      physiq_recebimentos_ativar: {
        Args: { p_id?: string; p_tipo?: string }
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
