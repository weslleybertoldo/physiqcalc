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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          calendario_id: string
          confirmacao: string
          conta_id: string | null
          created_at: string
          deleted_at: string | null
          dia_inteiro: boolean
          fim: string
          id: string
          inicio: string
          modulo: string
          nutricionista_id: string
          observacao: string | null
          paciente_id: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          calendario_id: string
          confirmacao?: string
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          dia_inteiro?: boolean
          fim: string
          id?: string
          inicio: string
          modulo?: string
          nutricionista_id: string
          observacao?: string | null
          paciente_id?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          calendario_id?: string
          confirmacao?: string
          conta_id?: string | null
          created_at?: string
          deleted_at?: string | null
          dia_inteiro?: boolean
          fim?: string
          id?: string
          inicio?: string
          modulo?: string
          nutricionista_id?: string
          observacao?: string | null
          paciente_id?: string | null
          status?: string
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
          mp_preapproval_id: string | null
          paciente_id: string
          status: string
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          conta_id?: string | null
          criado_em?: string
          id?: string
          mp_preapproval_id?: string | null
          paciente_id: string
          status?: string
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          conta_id?: string | null
          criado_em?: string
          id?: string
          mp_preapproval_id?: string | null
          paciente_id?: string
          status?: string
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
          id: string
          lido_em: string | null
          link: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          criado_em?: string
          destino_user_id: string
          id?: string
          lido_em?: string | null
          link?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          criado_em?: string
          destino_user_id?: string
          id?: string
          lido_em?: string | null
          link?: string | null
          tipo?: string
          titulo?: string
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
          comprovante_path: string | null
          conta_id: string | null
          created_at: string
          criado_por: string | null
          deleted_at: string | null
          descricao: string
          forma: string | null
          id: string
          mp_payment_id: string | null
          nutricionista_id: string
          origem: string | null
          paciente_id: string
          pago_em: string | null
          plano_aluno_id: string | null
          status: string
          transacao_id: string | null
          updated_at: string
          valor: number
          vencimento: string
        }
        Insert: {
          comprovante_path?: string | null
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          descricao: string
          forma?: string | null
          id?: string
          mp_payment_id?: string | null
          nutricionista_id: string
          origem?: string | null
          paciente_id: string
          pago_em?: string | null
          plano_aluno_id?: string | null
          status?: string
          transacao_id?: string | null
          updated_at?: string
          valor: number
          vencimento: string
        }
        Update: {
          comprovante_path?: string | null
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          deleted_at?: string | null
          descricao?: string
          forma?: string | null
          id?: string
          mp_payment_id?: string | null
          nutricionista_id?: string
          origem?: string | null
          paciente_id?: string
          pago_em?: string | null
          plano_aluno_id?: string | null
          status?: string
          transacao_id?: string | null
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
          id: string
          mp_preapproval_id: string | null
          payload: Json | null
          proximo_vencimento: string | null
          status: string
          ultimo_pagamento_em: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          conta_id: string
          criado_em?: string
          id?: string
          mp_preapproval_id?: string | null
          payload?: Json | null
          proximo_vencimento?: string | null
          status?: string
          ultimo_pagamento_em?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          conta_id?: string
          criado_em?: string
          id?: string
          mp_preapproval_id?: string | null
          payload?: Json | null
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
          forma: string | null
          id: string
          mp_payment_id: string | null
          mp_preapproval_id: string | null
          origem: string | null
          pago_em: string | null
          pix_copia_cola: string | null
          pix_expira_em: string | null
          pix_qr: string | null
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
          forma?: string | null
          id?: string
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          origem?: string | null
          pago_em?: string | null
          pix_copia_cola?: string | null
          pix_expira_em?: string | null
          pix_qr?: string | null
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
          forma?: string | null
          id?: string
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          origem?: string | null
          pago_em?: string | null
          pix_copia_cola?: string | null
          pix_expira_em?: string | null
          pix_qr?: string | null
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
          ativo: boolean
          bloqueado_por_pagamento: boolean
          busca: string | null
          config: Json
          conta_id: string | null
          cpf: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          foto_url: string | null
          genero: string | null
          id: string
          link_codigo: string
          nascimento: string | null
          nome: string
          nutricionista_id: string | null
          objetivo: string | null
          origem: string | null
          personal_id: string | null
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
          ativo?: boolean
          bloqueado_por_pagamento?: boolean
          busca?: string | null
          config?: Json
          conta_id?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          link_codigo?: string
          nascimento?: string | null
          nome: string
          nutricionista_id?: string | null
          objetivo?: string | null
          origem?: string | null
          personal_id?: string | null
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
          ativo?: boolean
          bloqueado_por_pagamento?: boolean
          busca?: string | null
          config?: Json
          conta_id?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          link_codigo?: string
          nascimento?: string | null
          nome?: string
          nutricionista_id?: string | null
          objetivo?: string | null
          origem?: string | null
          personal_id?: string | null
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
          conta_id: string
          criado_em: string
          id: string
          nome: string
          valor: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          conta_id: string
          criado_em?: string
          id?: string
          nome: string
          valor?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          conta_id?: string
          criado_em?: string
          id?: string
          nome?: string
          valor?: number | null
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
      cobrancas_atualizar_bloqueio: { Args: never; Returns: Json }
      conta_alunos_ativos: { Args: { p_conta: string }; Returns: number }
      conta_limite_alunos: { Args: { p_conta: string }; Returns: number }
      conta_pode_adicionar_aluno: {
        Args: { p_conta: string }
        Returns: boolean
      }
      conta_tem_modulo: {
        Args: { p_conta: string; p_modulo: string }
        Returns: boolean
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
      diario_listar: { Args: { p_codigo: string }; Returns: Json }
      diario_paciente: { Args: { p_codigo: string }; Returns: Json }
      diario_pasta_valida: { Args: { p_name: string }; Returns: boolean }
      eh_master: { Args: never; Returns: boolean }
      eh_paciente: { Args: never; Returns: boolean }
      espelho_enfileirar: {
        Args: { p_payload: Json; p_tipo: string }
        Returns: undefined
      }
      grupos_alimentos: {
        Args: never
        Returns: {
          grupo: string
          total: number
        }[]
      }
      lixeira_purgar: { Args: never; Returns: Json }
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
      master_profissionais: { Args: never; Returns: Json }
      meu_paciente_id: { Args: never; Returns: string }
      minha_nutricionista_id: { Args: never; Returns: string }
      modulos_do_plano: { Args: { p_plano: string }; Returns: string[] }
      paciente_acesso: { Args: { p_paciente_id: string }; Returns: Json }
      paciente_criar_acesso: {
        Args: { p_email: string; p_paciente_id: string; p_senha: string }
        Returns: string
      }
      paciente_definir_acesso: {
        Args: { p_ativo: boolean; p_paciente_id: string }
        Returns: undefined
      }
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
      papeis_permitidos: {
        Args: { p_conta: string; p_papeis: string[] }
        Returns: boolean
      }
      pode_editar_aluno: {
        Args: { p_modulo?: string; p_paciente: string }
        Returns: boolean
      }
      pode_ler_comprovante: { Args: { p_path: string }; Returns: boolean }
      pode_ver_aluno: { Args: { p_paciente: string }; Returns: boolean }
      pode_ver_plano_alimentar: { Args: { p_plano: string }; Returns: boolean }
      pode_ver_refeicao: { Args: { p_refeicao: string }; Returns: boolean }
      preconsulta_formulario: { Args: { p_slug: string }; Returns: Json }
      preconsulta_responder: {
        Args: {
          p_email: string
          p_nome: string
          p_respostas: Json
          p_slug: string
          p_telefone: string
        }
        Returns: Json
      }
      sou_dono: { Args: { p_conta: string }; Returns: boolean }
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
      whatsapp_destino: { Args: { p_telefone: string }; Returns: string }
      whatsapp_destravar_fila: { Args: never; Returns: Json }
      whatsapp_enfileirar: { Args: never; Returns: Json }
      whatsapp_preferencias: { Args: { p_config: Json }; Returns: Json }
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
