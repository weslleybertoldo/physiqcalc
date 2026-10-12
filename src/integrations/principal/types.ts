// Tipos do BANCO PRINCIPAL (Supabase hkxvtsbwctxkrqzkkdoz, schema public — o staging tem o mesmo desenho).
// Gerado pela Management API (GET /v1/projects/<ref>/types/typescript?included_schemas=public) depois da migração W2.
// Não editar à mão: gerar de novo quando uma migração do principal mudar tabelas.
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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      aceites: {
        Row: {
          conta_id: string | null
          documento: string
          em: string
          evento: string
          id: string
          origem: string
          paciente_id: string | null
          registrado_por: string
          responsavel_forma: string | null
          responsavel_nome: string | null
          responsavel_vinculo: string | null
          user_id: string | null
          versao: string
          versao_app: string | null
        }
        Insert: {
          conta_id?: string | null
          documento: string
          em?: string
          evento?: string
          id?: string
          origem: string
          paciente_id?: string | null
          registrado_por: string
          responsavel_forma?: string | null
          responsavel_nome?: string | null
          responsavel_vinculo?: string | null
          user_id?: string | null
          versao: string
          versao_app?: string | null
        }
        Update: {
          conta_id?: string | null
          documento?: string
          em?: string
          evento?: string
          id?: string
          origem?: string
          paciente_id?: string | null
          registrado_por?: string
          responsavel_forma?: string | null
          responsavel_nome?: string | null
          responsavel_vinculo?: string | null
          user_id?: string | null
          versao?: string
          versao_app?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aceites_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aceites_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_config: {
        Row: {
          atende_fim: string
          atende_inicio: string
          created_at: string
          desistencia: boolean
          dias: number[]
          janela_reagendamento: string
          profissional_id: string
          reagendamentos_max: number
          slot_minutos: number
          updated_at: string
        }
        Insert: {
          atende_fim?: string
          atende_inicio?: string
          created_at?: string
          desistencia?: boolean
          dias?: number[]
          janela_reagendamento?: string
          profissional_id: string
          reagendamentos_max?: number
          slot_minutos?: number
          updated_at?: string
        }
        Update: {
          atende_fim?: string
          atende_inicio?: string
          created_at?: string
          desistencia?: boolean
          dias?: number[]
          janela_reagendamento?: string
          profissional_id?: string
          reagendamentos_max?: number
          slot_minutos?: number
          updated_at?: string
        }
        Relationships: []
      }
      agenda_pacotes: {
        Row: {
          conta_id: string | null
          created_at: string
          criado_por: string | null
          encerrado_em: string | null
          id: string
          mes_inicio: string
          paciente_id: string
          profissional_id: string
          total: number
          updated_at: string
        }
        Insert: {
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          encerrado_em?: string | null
          id?: string
          mes_inicio: string
          paciente_id: string
          profissional_id: string
          total: number
          updated_at?: string
        }
        Update: {
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          encerrado_em?: string | null
          id?: string
          mes_inicio?: string
          paciente_id?: string
          profissional_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_pacotes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_pacotes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_tags: {
        Row: {
          area: string
          base: boolean
          cor: string
          created_at: string
          deleted_at: string | null
          id: string
          nome: string
          ordem: number
          profissional_id: string
        }
        Insert: {
          area?: string
          base?: boolean
          cor?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome: string
          ordem?: number
          profissional_id: string
        }
        Update: {
          area?: string
          base?: boolean
          cor?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          ordem?: number
          profissional_id?: string
        }
        Relationships: []
      }
      agenda_travas: {
        Row: {
          calendario_id: string | null
          conta_id: string | null
          created_at: string
          dias: number[]
          hora_fim: string
          hora_inicio: string
          id: string
          motivo: string | null
          profissional_id: string
        }
        Insert: {
          calendario_id?: string | null
          conta_id?: string | null
          created_at?: string
          dias?: number[]
          hora_fim: string
          hora_inicio: string
          id?: string
          motivo?: string | null
          profissional_id: string
        }
        Update: {
          calendario_id?: string | null
          conta_id?: string | null
          created_at?: string
          dias?: number[]
          hora_fim?: string
          hora_inicio?: string
          id?: string
          motivo?: string | null
          profissional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_travas_calendario_id_fkey"
            columns: ["calendario_id"]
            isOneToOne: false
            referencedRelation: "calendarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_travas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          aluno_respondeu_em: string | null
          aviso_email_em: string | null
          calendario_id: string
          confirmacao: string
          conta_id: string | null
          created_at: string
          deleted_at: string | null
          dia_inteiro: boolean
          fim: string
          id: string
          inicio: string
          mes_referencia: string | null
          modulo: string
          nutricionista_id: string
          observacao: string | null
          origem: string
          paciente_id: string | null
          reagendamentos: number
          status: string
          tag_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          aluno_respondeu_em?: string | null
          aviso_email_em?: string | null
          calendario_id: string
          confirmacao?: string
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          dia_inteiro?: boolean
          fim: string
          id?: string
          inicio: string
          mes_referencia?: string | null
          modulo?: string
          nutricionista_id: string
          observacao?: string | null
          origem?: string
          paciente_id?: string | null
          reagendamentos?: number
          status?: string
          tag_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          aluno_respondeu_em?: string | null
          aviso_email_em?: string | null
          calendario_id?: string
          confirmacao?: string
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          dia_inteiro?: boolean
          fim?: string
          id?: string
          inicio?: string
          mes_referencia?: string | null
          modulo?: string
          nutricionista_id?: string
          observacao?: string | null
          origem?: string
          paciente_id?: string | null
          reagendamentos?: number
          status?: string
          tag_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_calendario_id_fkey"
            columns: ["calendario_id"]
            isOneToOne: false
            referencedRelation: "calendarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "agenda_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      alimentos: {
        Row: {
          busca: string | null
          carboidrato_g: number | null
          codigo: string | null
          created_at: string
          deleted_at: string | null
          energia_kcal: number | null
          fibra_g: number | null
          fonte: string
          grupo: string | null
          id: string
          lipidio_g: number | null
          marca: string | null
          nome: string
          nutricionista_id: string | null
          nutrientes: Json
          porcao_g: number
          proteina_g: number | null
          sodio_mg: number | null
          updated_at: string
        }
        Insert: {
          busca?: string | null
          carboidrato_g?: number | null
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          energia_kcal?: number | null
          fibra_g?: number | null
          fonte?: string
          grupo?: string | null
          id?: string
          lipidio_g?: number | null
          marca?: string | null
          nome: string
          nutricionista_id?: string | null
          nutrientes?: Json
          porcao_g?: number
          proteina_g?: number | null
          sodio_mg?: number | null
          updated_at?: string
        }
        Update: {
          busca?: string | null
          carboidrato_g?: number | null
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          energia_kcal?: number | null
          fibra_g?: number | null
          fonte?: string
          grupo?: string | null
          id?: string
          lipidio_g?: number | null
          marca?: string | null
          nome?: string
          nutricionista_id?: string | null
          nutrientes?: Json
          porcao_g?: number
          proteina_g?: number | null
          sodio_mg?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      aluno_assinaturas: {
        Row: {
          atualizado_em: string
          conta_id: string | null
          criado_em: string
          id: string
          mp_collector_id: number | null
          mp_preapproval_id: string | null
          paciente_id: string
          payload: Json | null
          proximo_vencimento: string | null
          status: string
          treino_assinatura_id: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          conta_id?: string | null
          criado_em?: string
          id?: string
          mp_collector_id?: number | null
          mp_preapproval_id?: string | null
          paciente_id: string
          payload?: Json | null
          proximo_vencimento?: string | null
          status?: string
          treino_assinatura_id?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          conta_id?: string | null
          criado_em?: string
          id?: string
          mp_collector_id?: number | null
          mp_preapproval_id?: string | null
          paciente_id?: string
          payload?: Json | null
          proximo_vencimento?: string | null
          status?: string
          treino_assinatura_id?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aluno_assinaturas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_assinaturas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      analises_farmaco: {
        Row: {
          created_at: string
          data: string
          deleted_at: string | null
          id: string
          interacoes: Json
          medicamentos: Json
          nutricionista_id: string
          paciente_id: string
          parecer: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          interacoes?: Json
          medicamentos?: Json
          nutricionista_id: string
          paciente_id: string
          parecer?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          interacoes?: Json
          medicamentos?: Json
          nutricionista_id?: string
          paciente_id?: string
          parecer?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analises_farmaco_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      anamneses: {
        Row: {
          conteudo: Json
          created_at: string
          data: string
          deleted_at: string | null
          id: string
          modelo_id: string | null
          nutricionista_id: string
          paciente_id: string
          texto_livre: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          conteudo?: Json
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          modelo_id?: string | null
          nutricionista_id: string
          paciente_id: string
          texto_livre?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          conteudo?: Json
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          modelo_id?: string | null
          nutricionista_id?: string
          paciente_id?: string
          texto_livre?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamneses_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_anamnese"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamneses_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos: {
        Row: {
          conta_id: string | null
          created_at: string
          deleted_at: string | null
          descricao: string | null
          id: string
          mime: string
          nome: string
          nutricionista_id: string
          paciente_id: string
          path: string
          tamanho: number
          updated_at: string
        }
        Insert: {
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          mime: string
          nome: string
          nutricionista_id: string
          paciente_id: string
          path: string
          tamanho: number
          updated_at?: string
        }
        Update: {
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          mime?: string
          nome?: string
          nutricionista_id?: string
          paciente_id?: string
          path?: string
          tamanho?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anexos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      antropometrias: {
        Row: {
          altura: number | null
          circunferencias: Json
          created_at: string
          data: string
          deleted_at: string | null
          dobras: Json
          id: string
          idade: number | null
          nutricionista_id: string
          observacao: string | null
          paciente_id: string
          peso: number | null
          protocolo: string
          resultados: Json
          sexo: string | null
          updated_at: string
        }
        Insert: {
          altura?: number | null
          circunferencias?: Json
          created_at?: string
          data?: string
          deleted_at?: string | null
          dobras?: Json
          id?: string
          idade?: number | null
          nutricionista_id: string
          observacao?: string | null
          paciente_id: string
          peso?: number | null
          protocolo?: string
          resultados?: Json
          sexo?: string | null
          updated_at?: string
        }
        Update: {
          altura?: number | null
          circunferencias?: Json
          created_at?: string
          data?: string
          deleted_at?: string | null
          dobras?: Json
          id?: string
          idade?: number | null
          nutricionista_id?: string
          observacao?: string | null
          paciente_id?: string
          peso?: number | null
          protocolo?: string
          resultados?: Json
          sexo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "antropometrias_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          publica: boolean
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          publica?: boolean
          valor?: Json
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          publica?: boolean
          valor?: Json
        }
        Relationships: []
      }
      assinaturas: {
        Row: {
          created_at: string
          id: string
          init_point: string | null
          mp_preapproval_id: string | null
          nutricionista_id: string
          payload: Json | null
          proximo_vencimento: string | null
          status: string
          ultimo_pagamento_em: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          init_point?: string | null
          mp_preapproval_id?: string | null
          nutricionista_id: string
          payload?: Json | null
          proximo_vencimento?: string | null
          status?: string
          ultimo_pagamento_em?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          created_at?: string
          id?: string
          init_point?: string | null
          mp_preapproval_id?: string | null
          nutricionista_id?: string
          payload?: Json | null
          proximo_vencimento?: string | null
          status?: string
          ultimo_pagamento_em?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_nutricionista_id_fkey"
            columns: ["nutricionista_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automaticas_fila: {
        Row: {
          avisado_em: string | null
          conta_id: string | null
          criado_em: string
          erro: string | null
          feito_em: string | null
          id: number
          motivo: string
          paciente_id: string
          proxima_em: string
          resultado: string | null
          tentativas: number
        }
        Insert: {
          avisado_em?: string | null
          conta_id?: string | null
          criado_em?: string
          erro?: string | null
          feito_em?: string | null
          id?: never
          motivo: string
          paciente_id: string
          proxima_em?: string
          resultado?: string | null
          tentativas?: number
        }
        Update: {
          avisado_em?: string | null
          conta_id?: string | null
          criado_em?: string
          erro?: string | null
          feito_em?: string | null
          id?: never
          motivo?: string
          paciente_id?: string
          proxima_em?: string
          resultado?: string | null
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "automaticas_fila_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes_integradas: {
        Row: {
          created_at: string
          data: string
          deleted_at: string | null
          fontes: Json
          id: string
          nutricionista_id: string
          paciente_id: string
          sintese: Json
          texto: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          fontes?: Json
          id?: string
          nutricionista_id: string
          paciente_id: string
          sintese?: Json
          texto?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          fontes?: Json
          id?: string
          nutricionista_id?: string
          paciente_id?: string
          sintese?: Json
          texto?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_integradas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos: {
        Row: {
          criado_em: string
          destino_user_id: string
          email_em: string | null
          id: string
          lido_em: string | null
          link: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          criado_em?: string
          destino_user_id: string
          email_em?: string | null
          id?: string
          lido_em?: string | null
          link?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          criado_em?: string
          destino_user_id?: string
          email_em?: string | null
          id?: string
          lido_em?: string | null
          link?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      avisos_erro: {
        Row: {
          assinatura: string
          exemplo: string
          lugar: string
          origem: string
          primeiro_em: string
          segurados: number
          ultimo_aviso_em: string | null
          vezes: number
        }
        Insert: {
          assinatura: string
          exemplo?: string
          lugar?: string
          origem?: string
          primeiro_em?: string
          segurados?: number
          ultimo_aviso_em?: string | null
          vezes?: number
        }
        Update: {
          assinatura?: string
          exemplo?: string
          lugar?: string
          origem?: string
          primeiro_em?: string
          segurados?: number
          ultimo_aviso_em?: string | null
          vezes?: number
        }
        Relationships: []
      }
      avisos_erro_hora: {
        Row: {
          hora: string
          n: number
        }
        Insert: {
          hora: string
          n?: number
        }
        Update: {
          hora?: string
          n?: number
        }
        Relationships: []
      }
      bloqueios_agenda: {
        Row: {
          calendario_id: string | null
          conta_id: string | null
          created_at: string
          fim: string
          id: string
          inicio: string
          motivo: string | null
          nutricionista_id: string
        }
        Insert: {
          calendario_id?: string | null
          conta_id?: string | null
          created_at?: string
          fim: string
          id?: string
          inicio: string
          motivo?: string | null
          nutricionista_id: string
        }
        Update: {
          calendario_id?: string | null
          conta_id?: string | null
          created_at?: string
          fim?: string
          id?: string
          inicio?: string
          motivo?: string | null
          nutricionista_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueios_agenda_calendario_id_fkey"
            columns: ["calendario_id"]
            isOneToOne: false
            referencedRelation: "calendarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      cadastros_pendentes: {
        Row: {
          apelido: string | null
          conta_id: string | null
          cpf: string | null
          created_at: string
          decidido_em: string | null
          email: string | null
          genero: string | null
          id: string
          nascimento: string | null
          nome: string
          nutricionista_id: string
          observacoes: string | null
          paciente_id: string | null
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          conta_id?: string | null
          cpf?: string | null
          created_at?: string
          decidido_em?: string | null
          email?: string | null
          genero?: string | null
          id?: string
          nascimento?: string | null
          nome: string
          nutricionista_id: string
          observacoes?: string | null
          paciente_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          conta_id?: string | null
          cpf?: string | null
          created_at?: string
          decidido_em?: string | null
          email?: string | null
          genero?: string | null
          id?: string
          nascimento?: string | null
          nome?: string
          nutricionista_id?: string
          observacoes?: string | null
          paciente_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadastros_pendentes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadastros_pendentes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      calculos_energeticos: {
        Row: {
          ajuste_kcal: number
          altura: number | null
          atividades: Json
          created_at: string
          data: string
          deleted_at: string | null
          fator_atividade: number
          formula: string
          get: number | null
          id: string
          idade: number | null
          massa_magra: number | null
          nutricionista_id: string
          objetivo: string
          observacao: string | null
          paciente_id: string
          peso: number | null
          sexo: string | null
          tmb: number | null
          updated_at: string
          vet: number | null
        }
        Insert: {
          ajuste_kcal?: number
          altura?: number | null
          atividades?: Json
          created_at?: string
          data?: string
          deleted_at?: string | null
          fator_atividade?: number
          formula?: string
          get?: number | null
          id?: string
          idade?: number | null
          massa_magra?: number | null
          nutricionista_id: string
          objetivo?: string
          observacao?: string | null
          paciente_id: string
          peso?: number | null
          sexo?: string | null
          tmb?: number | null
          updated_at?: string
          vet?: number | null
        }
        Update: {
          ajuste_kcal?: number
          altura?: number | null
          atividades?: Json
          created_at?: string
          data?: string
          deleted_at?: string | null
          fator_atividade?: number
          formula?: string
          get?: number | null
          id?: string
          idade?: number | null
          massa_magra?: number | null
          nutricionista_id?: string
          objetivo?: string
          observacao?: string | null
          paciente_id?: string
          peso?: number | null
          sexo?: string | null
          tmb?: number | null
          updated_at?: string
          vet?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "calculos_energeticos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      calendarios: {
        Row: {
          conta_id: string | null
          cor: string
          created_at: string
          deleted_at: string | null
          faixa_fim: string
          faixa_inicio: string
          id: string
          nome: string
          nutricionista_id: string
          padrao: boolean
          slot_minutos: number | null
          tag_padrao_id: string | null
          updated_at: string
        }
        Insert: {
          conta_id?: string | null
          cor?: string
          created_at?: string
          deleted_at?: string | null
          faixa_fim?: string
          faixa_inicio?: string
          id?: string
          nome: string
          nutricionista_id: string
          padrao?: boolean
          slot_minutos?: number | null
          tag_padrao_id?: string | null
          updated_at?: string
        }
        Update: {
          conta_id?: string | null
          cor?: string
          created_at?: string
          deleted_at?: string | null
          faixa_fim?: string
          faixa_inicio?: string
          id?: string
          nome?: string
          nutricionista_id?: string
          padrao?: boolean
          slot_minutos?: number | null
          tag_padrao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendarios_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendarios_tag_padrao_id_fkey"
            columns: ["tag_padrao_id"]
            isOneToOne: false
            referencedRelation: "agenda_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          conta_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          nome: string
          nutricionista_id: string
          updated_at: string
        }
        Insert: {
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome: string
          nutricionista_id: string
          updated_at?: string
        }
        Update: {
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          nutricionista_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          cobre_ate: string | null
          cobre_de: string | null
          comprovante_path: string | null
          confirmado_em: string | null
          confirmado_por: string | null
          conta_id: string | null
          created_at: string
          criado_por: string | null
          deleted_at: string | null
          descricao: string
          enviado_em: string | null
          forma: string | null
          id: string
          ip_conferido_em: string | null
          ip_expira_em: string | null
          ip_handle: string | null
          ip_link_url: string | null
          ip_meio: string | null
          ip_parcelas: number | null
          ip_recibo_url: string | null
          ip_slug: string | null
          ip_transaction_nsu: string | null
          ip_valor_pago: number | null
          mes_ref: string | null
          meses_cobertos: number
          metodo: string | null
          mp_collector_id: number | null
          mp_payment_id: string | null
          mp_preapproval_id: string | null
          mp_status: string | null
          nutricionista_id: string
          origem: string | null
          paciente_id: string
          pago_em: string | null
          parcela_num: number | null
          parcelas_total: number | null
          pix_copia_cola: string | null
          pix_expira_em: string | null
          pix_qr: string | null
          plano_aluno_id: string | null
          recusado_em: string | null
          recusado_motivo: string | null
          reembolsado_em: string | null
          status: string
          tipo: string
          transacao_id: string | null
          treino_pagamento_id: string | null
          updated_at: string
          valor: number
          vencimento: string
        }
        Insert: {
          cobre_ate?: string | null
          cobre_de?: string | null
          comprovante_path?: string | null
          confirmado_em?: string | null
          confirmado_por?: string | null
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          descricao: string
          enviado_em?: string | null
          forma?: string | null
          id?: string
          ip_conferido_em?: string | null
          ip_expira_em?: string | null
          ip_handle?: string | null
          ip_link_url?: string | null
          ip_meio?: string | null
          ip_parcelas?: number | null
          ip_recibo_url?: string | null
          ip_slug?: string | null
          ip_transaction_nsu?: string | null
          ip_valor_pago?: number | null
          mes_ref?: string | null
          meses_cobertos?: number
          metodo?: string | null
          mp_collector_id?: number | null
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          mp_status?: string | null
          nutricionista_id: string
          origem?: string | null
          paciente_id: string
          pago_em?: string | null
          parcela_num?: number | null
          parcelas_total?: number | null
          pix_copia_cola?: string | null
          pix_expira_em?: string | null
          pix_qr?: string | null
          plano_aluno_id?: string | null
          recusado_em?: string | null
          recusado_motivo?: string | null
          reembolsado_em?: string | null
          status?: string
          tipo?: string
          transacao_id?: string | null
          treino_pagamento_id?: string | null
          updated_at?: string
          valor: number
          vencimento: string
        }
        Update: {
          cobre_ate?: string | null
          cobre_de?: string | null
          comprovante_path?: string | null
          confirmado_em?: string | null
          confirmado_por?: string | null
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          descricao?: string
          enviado_em?: string | null
          forma?: string | null
          id?: string
          ip_conferido_em?: string | null
          ip_expira_em?: string | null
          ip_handle?: string | null
          ip_link_url?: string | null
          ip_meio?: string | null
          ip_parcelas?: number | null
          ip_recibo_url?: string | null
          ip_slug?: string | null
          ip_transaction_nsu?: string | null
          ip_valor_pago?: number | null
          mes_ref?: string | null
          meses_cobertos?: number
          metodo?: string | null
          mp_collector_id?: number | null
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          mp_status?: string | null
          nutricionista_id?: string
          origem?: string | null
          paciente_id?: string
          pago_em?: string | null
          parcela_num?: number | null
          parcelas_total?: number | null
          pix_copia_cola?: string | null
          pix_expira_em?: string | null
          pix_qr?: string | null
          plano_aluno_id?: string | null
          recusado_em?: string | null
          recusado_motivo?: string | null
          reembolsado_em?: string | null
          status?: string
          tipo?: string
          transacao_id?: string | null
          treino_pagamento_id?: string | null
          updated_at?: string
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_plano_aluno_id_fkey"
            columns: ["plano_aluno_id"]
            isOneToOne: false
            referencedRelation: "planos_aluno"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas: {
        Row: {
          created_at: string
          data: string
          deleted_at: string | null
          id: string
          nutricionista_id: string
          observacao: string | null
          origem: string
          paciente_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          nutricionista_id: string
          observacao?: string | null
          origem?: string
          paciente_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          nutricionista_id?: string
          observacao?: string | null
          origem?: string
          paciente_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      conta_assinaturas: {
        Row: {
          atualizado_em: string
          conta_id: string
          criado_em: string
          faixa: string | null
          id: string
          mp_preapproval_id: string | null
          payload: Json | null
          plano: string | null
          proximo_vencimento: string | null
          status: string
          ultimo_pagamento_em: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          conta_id: string
          criado_em?: string
          faixa?: string | null
          id?: string
          mp_preapproval_id?: string | null
          payload?: Json | null
          plano?: string | null
          proximo_vencimento?: string | null
          status?: string
          ultimo_pagamento_em?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          conta_id?: string
          criado_em?: string
          faixa?: string | null
          id?: string
          mp_preapproval_id?: string | null
          payload?: Json | null
          plano?: string | null
          proximo_vencimento?: string | null
          status?: string
          ultimo_pagamento_em?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conta_assinaturas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: true
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      conta_eventos: {
        Row: {
          antes: Json | null
          conta_id: string
          depois: Json | null
          em: string
          id: number
          por: string | null
          tipo: string
        }
        Insert: {
          antes?: Json | null
          conta_id: string
          depois?: Json | null
          em?: string
          id?: never
          por?: string | null
          tipo: string
        }
        Update: {
          antes?: Json | null
          conta_id?: string
          depois?: Json | null
          em?: string
          id?: never
          por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "conta_eventos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      conta_faturas: {
        Row: {
          atualizado_em: string
          cobre_ate: string | null
          cobre_de: string | null
          conta_id: string
          criado_em: string
          descricao: string | null
          faixa: string | null
          forma: string | null
          id: string
          meses: number | null
          mp_payment_id: string | null
          mp_preapproval_id: string | null
          origem: string | null
          pago_em: string | null
          pix_copia_cola: string | null
          pix_expira_em: string | null
          pix_qr: string | null
          plano: string | null
          registrado_por: string | null
          status: string
          tipo: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          cobre_ate?: string | null
          cobre_de?: string | null
          conta_id: string
          criado_em?: string
          descricao?: string | null
          faixa?: string | null
          forma?: string | null
          id?: string
          meses?: number | null
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          origem?: string | null
          pago_em?: string | null
          pix_copia_cola?: string | null
          pix_expira_em?: string | null
          pix_qr?: string | null
          plano?: string | null
          registrado_por?: string | null
          status?: string
          tipo: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          cobre_ate?: string | null
          cobre_de?: string | null
          conta_id?: string
          criado_em?: string
          descricao?: string | null
          faixa?: string | null
          forma?: string | null
          id?: string
          meses?: number | null
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          origem?: string | null
          pago_em?: string | null
          pix_copia_cola?: string | null
          pix_expira_em?: string | null
          pix_qr?: string | null
          plano?: string | null
          registrado_por?: string | null
          status?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "conta_faturas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      conta_membros: {
        Row: {
          codigo_convite: string | null
          conta_id: string
          criado_em: string
          email_convite: string | null
          id: string
          papeis: string[]
          removido_em: string | null
          removido_motivo: string | null
          status: string
          treino_user_id: string | null
          user_id: string | null
        }
        Insert: {
          codigo_convite?: string | null
          conta_id: string
          criado_em?: string
          email_convite?: string | null
          id?: string
          papeis?: string[]
          removido_em?: string | null
          removido_motivo?: string | null
          status?: string
          treino_user_id?: string | null
          user_id?: string | null
        }
        Update: {
          codigo_convite?: string | null
          conta_id?: string
          criado_em?: string
          email_convite?: string | null
          id?: string
          papeis?: string[]
          removido_em?: string | null
          removido_motivo?: string | null
          status?: string
          treino_user_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conta_membros_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      contas: {
        Row: {
          alunos_bloqueados_em: string | null
          alunos_bloqueados_msg: string | null
          atualizado_em: string
          bloquear_app_inadimplente: boolean
          cobranca_legada: boolean
          criado_em: string
          dono_id: string | null
          faixa: string
          id: string
          isenta_motivo: string | null
          nome: string
          origem: string
          periodicidade: string
          plano: string
          recebimento_modo: string
          regra_pix: string
          regras_legadas: boolean
          situacao: string
          teste_ate: string | null
          tolerancia_dias: number
          valor_travado: number | null
          vence_em: string | null
        }
        Insert: {
          alunos_bloqueados_em?: string | null
          alunos_bloqueados_msg?: string | null
          atualizado_em?: string
          bloquear_app_inadimplente?: boolean
          cobranca_legada?: boolean
          criado_em?: string
          dono_id?: string | null
          faixa?: string
          id?: string
          isenta_motivo?: string | null
          nome: string
          origem?: string
          periodicidade?: string
          plano?: string
          recebimento_modo?: string
          regra_pix?: string
          regras_legadas?: boolean
          situacao?: string
          teste_ate?: string | null
          tolerancia_dias?: number
          valor_travado?: number | null
          vence_em?: string | null
        }
        Update: {
          alunos_bloqueados_em?: string | null
          alunos_bloqueados_msg?: string | null
          atualizado_em?: string
          bloquear_app_inadimplente?: boolean
          cobranca_legada?: boolean
          criado_em?: string
          dono_id?: string | null
          faixa?: string
          id?: string
          isenta_motivo?: string | null
          nome?: string
          origem?: string
          periodicidade?: string
          plano?: string
          recebimento_modo?: string
          regra_pix?: string
          regras_legadas?: boolean
          situacao?: string
          teste_ate?: string | null
          tolerancia_dias?: number
          valor_travado?: number | null
          vence_em?: string | null
        }
        Relationships: []
      }
      convites: {
        Row: {
          aceito_em: string | null
          conta_id: string
          criado_por: string | null
          email: string
          enviado_em: string
          id: string
          modulos: string[]
          papeis: string[]
          responsavel_id: string | null
          status: string
          tipo: string
        }
        Insert: {
          aceito_em?: string | null
          conta_id: string
          criado_por?: string | null
          email: string
          enviado_em?: string
          id?: string
          modulos?: string[]
          papeis?: string[]
          responsavel_id?: string | null
          status?: string
          tipo: string
        }
        Update: {
          aceito_em?: string | null
          conta_id?: string
          criado_por?: string | null
          email?: string
          enviado_em?: string
          id?: string
          modulos?: string[]
          papeis?: string[]
          responsavel_id?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      diario_alimentar: {
        Row: {
          comentario: string
          comentario_nutri: string
          created_at: string
          data_hora: string
          deleted_at: string | null
          id: string
          mime: string
          nutricionista_id: string
          paciente_id: string
          path: string
          reacao_nutri: string | null
          reagido_em: string | null
          refeicao: string
          tamanho: number
          updated_at: string
        }
        Insert: {
          comentario?: string
          comentario_nutri?: string
          created_at?: string
          data_hora?: string
          deleted_at?: string | null
          id?: string
          mime: string
          nutricionista_id: string
          paciente_id: string
          path: string
          reacao_nutri?: string | null
          reagido_em?: string | null
          refeicao: string
          tamanho: number
          updated_at?: string
        }
        Update: {
          comentario?: string
          comentario_nutri?: string
          created_at?: string
          data_hora?: string
          deleted_at?: string | null
          id?: string
          mime?: string
          nutricionista_id?: string
          paciente_id?: string
          path?: string
          reacao_nutri?: string | null
          reagido_em?: string | null
          refeicao?: string
          tamanho?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diario_alimentar_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          created_at: string
          dados: Json
          data: string
          deleted_at: string | null
          id: string
          modelo_id: string | null
          nutricionista_id: string
          paciente_id: string
          texto: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dados?: Json
          data?: string
          deleted_at?: string | null
          id?: string
          modelo_id?: string | null
          nutricionista_id: string
          paciente_id: string
          texto: string
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dados?: Json
          data?: string
          deleted_at?: string | null
          id?: string
          modelo_id?: string | null
          nutricionista_id?: string
          paciente_id?: string
          texto?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_documento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      espelho_pendencias: {
        Row: {
          criado_em: string
          erro: string | null
          feito_em: string | null
          id: number
          payload: Json
          proxima_em: string
          tentativas: number
          tipo: string
        }
        Insert: {
          criado_em?: string
          erro?: string | null
          feito_em?: string | null
          id?: never
          payload?: Json
          proxima_em?: string
          tentativas?: number
          tipo: string
        }
        Update: {
          criado_em?: string
          erro?: string | null
          feito_em?: string | null
          id?: never
          payload?: Json
          proxima_em?: string
          tentativas?: number
          tipo?: string
        }
        Relationships: []
      }
      exames_catalogo: {
        Row: {
          created_at: string
          deleted_at: string | null
          favorito: boolean
          id: string
          nome: string
          nutricionista_id: string
          ref_max: number | null
          ref_min: number | null
          referencia_texto: string
          unidade: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nome: string
          nutricionista_id: string
          ref_max?: number | null
          ref_min?: number | null
          referencia_texto?: string
          unidade?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nome?: string
          nutricionista_id?: string
          ref_max?: number | null
          ref_min?: number | null
          referencia_texto?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      formularios_preconsulta: {
        Row: {
          ativo: boolean
          conta_id: string | null
          created_at: string
          deleted_at: string | null
          descricao: string
          faixas: Json
          id: string
          nutricionista_id: string
          origem: string
          origem_id: string | null
          perguntas: Json
          slug: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          faixas?: Json
          id?: string
          nutricionista_id: string
          origem?: string
          origem_id?: string | null
          perguntas?: Json
          slug: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          faixas?: Json
          id?: string
          nutricionista_id?: string
          origem?: string
          origem_id?: string | null
          perguntas?: Json
          slug?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formularios_preconsulta_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas_manipuladas: {
        Row: {
          ativos: Json
          created_at: string
          deleted_at: string | null
          id: string
          modelo_id: string | null
          nutricionista_id: string
          observacao: string
          paciente_id: string
          posologia: string
          prescrita_em: string
          quantidade: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativos?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          modelo_id?: string | null
          nutricionista_id: string
          observacao?: string
          paciente_id: string
          posologia?: string
          prescrita_em?: string
          quantidade?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativos?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          modelo_id?: string | null
          nutricionista_id?: string
          observacao?: string
          paciente_id?: string
          posologia?: string
          prescrita_em?: string
          quantidade?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formulas_manipuladas_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_formula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "formulas_manipuladas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fotos_evolucao: {
        Row: {
          created_at: string
          data: string
          deleted_at: string | null
          id: string
          mime: string
          nutricionista_id: string
          observacao: string | null
          paciente_id: string
          path: string
          posicao: string
          tamanho: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          mime: string
          nutricionista_id: string
          observacao?: string | null
          paciente_id: string
          path: string
          posicao: string
          tamanho: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          mime?: string
          nutricionista_id?: string
          observacao?: string | null
          paciente_id?: string
          path?: string
          posicao?: string
          tamanho?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotos_evolucao_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      gestacoes: {
        Row: {
          altura: number
          created_at: string
          deleted_at: string | null
          dpp: string
          dum: string
          encerrada_em: string | null
          gemelar: boolean
          id: string
          imc_pre: number
          nutricionista_id: string
          observacao: string | null
          paciente_id: string
          peso_pre: number
          updated_at: string
        }
        Insert: {
          altura: number
          created_at?: string
          deleted_at?: string | null
          dpp: string
          dum: string
          encerrada_em?: string | null
          gemelar?: boolean
          id?: string
          imc_pre: number
          nutricionista_id: string
          observacao?: string | null
          paciente_id: string
          peso_pre: number
          updated_at?: string
        }
        Update: {
          altura?: number
          created_at?: string
          deleted_at?: string | null
          dpp?: string
          dum?: string
          encerrada_em?: string | null
          gemelar?: boolean
          id?: string
          imc_pre?: number
          nutricionista_id?: string
          observacao?: string | null
          paciente_id?: string
          peso_pre?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gestacoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_receita: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nome: string
          nutricionista_id: string
          ordem: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome: string
          nutricionista_id: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          nutricionista_id?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      indicacoes_produto: {
        Row: {
          ativa: boolean
          created_at: string
          deleted_at: string | null
          dose: string
          duracao: string
          horario: string
          id: string
          inicio: string
          nutricionista_id: string
          observacao: string
          ordem: number
          paciente_id: string
          produto_apresentacao: string
          produto_categoria: string
          produto_id: string | null
          produto_marca: string
          produto_nome: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          deleted_at?: string | null
          dose: string
          duracao?: string
          horario?: string
          id?: string
          inicio?: string
          nutricionista_id: string
          observacao?: string
          ordem?: number
          paciente_id: string
          produto_apresentacao?: string
          produto_categoria?: string
          produto_id?: string | null
          produto_marca?: string
          produto_nome: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          deleted_at?: string | null
          dose?: string
          duracao?: string
          horario?: string
          id?: string
          inicio?: string
          nutricionista_id?: string
          observacao?: string
          ordem?: number
          paciente_id?: string
          produto_apresentacao?: string
          produto_categoria?: string
          produto_id?: string | null
          produto_marca?: string
          produto_nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicacoes_produto_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      infinitepay_avisos: {
        Row: {
          cobranca_id: string
          conferido_em: string | null
          id: number
          meio: string | null
          origem: string
          pedido: string
          proxima_em: string
          recebido_em: string
          recibo_url: string | null
          resultado: string | null
          slug: string
          tentado_em: string | null
          tentativas: number
          transaction_nsu: string
        }
        Insert: {
          cobranca_id: string
          conferido_em?: string | null
          id?: never
          meio?: string | null
          origem: string
          pedido: string
          proxima_em?: string
          recebido_em?: string
          recibo_url?: string | null
          resultado?: string | null
          slug?: string
          tentado_em?: string | null
          tentativas?: number
          transaction_nsu: string
        }
        Update: {
          cobranca_id?: string
          conferido_em?: string | null
          id?: never
          meio?: string | null
          origem?: string
          pedido?: string
          proxima_em?: string
          recebido_em?: string
          recibo_url?: string | null
          resultado?: string | null
          slug?: string
          tentado_em?: string | null
          tentativas?: number
          transaction_nsu?: string
        }
        Relationships: [
          {
            foreignKeyName: "infinitepay_avisos_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "infinitepay_avisos_pedido_fkey"
            columns: ["pedido"]
            isOneToOne: false
            referencedRelation: "infinitepay_links"
            referencedColumns: ["pedido"]
          },
        ]
      }
      infinitepay_links: {
        Row: {
          centavos: number
          cobranca_id: string
          criado_em: string
          handle: string
          n: number
          pedido: string
          url: string | null
        }
        Insert: {
          centavos: number
          cobranca_id: string
          criado_em?: string
          handle: string
          n: number
          pedido: string
          url?: string | null
        }
        Update: {
          centavos?: number
          cobranca_id?: string
          criado_em?: string
          handle?: string
          n?: number
          pedido?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "infinitepay_links_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredientes_receita: {
        Row: {
          alimento_id: string
          created_at: string
          id: string
          medida_caseira_id: string | null
          observacao: string
          ordem: number
          quantidade_g: number
          quantidade_medida: number | null
          receita_id: string
          updated_at: string
        }
        Insert: {
          alimento_id: string
          created_at?: string
          id?: string
          medida_caseira_id?: string | null
          observacao?: string
          ordem?: number
          quantidade_g: number
          quantidade_medida?: number | null
          receita_id: string
          updated_at?: string
        }
        Update: {
          alimento_id?: string
          created_at?: string
          id?: string
          medida_caseira_id?: string | null
          observacao?: string
          ordem?: number
          quantidade_g?: number
          quantidade_medida?: number | null
          receita_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredientes_receita_alimento_id_fkey"
            columns: ["alimento_id"]
            isOneToOne: false
            referencedRelation: "alimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredientes_receita_medida_caseira_id_fkey"
            columns: ["medida_caseira_id"]
            isOneToOne: false
            referencedRelation: "medidas_caseiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredientes_receita_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "receitas"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes_farmaco_nutriente: {
        Row: {
          classe: string
          codigo: string | null
          conduta: string
          created_at: string
          deleted_at: string | null
          efeito: string
          fonte: string
          gravidade: string
          id: string
          medicamento: string
          nutricionista_id: string | null
          nutriente: string
          sinonimos: string[]
          updated_at: string
        }
        Insert: {
          classe?: string
          codigo?: string | null
          conduta: string
          created_at?: string
          deleted_at?: string | null
          efeito: string
          fonte?: string
          gravidade?: string
          id?: string
          medicamento: string
          nutricionista_id?: string | null
          nutriente: string
          sinonimos?: string[]
          updated_at?: string
        }
        Update: {
          classe?: string
          codigo?: string | null
          conduta?: string
          created_at?: string
          deleted_at?: string | null
          efeito?: string
          fonte?: string
          gravidade?: string
          id?: string
          medicamento?: string
          nutricionista_id?: string | null
          nutriente?: string
          sinonimos?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      itens_refeicao: {
        Row: {
          alimento_id: string
          created_at: string
          id: string
          medida_caseira_id: string | null
          observacao: string | null
          ordem: number
          quantidade_g: number
          quantidade_medida: number | null
          receita_id: string | null
          refeicao_id: string
          substitutos: Json
          updated_at: string
        }
        Insert: {
          alimento_id: string
          created_at?: string
          id?: string
          medida_caseira_id?: string | null
          observacao?: string | null
          ordem?: number
          quantidade_g: number
          quantidade_medida?: number | null
          receita_id?: string | null
          refeicao_id: string
          substitutos?: Json
          updated_at?: string
        }
        Update: {
          alimento_id?: string
          created_at?: string
          id?: string
          medida_caseira_id?: string | null
          observacao?: string | null
          ordem?: number
          quantidade_g?: number
          quantidade_medida?: number | null
          receita_id?: string | null
          refeicao_id?: string
          substitutos?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_refeicao_alimento_id_fkey"
            columns: ["alimento_id"]
            isOneToOne: false
            referencedRelation: "alimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_refeicao_medida_caseira_id_fkey"
            columns: ["medida_caseira_id"]
            isOneToOne: false
            referencedRelation: "medidas_caseiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_refeicao_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "receitas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_refeicao_refeicao_id_fkey"
            columns: ["refeicao_id"]
            isOneToOne: false
            referencedRelation: "refeicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      login_bloqueios: {
        Row: {
          atualizado_em: string
          bloqueado_ate: string | null
          bloqueado_de_vez_em: string | null
          criado_em: string
          em_andamento_ate: string | null
          email: string
          erros: number
          ultimo_erro_em: string | null
        }
        Insert: {
          atualizado_em?: string
          bloqueado_ate?: string | null
          bloqueado_de_vez_em?: string | null
          criado_em?: string
          em_andamento_ate?: string | null
          email: string
          erros?: number
          ultimo_erro_em?: string | null
        }
        Update: {
          atualizado_em?: string
          bloqueado_ate?: string | null
          bloqueado_de_vez_em?: string | null
          criado_em?: string
          em_andamento_ate?: string | null
          email?: string
          erros?: number
          ultimo_erro_em?: string | null
        }
        Relationships: []
      }
      login_captcha_usados: {
        Row: {
          token_hash: string
          usado_em: string
        }
        Insert: {
          token_hash: string
          usado_em?: string
        }
        Update: {
          token_hash?: string
          usado_em?: string
        }
        Relationships: []
      }
      login_tentativas_ip: {
        Row: {
          atualizado_em: string
          ip_hash: string
          janela_inicio: string
          tentativas: number
        }
        Insert: {
          atualizado_em?: string
          ip_hash: string
          janela_inicio?: string
          tentativas?: number
        }
        Update: {
          atualizado_em?: string
          ip_hash?: string
          janela_inicio?: string
          tentativas?: number
        }
        Relationships: []
      }
      medicamentos_paciente: {
        Row: {
          ativo: boolean
          created_at: string
          deleted_at: string | null
          dose: string
          id: string
          inicio: string | null
          interacao_id: string | null
          medicamento: string
          nutricionista_id: string
          observacao: string
          paciente_id: string
          posologia: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          dose?: string
          id?: string
          inicio?: string | null
          interacao_id?: string | null
          medicamento: string
          nutricionista_id: string
          observacao?: string
          paciente_id: string
          posologia?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          dose?: string
          id?: string
          inicio?: string | null
          interacao_id?: string | null
          medicamento?: string
          nutricionista_id?: string
          observacao?: string
          paciente_id?: string
          posologia?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicamentos_paciente_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: false
            referencedRelation: "interacoes_farmaco_nutriente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicamentos_paciente_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      medidas_caseiras: {
        Row: {
          alimento_id: string
          created_at: string
          descricao: string
          gramas: number
          id: string
          ordem: number
        }
        Insert: {
          alimento_id: string
          created_at?: string
          descricao: string
          gramas: number
          id?: string
          ordem?: number
        }
        Update: {
          alimento_id?: string
          created_at?: string
          descricao?: string
          gramas?: number
          id?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "medidas_caseiras_alimento_id_fkey"
            columns: ["alimento_id"]
            isOneToOne: false
            referencedRelation: "alimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_whatsapp: {
        Row: {
          agendada_para: string
          agendamento_id: string | null
          cobranca_id: string | null
          conta_id: string | null
          created_at: string
          destino_e164: string
          enviada_em: string | null
          erro: string | null
          id: string
          nutricionista_id: string
          paciente_id: string | null
          referencia_dia: string | null
          status: string
          tentativas: number
          texto: string
          tipo: string
          updated_at: string
        }
        Insert: {
          agendada_para?: string
          agendamento_id?: string | null
          cobranca_id?: string | null
          conta_id?: string | null
          created_at?: string
          destino_e164: string
          enviada_em?: string | null
          erro?: string | null
          id?: string
          nutricionista_id: string
          paciente_id?: string | null
          referencia_dia?: string | null
          status?: string
          tentativas?: number
          texto: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          agendada_para?: string
          agendamento_id?: string | null
          cobranca_id?: string | null
          conta_id?: string | null
          created_at?: string
          destino_e164?: string
          enviada_em?: string | null
          erro?: string | null
          id?: string
          nutricionista_id?: string
          paciente_id?: string | null
          referencia_dia?: string | null
          status?: string
          tentativas?: number
          texto?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_whatsapp_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          ativa: boolean
          created_at: string
          deleted_at: string | null
          descricao: string
          dias_semana: number[]
          id: string
          inicio: string
          modelo_id: string | null
          nutricionista_id: string
          paciente_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          dias_semana: number[]
          id?: string
          inicio?: string
          modelo_id?: string | null
          nutricionista_id: string
          paciente_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          dias_semana?: number[]
          id?: string
          inicio?: string
          modelo_id?: string | null
          nutricionista_id?: string
          paciente_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_meta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_concluidas: {
        Row: {
          conta_id: string | null
          criado_em: string
          data: string
          id: string
          meta_id: string
          paciente_id: string
        }
        Insert: {
          conta_id?: string | null
          criado_em?: string
          data: string
          id?: string
          meta_id: string
          paciente_id: string
        }
        Update: {
          conta_id?: string | null
          criado_em?: string
          data?: string
          id?: string
          meta_id?: string
          paciente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metas_concluidas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_concluidas_meta_id_fkey"
            columns: ["meta_id"]
            isOneToOne: false
            referencedRelation: "metas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_concluidas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_anamnese: {
        Row: {
          codigo: string | null
          created_at: string
          deleted_at: string | null
          favorito: boolean
          id: string
          nutricionista_id: string | null
          perguntas: Json
          titulo: string
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id?: string | null
          perguntas?: Json
          titulo: string
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id?: string | null
          perguntas?: Json
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      modelos_documento: {
        Row: {
          conteudo: string
          created_at: string
          deleted_at: string | null
          favorito: boolean
          id: string
          nutricionista_id: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id: string
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      modelos_formula: {
        Row: {
          ativos: Json
          created_at: string
          deleted_at: string | null
          favorito: boolean
          id: string
          nutricionista_id: string
          observacao: string
          posologia: string
          quantidade: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativos?: Json
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id: string
          observacao?: string
          posologia?: string
          quantidade?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativos?: Json
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id?: string
          observacao?: string
          posologia?: string
          quantidade?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      modelos_meta: {
        Row: {
          created_at: string
          deleted_at: string | null
          descricao: string
          dias_semana: number[]
          favorito: boolean
          id: string
          nutricionista_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          dias_semana?: number[]
          favorito?: boolean
          id?: string
          nutricionista_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          dias_semana?: number[]
          favorito?: boolean
          id?: string
          nutricionista_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      modelos_orientacao: {
        Row: {
          conteudo: string
          created_at: string
          deleted_at: string | null
          favorito: boolean
          id: string
          nutricionista_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      modelos_recibo: {
        Row: {
          conta_id: string | null
          conteudo: string
          created_at: string
          deleted_at: string | null
          favorito: boolean
          id: string
          nutricionista_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          conta_id?: string | null
          conteudo: string
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          conta_id?: string | null
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          nutricionista_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_recibo_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      mp_conexoes: {
        Row: {
          conta_id: string
          criado_em: string
          estado_hash: string
          expira_em: string
          id: string
          live: boolean | null
          mp_apelido: string | null
          mp_user_id: number | null
          public_key: string | null
          redirect_uri: string
          renovavel: boolean | null
          resultado: string | null
          token_access: string | null
          token_expira_em: string | null
          token_refresh: string | null
          usado_em: string | null
          user_id: string
          verificador: string
        }
        Insert: {
          conta_id: string
          criado_em?: string
          estado_hash: string
          expira_em?: string
          id?: string
          live?: boolean | null
          mp_apelido?: string | null
          mp_user_id?: number | null
          public_key?: string | null
          redirect_uri: string
          renovavel?: boolean | null
          resultado?: string | null
          token_access?: string | null
          token_expira_em?: string | null
          token_refresh?: string | null
          usado_em?: string | null
          user_id: string
          verificador: string
        }
        Update: {
          conta_id?: string
          criado_em?: string
          estado_hash?: string
          expira_em?: string
          id?: string
          live?: boolean | null
          mp_apelido?: string | null
          mp_user_id?: number | null
          public_key?: string | null
          redirect_uri?: string
          renovavel?: boolean | null
          resultado?: string | null
          token_access?: string | null
          token_expira_em?: string | null
          token_refresh?: string | null
          usado_em?: string | null
          user_id?: string
          verificador?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_conexoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      orientacoes: {
        Row: {
          conteudo: string
          created_at: string
          deleted_at: string | null
          id: string
          modelo_id: string | null
          nutricionista_id: string
          paciente_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          modelo_id?: string | null
          nutricionista_id: string
          paciente_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          modelo_id?: string | null
          nutricionista_id?: string
          paciente_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orientacoes_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_orientacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orientacoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          acesso_bloqueado_em: string | null
          acesso_bloqueado_msg: string | null
          apelido: string | null
          app_encerrada_em: string | null
          app_encerrada_motivo: string | null
          app_teste_ate: string | null
          app_teste_de: string | null
          ativo: boolean
          bloqueado_por_pagamento: boolean
          busca: string | null
          cobranca_pausada: boolean
          config: Json
          conta_id: string | null
          cpf: string | null
          created_at: string
          deleted_at: string | null
          desvinculado_em: string | null
          email: string | null
          financeiro_migrado_em: string | null
          foto_url: string | null
          genero: string | null
          id: string
          link_codigo: string
          mensalidade_desde: string | null
          mensalidade_pago_ate: string | null
          mensalidade_valor: number | null
          nascimento: string | null
          nome: string
          nutricionista_id: string | null
          objetivo: string | null
          objetivo_app: string | null
          origem: string | null
          personal_id: string | null
          plano_aluno_id: string | null
          plano_modalidade: string | null
          plano_valor_negociado: number | null
          resumo: string | null
          tags: string[]
          telefone: string | null
          treino_user_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acesso_bloqueado_em?: string | null
          acesso_bloqueado_msg?: string | null
          apelido?: string | null
          app_encerrada_em?: string | null
          app_encerrada_motivo?: string | null
          app_teste_ate?: string | null
          app_teste_de?: string | null
          ativo?: boolean
          bloqueado_por_pagamento?: boolean
          busca?: string | null
          cobranca_pausada?: boolean
          config?: Json
          conta_id?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          desvinculado_em?: string | null
          email?: string | null
          financeiro_migrado_em?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          link_codigo?: string
          mensalidade_desde?: string | null
          mensalidade_pago_ate?: string | null
          mensalidade_valor?: number | null
          nascimento?: string | null
          nome: string
          nutricionista_id?: string | null
          objetivo?: string | null
          objetivo_app?: string | null
          origem?: string | null
          personal_id?: string | null
          plano_aluno_id?: string | null
          plano_modalidade?: string | null
          plano_valor_negociado?: number | null
          resumo?: string | null
          tags?: string[]
          telefone?: string | null
          treino_user_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acesso_bloqueado_em?: string | null
          acesso_bloqueado_msg?: string | null
          apelido?: string | null
          app_encerrada_em?: string | null
          app_encerrada_motivo?: string | null
          app_teste_ate?: string | null
          app_teste_de?: string | null
          ativo?: boolean
          bloqueado_por_pagamento?: boolean
          busca?: string | null
          cobranca_pausada?: boolean
          config?: Json
          conta_id?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          desvinculado_em?: string | null
          email?: string | null
          financeiro_migrado_em?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          link_codigo?: string
          mensalidade_desde?: string | null
          mensalidade_pago_ate?: string | null
          mensalidade_valor?: number | null
          nascimento?: string | null
          nome?: string
          nutricionista_id?: string | null
          objetivo?: string | null
          objetivo_app?: string | null
          origem?: string | null
          personal_id?: string | null
          plano_aluno_id?: string | null
          plano_modalidade?: string | null
          plano_valor_negociado?: number | null
          resumo?: string | null
          tags?: string[]
          telefone?: string | null
          treino_user_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_plano_aluno_id_fkey"
            columns: ["plano_aluno_id"]
            isOneToOne: false
            referencedRelation: "planos_aluno"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_assinatura: {
        Row: {
          cobre_ate: string | null
          created_at: string
          id: string
          mp_payment_id: string
          nutricionista_id: string
          pago_em: string | null
          payload: Json | null
          pix_expira_em: string | null
          pix_qr_code: string | null
          pix_qr_code_base64: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          cobre_ate?: string | null
          created_at?: string
          id?: string
          mp_payment_id: string
          nutricionista_id: string
          pago_em?: string | null
          payload?: Json | null
          pix_expira_em?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          cobre_ate?: string | null
          created_at?: string
          id?: string
          mp_payment_id?: string
          nutricionista_id?: string
          pago_em?: string | null
          payload?: Json | null
          pix_expira_em?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_assinatura_nutricionista_id_fkey"
            columns: ["nutricionista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_exame: {
        Row: {
          created_at: string
          data: string
          deleted_at: string | null
          exames: string[]
          id: string
          nutricionista_id: string
          observacao: string
          paciente_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          exames: string[]
          id?: string
          nutricionista_id: string
          observacao?: string
          paciente_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          exames?: string[]
          id?: string
          nutricionista_id?: string
          observacao?: string
          paciente_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_exame_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_precos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          faixa: string
          id: string
          max_alunos: number | null
          min_alunos: number
          ordem: number
          plano: string
          valor_anual: number | null
          valor_mensal: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          faixa: string
          id?: string
          max_alunos?: number | null
          min_alunos?: number
          ordem?: number
          plano: string
          valor_anual?: number | null
          valor_mensal: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          faixa?: string
          id?: string
          max_alunos?: number | null
          min_alunos?: number
          ordem?: number
          plano?: string
          valor_anual?: number | null
          valor_mensal?: number
        }
        Relationships: []
      }
      plano_precos_hist: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          antes: Json | null
          depois: Json | null
          id: number
          plano_preco_id: string | null
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          antes?: Json | null
          depois?: Json | null
          id?: never
          plano_preco_id?: string | null
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          antes?: Json | null
          depois?: Json | null
          id?: never
          plano_preco_id?: string | null
        }
        Relationships: []
      }
      planos_alimentares: {
        Row: {
          calculo_energetico_id: string | null
          created_at: string
          deleted_at: string | null
          favorito: boolean
          id: string
          kcal_alvo: number | null
          metodo: string
          nutricionista_id: string
          observacao: string | null
          paciente_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          calculo_energetico_id?: string | null
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          kcal_alvo?: number | null
          metodo?: string
          nutricionista_id: string
          observacao?: string | null
          paciente_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          calculo_energetico_id?: string | null
          created_at?: string
          deleted_at?: string | null
          favorito?: boolean
          id?: string
          kcal_alvo?: number | null
          metodo?: string
          nutricionista_id?: string
          observacao?: string | null
          paciente_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planos_alimentares_calculo_energetico_id_fkey"
            columns: ["calculo_energetico_id"]
            isOneToOne: false
            referencedRelation: "calculos_energeticos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planos_alimentares_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_aluno: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo: string | null
          conta_id: string
          criado_em: string
          descricao: string | null
          id: string
          max_parcelas_cartao: number | null
          meses: number
          modalidades: string[]
          modulos: string[] | null
          nome: string
          ordem: number
          treino_plano_id: string | null
          valor: number | null
          valor_parcela_mensal: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo?: string | null
          conta_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          max_parcelas_cartao?: number | null
          meses?: number
          modalidades?: string[]
          modulos?: string[] | null
          nome: string
          ordem?: number
          treino_plano_id?: string | null
          valor?: number | null
          valor_parcela_mensal?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo?: string | null
          conta_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          max_parcelas_cartao?: number | null
          meses?: number
          modalidades?: string[]
          modulos?: string[] | null
          nome?: string
          ordem?: number
          treino_plano_id?: string | null
          valor?: number | null
          valor_parcela_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "planos_aluno_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      pratos_prontos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          codigo: string
          criado_em: string
          descricao: string | null
          foto_url: string | null
          id: string
          modo_preparo: string | null
          nome: string
          objetivos: string[]
          ordem: number
          refeicao: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          codigo: string
          criado_em?: string
          descricao?: string | null
          foto_url?: string | null
          id?: string
          modo_preparo?: string | null
          nome: string
          objetivos: string[]
          ordem?: number
          refeicao: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          codigo?: string
          criado_em?: string
          descricao?: string | null
          foto_url?: string | null
          id?: string
          modo_preparo?: string | null
          nome?: string
          objetivos?: string[]
          ordem?: number
          refeicao?: string
        }
        Relationships: []
      }
      pratos_prontos_itens: {
        Row: {
          alimento_id: string
          id: string
          medida: string | null
          nome: string | null
          ordem: number
          prato_id: string
          quantidade_g: number
        }
        Insert: {
          alimento_id: string
          id?: string
          medida?: string | null
          nome?: string | null
          ordem?: number
          prato_id: string
          quantidade_g: number
        }
        Update: {
          alimento_id?: string
          id?: string
          medida?: string | null
          nome?: string | null
          ordem?: number
          prato_id?: string
          quantidade_g?: number
        }
        Relationships: [
          {
            foreignKeyName: "pratos_prontos_itens_alimento_id_fkey"
            columns: ["alimento_id"]
            isOneToOne: false
            referencedRelation: "alimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pratos_prontos_itens_prato_id_fkey"
            columns: ["prato_id"]
            isOneToOne: false
            referencedRelation: "pratos_prontos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          apresentacao: string
          categoria: string
          created_at: string
          deleted_at: string | null
          dose_padrao: string
          favorito: boolean
          id: string
          link: string
          marca: string
          modo_uso: string
          nome: string
          nutricionista_id: string
          observacao: string
          updated_at: string
        }
        Insert: {
          apresentacao?: string
          categoria?: string
          created_at?: string
          deleted_at?: string | null
          dose_padrao?: string
          favorito?: boolean
          id?: string
          link?: string
          marca?: string
          modo_uso?: string
          nome: string
          nutricionista_id: string
          observacao?: string
          updated_at?: string
        }
        Update: {
          apresentacao?: string
          categoria?: string
          created_at?: string
          deleted_at?: string | null
          dose_padrao?: string
          favorito?: boolean
          id?: string
          link?: string
          marca?: string
          modo_uso?: string
          nome?: string
          nutricionista_id?: string
          observacao?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          area_outra: string | null
          ativo: boolean
          carimbo_url: string | null
          codigo_cadastro: string | null
          config: Json
          created_at: string
          dados_profissionais: Json | null
          email: string | null
          id: string
          isento_assinatura: boolean
          nome: string | null
          pago_ate: string | null
          recebimento: string
          role: string
          teste_ate: string
          tipo_perfil: string | null
          updated_at: string
        }
        Insert: {
          area_outra?: string | null
          ativo?: boolean
          carimbo_url?: string | null
          codigo_cadastro?: string | null
          config?: Json
          created_at?: string
          dados_profissionais?: Json | null
          email?: string | null
          id: string
          isento_assinatura?: boolean
          nome?: string | null
          pago_ate?: string | null
          recebimento?: string
          role?: string
          teste_ate?: string
          tipo_perfil?: string | null
          updated_at?: string
        }
        Update: {
          area_outra?: string | null
          ativo?: boolean
          carimbo_url?: string | null
          codigo_cadastro?: string | null
          config?: Json
          created_at?: string
          dados_profissionais?: Json | null
          email?: string | null
          id?: string
          isento_assinatura?: boolean
          nome?: string | null
          pago_ate?: string | null
          recebimento?: string
          role?: string
          teste_ate?: string
          tipo_perfil?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      publico_pedidos_ip: {
        Row: {
          ip_hash: string
          janela: string
          n: number
          rota: string
        }
        Insert: {
          ip_hash: string
          janela: string
          n?: number
          rota: string
        }
        Update: {
          ip_hash?: string
          janela?: string
          n?: number
          rota?: string
        }
        Relationships: []
      }
      push_aparelhos: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          plataforma: string
          token: string
          user_id: string
          versao_app: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          plataforma?: string
          token: string
          user_id: string
          versao_app?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          plataforma?: string
          token?: string
          user_id?: string
          versao_app?: string | null
        }
        Relationships: []
      }
      push_envios: {
        Row: {
          aparelhos: number
          aviso_id: string
          concluido_em: string | null
          criado_em: string
          enviados: number
          falhas: number
          recusados: number
          resultado: Json | null
          user_id: string
        }
        Insert: {
          aparelhos?: number
          aviso_id: string
          concluido_em?: string | null
          criado_em?: string
          enviados?: number
          falhas?: number
          recusados?: number
          resultado?: Json | null
          user_id: string
        }
        Update: {
          aparelhos?: number
          aviso_id?: string
          concluido_em?: string | null
          criado_em?: string
          enviados?: number
          falhas?: number
          recusados?: number
          resultado?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_envios_aviso_id_fkey"
            columns: ["aviso_id"]
            isOneToOne: true
            referencedRelation: "avisos"
            referencedColumns: ["id"]
          },
        ]
      }
      questionarios: {
        Row: {
          codigo: string | null
          created_at: string
          deleted_at: string | null
          descricao: string
          faixas: Json
          favorito: boolean
          id: string
          nutricionista_id: string | null
          perguntas: Json
          titulo: string
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          faixas?: Json
          favorito?: boolean
          id?: string
          nutricionista_id?: string | null
          perguntas?: Json
          titulo: string
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          created_at?: string
          deleted_at?: string | null
          descricao?: string
          faixas?: Json
          favorito?: boolean
          id?: string
          nutricionista_id?: string | null
          perguntas?: Json
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      recebimento_chaves: {
        Row: {
          ativa: boolean
          atualizado_em: string
          banco: string | null
          chave: string
          conta_id: string
          criado_em: string
          favorecido: string | null
          id: string
          membro_id: string | null
          tipo: string
          treino_recebimento_id: string | null
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          banco?: string | null
          chave: string
          conta_id: string
          criado_em?: string
          favorecido?: string | null
          id?: string
          membro_id?: string | null
          tipo: string
          treino_recebimento_id?: string | null
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          banco?: string | null
          chave?: string
          conta_id?: string
          criado_em?: string
          favorecido?: string | null
          id?: string
          membro_id?: string | null
          tipo?: string
          treino_recebimento_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recebimento_chaves_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimento_chaves_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "conta_membros"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimento_integracoes: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          conectado_em: string | null
          conta_id: string
          criado_em: string
          desconectada_em: string | null
          id: string
          infinitepay_handle: string | null
          mp_access_token: string | null
          mp_apelido: string | null
          mp_avisado_em: string | null
          mp_conferido_em: string | null
          mp_erro: string | null
          mp_expira_em: string | null
          mp_origem: string | null
          mp_public_key: string | null
          mp_refresh_token: string | null
          mp_renovado_em: string | null
          mp_renovando_ate: string | null
          mp_renovar_proxima_em: string | null
          mp_renovar_tentativas: number
          mp_teste: boolean | null
          mp_user_id: number | null
          provedor: string
          status: string
          testado_em: string | null
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          conectado_em?: string | null
          conta_id: string
          criado_em?: string
          desconectada_em?: string | null
          id?: string
          infinitepay_handle?: string | null
          mp_access_token?: string | null
          mp_apelido?: string | null
          mp_avisado_em?: string | null
          mp_conferido_em?: string | null
          mp_erro?: string | null
          mp_expira_em?: string | null
          mp_origem?: string | null
          mp_public_key?: string | null
          mp_refresh_token?: string | null
          mp_renovado_em?: string | null
          mp_renovando_ate?: string | null
          mp_renovar_proxima_em?: string | null
          mp_renovar_tentativas?: number
          mp_teste?: boolean | null
          mp_user_id?: number | null
          provedor: string
          status?: string
          testado_em?: string | null
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          conectado_em?: string | null
          conta_id?: string
          criado_em?: string
          desconectada_em?: string | null
          id?: string
          infinitepay_handle?: string | null
          mp_access_token?: string | null
          mp_apelido?: string | null
          mp_avisado_em?: string | null
          mp_conferido_em?: string | null
          mp_erro?: string | null
          mp_expira_em?: string | null
          mp_origem?: string | null
          mp_public_key?: string | null
          mp_refresh_token?: string | null
          mp_renovado_em?: string | null
          mp_renovando_ate?: string | null
          mp_renovar_proxima_em?: string | null
          mp_renovar_tentativas?: number
          mp_teste?: boolean | null
          mp_user_id?: number | null
          provedor?: string
          status?: string
          testado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recebimento_integracoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      receitas: {
        Row: {
          created_at: string
          deleted_at: string | null
          favorita: boolean
          grupo_id: string | null
          id: string
          modo_preparo: string
          nome: string
          nutricionista_id: string
          observacao: string
          porcoes: number
          rendimento_g: number | null
          tempo_preparo_min: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          favorita?: boolean
          grupo_id?: string | null
          id?: string
          modo_preparo?: string
          nome: string
          nutricionista_id: string
          observacao?: string
          porcoes?: number
          rendimento_g?: number | null
          tempo_preparo_min?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          favorita?: boolean
          grupo_id?: string | null
          id?: string
          modo_preparo?: string
          nome?: string
          nutricionista_id?: string
          observacao?: string
          porcoes?: number
          rendimento_g?: number | null
          tempo_preparo_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receitas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_receita"
            referencedColumns: ["id"]
          },
        ]
      }
      recibos: {
        Row: {
          conta_id: string | null
          created_at: string
          data: string
          deleted_at: string | null
          descricao: string
          id: string
          modelo_id: string | null
          numero: number
          nutricionista_id: string
          paciente_id: string
          texto: string
          transacao_id: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          conta_id?: string | null
          created_at?: string
          data?: string
          deleted_at?: string | null
          descricao: string
          id?: string
          modelo_id?: string | null
          numero?: number
          nutricionista_id: string
          paciente_id: string
          texto: string
          transacao_id?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          conta_id?: string | null
          created_at?: string
          data?: string
          deleted_at?: string | null
          descricao?: string
          id?: string
          modelo_id?: string | null
          numero?: number
          nutricionista_id?: string
          paciente_id?: string
          texto?: string
          transacao_id?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recibos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_recibo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_transacao_id_fkey"
            columns: ["transacao_id"]
            isOneToOne: false
            referencedRelation: "transacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      refeicoes: {
        Row: {
          created_at: string
          dias_semana: number[]
          horario: string | null
          id: string
          nome: string
          observacao: string | null
          ordem: number
          plano_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dias_semana?: number[]
          horario?: string | null
          id?: string
          nome: string
          observacao?: string | null
          ordem?: number
          plano_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dias_semana?: number[]
          horario?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          ordem?: number
          plano_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refeicoes_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_alimentares"
            referencedColumns: ["id"]
          },
        ]
      }
      refeicoes_concluidas: {
        Row: {
          created_at: string
          data: string
          id: string
          nutricionista_id: string
          paciente_id: string
          refeicao_id: string
        }
        Insert: {
          created_at?: string
          data: string
          id?: string
          nutricionista_id: string
          paciente_id: string
          refeicao_id: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          nutricionista_id?: string
          paciente_id?: string
          refeicao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refeicoes_concluidas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refeicoes_concluidas_refeicao_id_fkey"
            columns: ["refeicao_id"]
            isOneToOne: false
            referencedRelation: "refeicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_diarios: {
        Row: {
          agua_ml: number
          created_at: string
          data: string
          deleted_at: string | null
          id: string
          nutricionista_id: string
          observacao: string | null
          paciente_id: string
          sintomas: Json
          updated_at: string
        }
        Insert: {
          agua_ml?: number
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          nutricionista_id: string
          observacao?: string | null
          paciente_id: string
          sintomas?: Json
          updated_at?: string
        }
        Update: {
          agua_ml?: number
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          nutricionista_id?: string
          observacao?: string | null
          paciente_id?: string
          sintomas?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_diarios_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_gestacionais: {
        Row: {
          created_at: string
          data: string
          deleted_at: string | null
          gestacao_id: string
          id: string
          nutricionista_id: string
          observacao: string | null
          pa_diastolica: number | null
          pa_sistolica: number | null
          paciente_id: string
          peso: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          gestacao_id: string
          id?: string
          nutricionista_id: string
          observacao?: string | null
          pa_diastolica?: number | null
          pa_sistolica?: number | null
          paciente_id: string
          peso: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          gestacao_id?: string
          id?: string
          nutricionista_id?: string
          observacao?: string | null
          pa_diastolica?: number | null
          pa_sistolica?: number | null
          paciente_id?: string
          peso?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_gestacionais_gestacao_id_fkey"
            columns: ["gestacao_id"]
            isOneToOne: false
            referencedRelation: "gestacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registros_gestacionais_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      registros_prontuario: {
        Row: {
          autor_papel: string
          created_at: string
          data: string
          deleted_at: string | null
          id: string
          nutricionista_id: string
          paciente_id: string
          texto: string
          updated_at: string
          visibilidade: string
        }
        Insert: {
          autor_papel?: string
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          nutricionista_id: string
          paciente_id: string
          texto: string
          updated_at?: string
          visibilidade?: string
        }
        Update: {
          autor_papel?: string
          created_at?: string
          data?: string
          deleted_at?: string | null
          id?: string
          nutricionista_id?: string
          paciente_id?: string
          texto?: string
          updated_at?: string
          visibilidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "registros_prontuario_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_preconsulta: {
        Row: {
          consentimento_em: string | null
          consentimento_versao: string | null
          conta_id: string | null
          created_at: string
          deleted_at: string | null
          email: string
          faixa: string
          faixas: Json
          formulario_id: string | null
          id: string
          importada_em: string | null
          importada_id: string | null
          importada_tipo: string | null
          nivel: string
          nome: string
          nutricionista_id: string
          paciente_id: string | null
          perguntas: Json
          pontuacao: number
          respondido_em: string
          respostas: Json
          telefone: string
          titulo: string
          updated_at: string
        }
        Insert: {
          consentimento_em?: string | null
          consentimento_versao?: string | null
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          faixa?: string
          faixas?: Json
          formulario_id?: string | null
          id?: string
          importada_em?: string | null
          importada_id?: string | null
          importada_tipo?: string | null
          nivel?: string
          nome: string
          nutricionista_id: string
          paciente_id?: string | null
          perguntas?: Json
          pontuacao?: number
          respondido_em?: string
          respostas?: Json
          telefone?: string
          titulo?: string
          updated_at?: string
        }
        Update: {
          consentimento_em?: string | null
          consentimento_versao?: string | null
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          faixa?: string
          faixas?: Json
          formulario_id?: string | null
          id?: string
          importada_em?: string | null
          importada_id?: string | null
          importada_tipo?: string | null
          nivel?: string
          nome?: string
          nutricionista_id?: string
          paciente_id?: string | null
          perguntas?: Json
          pontuacao?: number
          respondido_em?: string
          respostas?: Json
          telefone?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "respostas_preconsulta_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_preconsulta_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "formularios_preconsulta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_preconsulta_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_questionario: {
        Row: {
          created_at: string
          data: string
          deleted_at: string | null
          faixa: string
          faixas: Json
          id: string
          nivel: string
          nutricionista_id: string
          observacao: string
          paciente_id: string
          perguntas: Json
          pontuacao: number
          questionario_id: string | null
          respostas: Json
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          faixa?: string
          faixas?: Json
          id?: string
          nivel?: string
          nutricionista_id: string
          observacao?: string
          paciente_id: string
          perguntas?: Json
          pontuacao?: number
          questionario_id?: string | null
          respostas?: Json
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          faixa?: string
          faixas?: Json
          id?: string
          nivel?: string
          nutricionista_id?: string
          observacao?: string
          paciente_id?: string
          perguntas?: Json
          pontuacao?: number
          questionario_id?: string | null
          respostas?: Json
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "respostas_questionario_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_questionario_questionario_id_fkey"
            columns: ["questionario_id"]
            isOneToOne: false
            referencedRelation: "questionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      resultados_exame: {
        Row: {
          created_at: string
          data: string
          deleted_at: string | null
          exame: string
          id: string
          nutricionista_id: string
          observacao: string
          paciente_id: string
          ref_max: number | null
          ref_min: number | null
          referencia_texto: string
          unidade: string
          updated_at: string
          valor: number | null
          valor_texto: string
        }
        Insert: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          exame: string
          id?: string
          nutricionista_id: string
          observacao?: string
          paciente_id: string
          ref_max?: number | null
          ref_min?: number | null
          referencia_texto?: string
          unidade?: string
          updated_at?: string
          valor?: number | null
          valor_texto?: string
        }
        Update: {
          created_at?: string
          data?: string
          deleted_at?: string | null
          exame?: string
          id?: string
          nutricionista_id?: string
          observacao?: string
          paciente_id?: string
          ref_max?: number | null
          ref_min?: number | null
          referencia_texto?: string
          unidade?: string
          updated_at?: string
          valor?: number | null
          valor_texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "resultados_exame_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes: {
        Row: {
          categoria_id: string | null
          conta_id: string | null
          created_at: string
          data: string
          deleted_at: string | null
          descricao: string
          estornada: boolean
          id: string
          metodo: string
          nutricionista_id: string
          observacao: string | null
          paciente_id: string | null
          recibo_id: string | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data?: string
          deleted_at?: string | null
          descricao: string
          estornada?: boolean
          id?: string
          metodo: string
          nutricionista_id: string
          observacao?: string | null
          paciente_id?: string | null
          recibo_id?: string | null
          tipo: string
          updated_at?: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data?: string
          deleted_at?: string | null
          descricao?: string
          estornada?: boolean
          id?: string
          metodo?: string
          nutricionista_id?: string
          observacao?: string | null
          paciente_id?: string | null
          recibo_id?: string | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_recibo_id_fkey"
            columns: ["recibo_id"]
            isOneToOne: false
            referencedRelation: "recibos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instancias: {
        Row: {
          conectado_em: string | null
          conta_id: string | null
          created_at: string
          erro: string | null
          id: string
          numero_conectado: string | null
          numero_e164: string | null
          nutricionista_id: string
          pedido_em: string | null
          qr_atualizado_em: string | null
          qr_code: string | null
          status: string
          ultimo_ping: string | null
          updated_at: string
        }
        Insert: {
          conectado_em?: string | null
          conta_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          numero_conectado?: string | null
          numero_e164?: string | null
          nutricionista_id: string
          pedido_em?: string | null
          qr_atualizado_em?: string | null
          qr_code?: string | null
          status?: string
          ultimo_ping?: string | null
          updated_at?: string
        }
        Update: {
          conectado_em?: string | null
          conta_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          numero_conectado?: string | null
          numero_e164?: string | null
          nutricionista_id?: string
          pedido_em?: string | null
          qr_atualizado_em?: string | null
          qr_code?: string | null
          status?: string
          ultimo_ping?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instancias_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aceitar_convites_do_email: {
        Args: { p_email: string; p_user: string }
        Returns: Json
      }
      aceitar_no_acesso: {
        Args: {
          p_nascimento?: string
          p_origem: string
          p_saude?: boolean
          p_versao: string
          p_versao_app?: string
        }
        Returns: Json
      }
      agenda_garantir_bases: { Args: { p_prof: string }; Returns: undefined }
      agenda_garantir_tags: { Args: never; Returns: Json }
      agenda_horarios: {
        Args: {
          p_ate: string
          p_calendario: string
          p_de: string
          p_duracao?: number
          p_ignorar?: string
        }
        Returns: Json
      }
      agenda_pacote_situacao: {
        Args: { p_paciente: string; p_prof: string }
        Returns: Json
      }
      agenda_regras_de: { Args: { p_prof: string }; Returns: Json }
      agenda_reserva_email_falhou: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      agenda_reservar_email: { Args: { p_agendamento: string }; Returns: Json }
      agenda_slots: {
        Args: {
          p_ate: string
          p_calendario: string
          p_de: string
          p_duracao?: number
          p_ignorar?: string
          p_prof: string
        }
        Returns: {
          s_estado: string
          s_fim: string
          s_inicio: string
        }[]
      }
      agenda_sou_profissional: { Args: never; Returns: boolean }
      agenda_tag_base: {
        Args: { p_area: string; p_prof: string }
        Returns: string
      }
      ajustes_do_aluno: {
        Args: { p_config: Json; p_tem_login: boolean }
        Returns: Json
      }
      alterar_papeis_membro: {
        Args: { p_membro: string; p_papeis: string[] }
        Returns: Json
      }
      aluno_acesso: { Args: { p_aluno: string }; Returns: Json }
      aluno_agenda_confirmar: { Args: { p_agendamento: string }; Returns: Json }
      aluno_agenda_desistir: { Args: { p_agendamento: string }; Returns: Json }
      aluno_agenda_horarios: {
        Args: {
          p_agendamento?: string
          p_ate?: string
          p_de?: string
          p_profissional?: string
        }
        Returns: Json
      }
      aluno_agenda_marcar: {
        Args: { p_inicio: string; p_profissional: string }
        Returns: Json
      }
      aluno_agenda_reagendar: {
        Args: { p_agendamento: string; p_inicio: string }
        Returns: Json
      }
      aluno_anotacoes: {
        Args: { p_aluno: string; p_limite?: number; p_offset?: number }
        Returns: Json
      }
      aluno_ativar: {
        Args: { p_ativo: boolean; p_paciente: string }
        Returns: Json
      }
      aluno_avisar_avaliacao: { Args: { p_aluno: string }; Returns: Json }
      aluno_avisar_plano: {
        Args: { p_aluno: string; p_modulos: string[] }
        Returns: Json
      }
      aluno_bloquear: {
        Args: { p_bloquear: boolean; p_msg?: string; p_paciente: string }
        Returns: Json
      }
      aluno_compromissos: { Args: { p_aluno: string }; Returns: Json }
      aluno_convidar: {
        Args: {
          p_conta: string
          p_email: string
          p_modulos: string[]
          p_responsavel?: string
        }
        Returns: Json
      }
      aluno_convite_acao: {
        Args: { p_acao: string; p_convite: string }
        Returns: Json
      }
      aluno_convites: { Args: { p_conta: string }; Returns: Json }
      aluno_criar: { Args: { p_conta: string; p_dados: Json }; Returns: Json }
      aluno_definir_pacote: {
        Args: {
          p_aluno: string
          p_mes_inicio?: string
          p_profissional: string
          p_total: number
        }
        Returns: Json
      }
      aluno_enviar_plano: {
        Args: { p_aluno: string; p_modulos: string[] }
        Returns: Json
      }
      aluno_enviar_plano_falhou: {
        Args: { p_aviso: string }
        Returns: undefined
      }
      aluno_evolucao: { Args: { p_aluno: string }; Returns: Json }
      aluno_le_foto_diario: { Args: { p_path: string }; Returns: boolean }
      aluno_le_foto_evolucao: { Args: { p_path: string }; Returns: boolean }
      aluno_marcar_meta: {
        Args: { p_concluida: boolean; p_data: string; p_meta_id: string }
        Returns: boolean
      }
      aluno_novo_link: { Args: { p_aluno: string }; Returns: Json }
      aluno_pendente_decidir: {
        Args: { p_aprovar: boolean; p_conta: string; p_pendente: string }
        Returns: Json
      }
      aluno_perfil: { Args: { p_aluno: string }; Returns: Json }
      aluno_remover: { Args: { p_paciente: string }; Returns: Json }
      aluno_responsavel: { Args: { p_aluno: string }; Returns: Json }
      aluno_responsavel_registrar: {
        Args: { p_aluno: string; p_dados: Json }
        Returns: Json
      }
      aluno_salvar_ajustes: {
        Args: { p_ajustes: Json; p_aluno: string }
        Returns: Json
      }
      aluno_salvar_dados: {
        Args: { p_aluno: string; p_dados: Json }
        Returns: Json
      }
      aluno_treino: { Args: { p_aluno: string }; Returns: Json }
      alunos_atribuir: {
        Args: {
          p_conta: string
          p_modulo: string
          p_pacientes: string[]
          p_responsavel: string
        }
        Returns: Json
      }
      alunos_como: {
        Args: { p_acao: string; p_args: Json; p_user: string }
        Returns: Json
      }
      alunos_da_conta: {
        Args: {
          p_conta: string
          p_filtros?: Json
          p_limite?: number
          p_offset?: number
        }
        Returns: Json
      }
      alunos_novos_por_mes: {
        Args: { p_conta: string; p_meses?: number }
        Returns: Json
      }
      alunos_pendentes: { Args: { p_conta: string }; Returns: Json }
      anexo_permitido: {
        Args: { p_acao: string; p_path: string }
        Returns: boolean
      }
      anotacao_valida: {
        Args: { p_paciente: string; p_papel: string; p_visibilidade: string }
        Returns: boolean
      }
      aplicar_pagamento_conta: {
        Args: { p_fatura: string; p_pago_em?: string }
        Returns: Json
      }
      app_fim_do_teste: { Args: { p_inicio?: string }; Returns: string }
      app_rotulo_objetivo: { Args: { p_objetivo: string }; Returns: string }
      app_teste_dias: { Args: never; Returns: number }
      app_trocar_plano: {
        Args: { p_paciente: string; p_plano: string; p_por: string }
        Returns: Json
      }
      automaticas_disparar: { Args: never; Returns: number }
      automaticas_enfileirar: {
        Args: { p_motivo: string; p_pacientes: string[] }
        Returns: number
      }
      cadastro_link_enviar: {
        Args: { p_codigo: string; p_dados: Json }
        Returns: Json
      }
      cadastro_link_info: { Args: { p_codigo: string }; Returns: Json }
      cadastro_pendente_aprovar: { Args: { p_id: string }; Returns: string }
      cadastro_publico_enviar: {
        Args: {
          p_apelido: string
          p_codigo: string
          p_cpf: string
          p_email: string
          p_genero: string
          p_nascimento: string
          p_nome: string
          p_observacoes: string
          p_telefone: string
        }
        Returns: Json
      }
      cadastro_publico_info: { Args: { p_codigo: string }; Returns: Json }
      cancelar_convite_membro: { Args: { p_convite: string }; Returns: Json }
      cobranca_hoje: { Args: never; Returns: string }
      cobrancas_atualizar_bloqueio: { Args: never; Returns: Json }
      conta_alunos_ativos: { Args: { p_conta: string }; Returns: number }
      conta_do_app: { Args: never; Returns: string }
      conta_limite_alunos: { Args: { p_conta: string }; Returns: number }
      conta_pode_adicionar_aluno: {
        Args: { p_conta: string }
        Returns: boolean
      }
      conta_preco: {
        Args: {
          p_conta: string
          p_faixa: string
          p_meses?: number
          p_plano: string
        }
        Returns: number
      }
      conta_tem_modulo: {
        Args: { p_conta: string; p_modulo: string }
        Returns: boolean
      }
      contas_tarefa_diaria: {
        Args: { p_conta?: string; p_hoje?: string }
        Returns: Json
      }
      convidar_membro: {
        Args: { p_conta: string; p_email: string; p_papeis: string[] }
        Returns: Json
      }
      criar_minha_conta: {
        Args: { p_nome: string; p_registro?: string; p_tipo: string }
        Returns: Json
      }
      desvincular_do_profissional: {
        Args: { p_aluno: string; p_profissional: string }
        Returns: Json
      }
      diario_enviar: {
        Args: {
          p_codigo: string
          p_comentario: string
          p_data_hora: string
          p_mime: string
          p_path: string
          p_refeicao: string
          p_tamanho: number
        }
        Returns: Json
      }
      diario_foto_permitida: {
        Args: { p_acao: string; p_path: string }
        Returns: boolean
      }
      diario_link: { Args: { p_codigo: string }; Returns: Json }
      diario_listar: { Args: { p_codigo: string }; Returns: Json }
      diario_paciente: { Args: { p_codigo: string }; Returns: Json }
      diario_pasta_valida: { Args: { p_name: string }; Returns: boolean }
      diario_pode_apagar_foto: { Args: { p_path: string }; Returns: boolean }
      diario_pode_ler_foto: { Args: { p_path: string }; Returns: boolean }
      dieta_copiar_semana: {
        Args: { p_para_apagar: string[]; p_para_todos: string[] }
        Returns: Json
      }
      dieta_criar_plano: {
        Args: { p_paciente: string; p_plano: Json; p_refeicoes: Json }
        Returns: Json
      }
      dieta_duplicar_plano: {
        Args: { p_paciente?: string; p_plano: string; p_titulo: string }
        Returns: string
      }
      dieta_excluir_grupo_receita: {
        Args: { p_grupo: string }
        Returns: number
      }
      dieta_ordenar: {
        Args: { p_ids: string[]; p_ordens: number[]; p_tabela: string }
        Returns: number
      }
      dieta_salvar_alimento: {
        Args: { p_alimento: Json; p_medidas: Json }
        Returns: string
      }
      dieta_salvar_receita: {
        Args: { p_ingredientes: Json; p_receita: Json }
        Returns: string
      }
      eh_master: { Args: never; Returns: boolean }
      eh_paciente: { Args: never; Returns: boolean }
      email_de_teste: { Args: { p_email: string }; Returns: boolean }
      entrar_sem_profissional:
        | { Args: { p_objetivo: string; p_plano: string }; Returns: Json }
        | {
            Args: {
              p_consentimento: string
              p_nascimento: string
              p_objetivo: string
              p_origem: string
              p_plano: string
            }
            Returns: Json
          }
      equipe_da_conta: { Args: { p_conta: string }; Returns: Json }
      equipe_motivo_bloqueio: { Args: { p_conta: string }; Returns: string }
      escrevo_nutricao: { Args: never; Returns: boolean }
      espelho_disparar: { Args: never; Returns: number }
      espelho_enfileirar: {
        Args: { p_payload: Json; p_tipo: string }
        Returns: undefined
      }
      exames_do_aluno: {
        Args: {
          p_aluno: string
          p_exame?: string
          p_limite?: number
          p_offset?: number
        }
        Returns: Json
      }
      excluir_conta_profissional: {
        Args: { p_simular?: boolean; p_uid: string }
        Returns: Json
      }
      excluir_dados_aluno: {
        Args: { p_simular?: boolean; p_uid: string }
        Returns: Json
      }
      exportar_dados_aluno: { Args: { p_uid: string }; Returns: Json }
      financeiro_do_aluno: { Args: never; Returns: Json }
      financeiro_emitir_recibo: { Args: { p_recibo: Json }; Returns: string }
      financeiro_excluir_recibo: { Args: { p_recibo: string }; Returns: number }
      financeiro_garantir_padroes: {
        Args: { p_categorias: string[]; p_conta: string; p_modelo: Json }
        Returns: Json
      }
      financeiro_lancamentos: {
        Args: {
          p_ate: string
          p_conta: string
          p_de: string
          p_filtros?: Json
          p_limite?: number
          p_offset?: number
        }
        Returns: Json
      }
      financeiro_proxima_ancora: {
        Args: { p_base: string; p_dia: number }
        Returns: string
      }
      financeiro_recibos: {
        Args: {
          p_conta: string
          p_filtros?: Json
          p_limite?: number
          p_offset?: number
        }
        Returns: Json
      }
      financeiro_resumo_periodo: {
        Args: { p_ate: string; p_conta: string; p_de: string; p_filtros?: Json }
        Returns: Json
      }
      financeiro_totais_do_aluno: { Args: { p_aluno: string }; Returns: Json }
      financeiro_transacoes_visiveis: {
        Args: {
          p_ate: string
          p_conta: string
          p_de: string
          p_dono: boolean
          p_filtros: Json
          p_master: boolean
          p_uid: string
        }
        Returns: {
          casa: boolean
          categoria_id: string
          categoria_nome: string
          conta_id: string
          created_at: string
          data: string
          descricao: string
          estornada: boolean
          id: string
          metodo: string
          nutricionista_id: string
          observacao: string
          paciente_cpf: string
          paciente_id: string
          paciente_nome: string
          paciente_visivel: boolean
          recibo_id: string
          tipo: string
          valor: number
        }[]
      }
      garantir_meu_codigo: { Args: { p_conta: string }; Returns: Json }
      gerar_codigo_membro: { Args: { p_nome: string }; Returns: string }
      grupos_alimentos: {
        Args: never
        Returns: {
          grupo: string
          total: number
        }[]
      }
      h4_instante: { Args: { p: string }; Returns: string }
      idade_em: { Args: { p_nascimento: string }; Returns: number }
      infinitepay_fechar_vencidas: {
        Args: { p_paciente?: string }
        Returns: number
      }
      infinitepay_rodada: { Args: never; Returns: Json }
      ip_do_pedido_hash: { Args: never; Returns: string }
      legal_da_situacao: { Args: { p_uid: string }; Returns: Json }
      limite_publico: {
        Args: { p_erro: string; p_max: number; p_rota: string }
        Returns: undefined
      }
      lixeira_apagar: { Args: { p_id: string; p_tipo: string }; Returns: Json }
      lixeira_da_conta: {
        Args: {
          p_busca?: string
          p_conta: string
          p_limite?: number
          p_offset?: number
          p_tipo?: string
        }
        Returns: Json
      }
      lixeira_montar: {
        Args: {
          p_busca: string
          p_conta: string
          p_limite: number
          p_nutri: boolean
          p_offset: number
          p_tem_nutricao: boolean
          p_tipo: string
        }
        Returns: Json
      }
      lixeira_purgar: { Args: never; Returns: Json }
      lixeira_restaurar: {
        Args: { p_id: string; p_tipo: string }
        Returns: Json
      }
      login_captcha_usar: { Args: { p_hash: string }; Returns: boolean }
      login_concluir: {
        Args: { p_email: string; p_resultado: string }
        Returns: Json
      }
      login_destravar: { Args: { p_email: string }; Returns: boolean }
      login_estado: { Args: { p_email: string }; Returns: Json }
      login_iniciar: {
        Args: { p_email: string; p_ip_hash?: string }
        Returns: Json
      }
      login_regras: { Args: never; Returns: Json }
      manter_ativo: { Args: never; Returns: boolean }
      marcar_aviso_mudanca: { Args: { p_versao?: string }; Returns: undefined }
      master_alunos: {
        Args: { p_filtros?: Json; p_limite?: number; p_offset?: number }
        Returns: Json
      }
      master_alunos_do_app: {
        Args: { p_busca?: string; p_limite?: number; p_offset?: number }
        Returns: Json
      }
      master_buscar_alimentos: { Args: { p_termo: string }; Returns: Json }
      master_conta_acao: {
        Args: { p_acao: string; p_args?: Json; p_conta: string }
        Returns: Json
      }
      master_conta_detalhe: { Args: { p_conta: string }; Returns: Json }
      master_contas: {
        Args: { p_filtros?: Json; p_limite?: number; p_offset?: number }
        Returns: Json
      }
      master_criar_conta: {
        Args: {
          p_faixa?: string
          p_isentar?: boolean
          p_motivo?: string
          p_nome: string
          p_plano?: string
          p_registro?: string
          p_tipo: string
          p_user: string
        }
        Returns: Json
      }
      master_criar_profissional: {
        Args: { p_email: string; p_nome: string; p_senha: string }
        Returns: string
      }
      master_definir_acesso: {
        Args: { p_ativo: boolean; p_id: string }
        Returns: undefined
      }
      master_definir_papel: {
        Args: { p_id: string; p_role: string }
        Returns: undefined
      }
      master_excluir_profissional: {
        Args: { p_id: string }
        Returns: undefined
      }
      master_financeiro: {
        Args: { p_filtro?: string; p_limite?: number; p_offset?: number }
        Returns: Json
      }
      master_integracoes: {
        Args: { p_limite?: number; p_offset?: number }
        Returns: Json
      }
      master_mover_alunos: {
        Args: {
          p_conta: string
          p_nutri?: string
          p_pacientes: string[]
          p_personal?: string
          p_usuarios: string[]
        }
        Returns: Json
      }
      master_planos: { Args: never; Returns: Json }
      master_prato_salvar: { Args: { p_prato: Json }; Returns: Json }
      master_pratos_prontos: { Args: never; Returns: Json }
      master_profissionais: { Args: never; Returns: Json }
      master_registrar_pagamento: {
        Args: {
          p_conta: string
          p_descricao?: string
          p_meses?: number
          p_pago_em?: string
          p_valor: number
        }
        Returns: Json
      }
      master_salvar_config: {
        Args: { p_chave: string; p_valor: Json }
        Returns: Json
      }
      master_salvar_preco: {
        Args: {
          p_ativo?: boolean
          p_faixa: string
          p_plano: string
          p_valor_anual?: number
          p_valor_mensal: number
        }
        Returns: Json
      }
      master_sem_conta: {
        Args: { p_busca?: string; p_limite?: number; p_offset?: number }
        Returns: Json
      }
      master_tornar_master: { Args: { p_user: string }; Returns: Json }
      master_visao_geral: { Args: never; Returns: Json }
      matricular_na_conta: {
        Args: {
          p_conta: string
          p_ignorar_regras?: boolean
          p_nutricionista: string
          p_origem?: string
          p_personal: string
          p_user: string
        }
        Returns: Json
      }
      matricular_no_app: {
        Args: {
          p_motivo?: string
          p_objetivo?: string
          p_plano?: string
          p_teste?: boolean
          p_user: string
        }
        Returns: Json
      }
      mensagens_aviso_fechar: { Args: never; Returns: Json }
      mensagens_desligadas: { Args: never; Returns: Json }
      mensagens_ligar_para_todos: { Args: { p_ids: string[] }; Returns: Json }
      mensalidade_recalcular: { Args: { p_paciente: string }; Returns: string }
      meu_paciente_id: { Args: never; Returns: string }
      meu_perfil_aluno: { Args: never; Returns: Json }
      meu_plano_app: { Args: never; Returns: Json }
      minha_agenda: { Args: { p_desde?: string }; Returns: Json }
      minha_agenda_lista: {
        Args: { p_limite?: number; p_offset?: number; p_tipo: string }
        Returns: Json
      }
      minha_dieta: { Args: { p_dia?: string }; Returns: Json }
      minha_evolucao: { Args: never; Returns: Json }
      minha_nutricionista_id: { Args: never; Returns: string }
      minha_senha_definida: { Args: never; Returns: boolean }
      minha_situacao: { Args: never; Returns: Json }
      minhas_regras_agenda: { Args: never; Returns: Json }
      modulos_do_plano: { Args: { p_plano: string }; Returns: string[] }
      mp_automaticas_vivas: { Args: { p_conta: string }; Returns: number }
      mp_contas_renovar_disparar: { Args: never; Returns: number }
      mp_integracao_reservar: {
        Args: { p_conta: string; p_segundos?: number }
        Returns: boolean
      }
      mudar_objetivo_app: { Args: { p_objetivo: string }; Returns: Json }
      nome_da_pessoa: { Args: { p_user: string }; Returns: string }
      normalizar_cpf: { Args: { p: string }; Returns: string }
      normalizar_email: { Args: { p: string }; Returns: string }
      nutricao_garantir_padroes: {
        Args: { p_itens: Json; p_secao: string }
        Returns: Json
      }
      paciente_acesso: { Args: { p_paciente_id: string }; Returns: Json }
      paciente_conflitos: {
        Args: { p_cpf: string; p_email: string; p_id: string; p_user: string }
        Returns: {
          campo: string
          outro: string
        }[]
      }
      paciente_conflitos_novos: {
        Args: {
          p_cpf: string
          p_cpf_antes: string
          p_email: string
          p_email_antes: string
          p_id: string
          p_user: string
          p_user_antes: string
          p_vivo_antes: boolean
        }
        Returns: string[]
      }
      paciente_criar_acesso: {
        Args: { p_email: string; p_paciente_id: string; p_senha: string }
        Returns: string
      }
      paciente_dado_livre: {
        Args: { p_cpf?: string; p_email?: string; p_paciente?: string }
        Returns: Json
      }
      paciente_definir_acesso: {
        Args: { p_ativo: boolean; p_paciente_id: string }
        Returns: undefined
      }
      paciente_do_meu_login: { Args: { p_paciente: string }; Returns: boolean }
      paciente_marcar_refeicao: {
        Args: { p_concluida: boolean; p_data: string; p_refeicao_id: string }
        Returns: boolean
      }
      paciente_redefinir_senha: {
        Args: { p_paciente_id: string; p_senha: string }
        Returns: undefined
      }
      paciente_remover_acesso: {
        Args: { p_paciente_id: string }
        Returns: undefined
      }
      painel_resumo: { Args: { p_conta: string }; Returns: Json }
      papeis_de_modulo: { Args: { p_papeis: string[] }; Returns: string[] }
      papeis_do_plano: { Args: { p_conta: string }; Returns: string[] }
      papeis_permitidos: {
        Args: { p_conta: string; p_papeis: string[] }
        Returns: boolean
      }
      papeis_permitidos_do_dono: {
        Args: { p_conta: string; p_papeis: string[] }
        Returns: boolean
      }
      physiq_tem_senha: { Args: { p_user: string }; Returns: boolean }
      plano_alimentar: { Args: { p_plano: string }; Returns: Json }
      plano_alimentar_json: { Args: { p_plano: string }; Returns: Json }
      plano_max_alunos: {
        Args: { p_faixa: string; p_plano: string }
        Returns: number
      }
      plano_valor_do_pagamento: {
        Args: { p_modalidade: string; p_negociado: number; p_plano: string }
        Returns: number
      }
      planos_do_aluno: { Args: { p_aluno: string }; Returns: Json }
      planos_favoritos: { Args: never; Returns: Json }
      pode_apagar_anexo: { Args: { p_path: string }; Returns: boolean }
      pode_editar_aluno: {
        Args: { p_modulo?: string; p_paciente: string }
        Returns: boolean
      }
      pode_ler_anexo: { Args: { p_path: string }; Returns: boolean }
      pode_ler_comprovante: { Args: { p_path: string }; Returns: boolean }
      pode_mexer_no_acesso: { Args: { p_paciente: string }; Returns: boolean }
      pode_subir_anexo: { Args: { p_path: string }; Returns: boolean }
      pode_ver_aluno: { Args: { p_paciente: string }; Returns: boolean }
      pode_ver_clinico: { Args: { p_paciente: string }; Returns: boolean }
      pode_ver_nutricao_aluno: {
        Args: { p_paciente: string }
        Returns: boolean
      }
      pode_ver_plano_alimentar: { Args: { p_plano: string }; Returns: boolean }
      pode_ver_refeicao: { Args: { p_refeicao: string }; Returns: boolean }
      pode_ver_resposta_preconsulta: {
        Args: { p_autor: string; p_conta: string }
        Returns: boolean
      }
      pratos_prontos_do_app: { Args: { p_objetivo?: string }; Returns: Json }
      preconsulta_autor_nutri: {
        Args: { p_autor: string; p_conta: string }
        Returns: boolean
      }
      preconsulta_formulario: { Args: { p_slug: string }; Returns: Json }
      preconsulta_numeros: {
        Args: { p_agora?: string; p_conta: string; p_inicio_mes: string }
        Returns: Json
      }
      preconsulta_responder:
        | {
            Args: {
              p_email: string
              p_nome: string
              p_respostas: Json
              p_slug: string
              p_telefone: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_consentimento: string
              p_email: string
              p_nome: string
              p_respostas: Json
              p_slug: string
              p_telefone: string
            }
            Returns: Json
          }
      previa_vinculo_por_codigo: {
        Args: { p_codigo: string; p_user: string }
        Returns: Json
      }
      profissional_le_foto_evolucao: {
        Args: { p_path: string }
        Returns: boolean
      }
      push_esquecer: { Args: { p_token: string }; Returns: Json }
      push_registrar: {
        Args: { p_plataforma?: string; p_token: string; p_versao?: string }
        Returns: Json
      }
      recebimento_chave_ligar: {
        Args: { p_chave: string; p_conta: string; p_ligar: boolean }
        Returns: Json
      }
      recebimento_infinitepay_salvar: {
        Args: { p_conta: string; p_handle: string }
        Returns: Json
      }
      recebimento_integracao_ativa: {
        Args: { p_conta: string; p_provedor: string }
        Returns: boolean
      }
      recebimento_mp_confirmar: { Args: { p_conexao: string }; Returns: Json }
      receitas_da_nutricionista: {
        Args: { p_filtros?: Json; p_limite?: number; p_offset?: number }
        Returns: Json
      }
      registrar_aviso_erro: {
        Args: {
          p_assinatura: string
          p_exemplo: string
          p_lugar: string
          p_origem: string
        }
        Returns: number
      }
      registrar_nutri_legado: { Args: { p_user: string }; Returns: Json }
      registrar_profissional_treino: {
        Args: {
          p_codigo: string
          p_faixa?: string
          p_isenta_motivo?: string
          p_nome: string
          p_origem: string
          p_situacao?: string
          p_teste_ate?: string
          p_tolerancia?: number
          p_treino_user_id?: string
          p_user: string
          p_vence_em?: string
        }
        Returns: Json
      }
      remover_membro: {
        Args: {
          p_membro: string
          p_novo_nutri?: string
          p_novo_personal?: string
        }
        Returns: Json
      }
      responsavel_vigente: { Args: { p_paciente: string }; Returns: boolean }
      respostas_da_conta: {
        Args: {
          p_conta: string
          p_filtros?: Json
          p_limite?: number
          p_offset?: number
        }
        Returns: Json
      }
      saude_vigente: { Args: { p_uid: string }; Returns: boolean }
      situacao_da_conta_em: {
        Args: {
          p_dia: string
          p_situacao: string
          p_teste_ate: string
          p_tolerancia: number
          p_vence_em: string
        }
        Returns: string
      }
      sou_dono: { Args: { p_conta: string }; Returns: boolean }
      sou_master: { Args: never; Returns: boolean }
      sou_membro: { Args: { p_conta: string }; Returns: boolean }
      sou_nutri_do_aluno: { Args: { p_paciente: string }; Returns: boolean }
      sou_o_membro: {
        Args: { p_conta: string; p_membro: string }
        Returns: boolean
      }
      tenho_papel: {
        Args: { p_conta: string; p_papel: string }
        Returns: boolean
      }
      texto_busca: { Args: { t: string }; Returns: string }
      texto_busca_paciente: {
        Args: {
          apelido: string
          cpf: string
          email: string
          nome: string
          tags: string[]
          telefone: string
        }
        Returns: string
      }
      versao_dos_textos: { Args: never; Returns: string }
      vincular_aluno_por_codigo: {
        Args: { p_codigo: string; p_user: string }
        Returns: Json
      }
      w13_conta_do_personal: { Args: { p_user: string }; Returns: string }
      w13_conta_travada: { Args: { p_conta: string }; Returns: boolean }
      w13_dono_do_codigo: {
        Args: { p_codigo: string }
        Returns: {
          conta_id: string
          user_id: string
        }[]
      }
      w13_erro_limite: { Args: { p_conta: string }; Returns: Json }
      w13_foto_do_aluno: {
        Args: { p_foto: string; p_user: string }
        Returns: string
      }
      w13_modulos_do_aluno: {
        Args: { p_nutri: string; p_personal: string; p_plano: string }
        Returns: string[]
      }
      w13_pode_gerir: { Args: { p_paciente: string }; Returns: boolean }
      w14_ajuste: {
        Args: { p_chave: string; p_config: Json; p_padrao: boolean }
        Returns: boolean
      }
      w14_matricula_da_rota: { Args: { p_aluno: string }; Returns: string }
      w14_pode_editar: { Args: { p_paciente: string }; Returns: boolean }
      w20_avisar: {
        Args: { p_link: string; p_titulo: string; p_user: string }
        Returns: undefined
      }
      w20_consulta_do_aluno: {
        Args: { p_agendamento: string }
        Returns: {
          aluno_respondeu_em: string | null
          aviso_email_em: string | null
          calendario_id: string
          confirmacao: string
          conta_id: string | null
          created_at: string
          deleted_at: string | null
          dia_inteiro: boolean
          fim: string
          id: string
          inicio: string
          mes_referencia: string | null
          modulo: string
          nutricionista_id: string
          observacao: string | null
          origem: string
          paciente_id: string | null
          reagendamentos: number
          status: string
          tag_id: string | null
          titulo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agendamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      w20_janela: {
        Args: { p_janela: string; p_mes_ref: string }
        Returns: {
          j_ate: string
          j_de: string
        }[]
      }
      w20_mes: { Args: { p: string }; Returns: string }
      w20_minutos: { Args: { p: string }; Returns: number }
      w20_quando: { Args: { p: string }; Returns: string }
      w26_lixeira_clinico_mexe: {
        Args: { p_paciente: string }
        Returns: boolean
      }
      w26_lixeira_clinico_ve: { Args: { p_paciente: string }; Returns: boolean }
      w26_lixeira_resposta_mexe: {
        Args: { p_autor: string; p_conta: string }
        Returns: boolean
      }
      w26_restaurar_aluno: { Args: { p_paciente: string }; Returns: Json }
      w27_conta_linha: { Args: { p_conta: string }; Returns: Json }
      w27_nome: { Args: { p_user: string }; Returns: string }
      w27_peso: { Args: { p_sit: string }; Returns: number }
      w27_situacao: {
        Args: {
          p_legada: boolean
          p_origem: string
          p_situacao: string
          p_teste: string
          p_tol: number
          p_vence: string
        }
        Returns: string
      }
      w27_usuario_por_email: { Args: { p_email: string }; Returns: Json }
      w28_desfazer_conta_legada: {
        Args: { p_antes: Json; p_conta: string }
        Returns: Json
      }
      w28_migrar_conta_legada: {
        Args: { p_conta: string; p_dados: Json }
        Returns: Json
      }
      w2l_assina_no_schema: {
        Args: { p_schema: string; p_uid: string }
        Returns: boolean
      }
      w2l_limpar_perfil: {
        Args: { p_schema: string; p_uid: string }
        Returns: Json
      }
      w2l_prontuarios_para_baixar: {
        Args: { p_conta: string; p_pacientes: string[] }
        Returns: Json
      }
      whatsapp_destino: { Args: { p_telefone: string }; Returns: string }
      whatsapp_destravar_fila: { Args: never; Returns: Json }
      whatsapp_enfileirar: { Args: never; Returns: Json }
      whatsapp_falhas_vistas_em: { Args: { p_config: Json }; Returns: string }
      whatsapp_fila: {
        Args: {
          p_antes?: string
          p_antes_id?: string
          p_conta?: string
          p_escopo?: string
          p_filtro?: string
          p_limite?: number
        }
        Returns: Json
      }
      whatsapp_limpar_falhas: { Args: never; Returns: Json }
      whatsapp_preferencias: { Args: { p_config: Json }; Returns: Json }
      whatsapp_reenviar: { Args: { p_id: string }; Returns: Json }
      whatsapp_resumo: { Args: { p_conta?: string }; Returns: Json }
      whatsapp_salvar_config: { Args: { p_whatsapp: Json }; Returns: Json }
      whatsapp_texto: {
        Args: {
          p_data: string
          p_hora: string
          p_momento: string
          p_nome: string
          p_profissional: string
          p_textos: Json
          p_valor: number
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

