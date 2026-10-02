export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          acao: string
          ator_id: string | null
          em: string
          entidade: string
          entidade_id: string | null
          id: number
          meta: Json
        }
        Insert: {
          acao: string
          ator_id?: string | null
          em?: string
          entidade: string
          entidade_id?: string | null
          id?: number
          meta?: Json
        }
        Update: {
          acao?: string
          ator_id?: string | null
          em?: string
          entidade?: string
          entidade_id?: string | null
          id?: number
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_ator_id_fkey"
            columns: ["ator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas: {
        Row: {
          created_at: string
          data_hora: string
          gestacao_id: string
          id: string
          local: string | null
          medica_id: string
          status: Database["public"]["Enums"]["status_consulta"]
          tipo: string
        }
        Insert: {
          created_at?: string
          data_hora: string
          gestacao_id: string
          id?: string
          local?: string | null
          medica_id: string
          status?: Database["public"]["Enums"]["status_consulta"]
          tipo?: string
        }
        Update: {
          created_at?: string
          data_hora?: string
          gestacao_id?: string
          id?: string
          local?: string | null
          medica_id?: string
          status?: Database["public"]["Enums"]["status_consulta"]
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultas_gestacao_id_fkey"
            columns: ["gestacao_id"]
            isOneToOne: false
            referencedRelation: "gestacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_medica_id_fkey"
            columns: ["medica_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      convite_tentativas: {
        Row: {
          em: string
          id: number
          ip: string
        }
        Insert: {
          em?: string
          id?: number
          ip: string
        }
        Update: {
          em?: string
          id?: number
          ip?: string
        }
        Relationships: []
      }
      convites: {
        Row: {
          ativado_em: string | null
          codigo_hash: string
          criado_em: string
          criado_por: string
          expira_em: string
          id: string
          paciente_id: string
          revogado_em: string | null
        }
        Insert: {
          ativado_em?: string | null
          codigo_hash: string
          criado_em?: string
          criado_por: string
          expira_em?: string
          id?: string
          paciente_id: string
          revogado_em?: string | null
        }
        Update: {
          ativado_em?: string | null
          codigo_hash?: string
          criado_em?: string
          criado_por?: string
          expira_em?: string
          id?: string
          paciente_id?: string
          revogado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convites_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          achado_alterado: boolean
          arquivo_enviado_em: string | null
          comunicado_presencialmente: boolean
          created_at: string
          data_exame: string | null
          gestacao_id: string
          id: string
          publicado_em: string | null
          publicado_por: string | null
          storage_path: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
          titulo: string
        }
        Insert: {
          achado_alterado?: boolean
          arquivo_enviado_em?: string | null
          comunicado_presencialmente?: boolean
          created_at?: string
          data_exame?: string | null
          gestacao_id: string
          id?: string
          publicado_em?: string | null
          publicado_por?: string | null
          storage_path: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
          titulo: string
        }
        Update: {
          achado_alterado?: boolean
          arquivo_enviado_em?: string | null
          comunicado_presencialmente?: boolean
          created_at?: string
          data_exame?: string | null
          gestacao_id?: string
          id?: string
          publicado_em?: string | null
          publicado_por?: string | null
          storage_path?: string
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_gestacao_id_fkey"
            columns: ["gestacao_id"]
            isOneToOne: false
            referencedRelation: "gestacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_publicado_por_fkey"
            columns: ["publicado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evolucoes: {
        Row: {
          altura_uterina_cm: number | null
          apresentacao: Database["public"]["Enums"]["apresentacao_fetal"] | null
          assinada_em: string | null
          atendida_em: string
          atualizado_em: string
          autora_id: string
          avaliacao: string | null
          bcf_bpm: number | null
          conduta: string | null
          consulta_id: string | null
          conteudo_hash: string | null
          created_at: string
          crm: string | null
          crm_uf: string | null
          edema: Database["public"]["Enums"]["grau_edema"] | null
          exame_fisico: string | null
          gestacao_id: string
          id: string
          ig_dias: number | null
          motivo_retificacao: string | null
          movimentacao_fetal:
            | Database["public"]["Enums"]["movimentacao_fetal"]
            | null
          pa_diastolica: number | null
          pa_sistolica: number | null
          papel_vinculo: Database["public"]["Enums"]["papel_vinculo"]
          peso_kg: number | null
          queixa: string | null
          raiz_id: string
          retifica_id: string | null
          revisao: number
          status: Database["public"]["Enums"]["status_evolucao"]
        }
        Insert: {
          altura_uterina_cm?: number | null
          apresentacao?:
            | Database["public"]["Enums"]["apresentacao_fetal"]
            | null
          assinada_em?: string | null
          atendida_em: string
          atualizado_em?: string
          autora_id: string
          avaliacao?: string | null
          bcf_bpm?: number | null
          conduta?: string | null
          consulta_id?: string | null
          conteudo_hash?: string | null
          created_at?: string
          crm?: string | null
          crm_uf?: string | null
          edema?: Database["public"]["Enums"]["grau_edema"] | null
          exame_fisico?: string | null
          gestacao_id: string
          id: string
          ig_dias?: number | null
          motivo_retificacao?: string | null
          movimentacao_fetal?:
            | Database["public"]["Enums"]["movimentacao_fetal"]
            | null
          pa_diastolica?: number | null
          pa_sistolica?: number | null
          papel_vinculo: Database["public"]["Enums"]["papel_vinculo"]
          peso_kg?: number | null
          queixa?: string | null
          raiz_id: string
          retifica_id?: string | null
          revisao?: number
          status?: Database["public"]["Enums"]["status_evolucao"]
        }
        Update: {
          altura_uterina_cm?: number | null
          apresentacao?:
            | Database["public"]["Enums"]["apresentacao_fetal"]
            | null
          assinada_em?: string | null
          atendida_em?: string
          atualizado_em?: string
          autora_id?: string
          avaliacao?: string | null
          bcf_bpm?: number | null
          conduta?: string | null
          consulta_id?: string | null
          conteudo_hash?: string | null
          created_at?: string
          crm?: string | null
          crm_uf?: string | null
          edema?: Database["public"]["Enums"]["grau_edema"] | null
          exame_fisico?: string | null
          gestacao_id?: string
          id?: string
          ig_dias?: number | null
          motivo_retificacao?: string | null
          movimentacao_fetal?:
            | Database["public"]["Enums"]["movimentacao_fetal"]
            | null
          pa_diastolica?: number | null
          pa_sistolica?: number | null
          papel_vinculo?: Database["public"]["Enums"]["papel_vinculo"]
          peso_kg?: number | null
          queixa?: string | null
          raiz_id?: string
          retifica_id?: string | null
          revisao?: number
          status?: Database["public"]["Enums"]["status_evolucao"]
        }
        Relationships: [
          {
            foreignKeyName: "evolucoes_autora_id_fkey"
            columns: ["autora_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolucoes_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolucoes_gestacao_id_fkey"
            columns: ["gestacao_id"]
            isOneToOne: false
            referencedRelation: "gestacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evolucoes_retifica_id_fkey"
            columns: ["retifica_id"]
            isOneToOne: false
            referencedRelation: "evolucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      gestacao_checklist: {
        Row: {
          data: string | null
          gestacao_id: string
          id: string
          observacao: string | null
          protocolo_item_id: string
          status: Database["public"]["Enums"]["status_checklist"]
        }
        Insert: {
          data?: string | null
          gestacao_id: string
          id?: string
          observacao?: string | null
          protocolo_item_id: string
          status?: Database["public"]["Enums"]["status_checklist"]
        }
        Update: {
          data?: string | null
          gestacao_id?: string
          id?: string
          observacao?: string | null
          protocolo_item_id?: string
          status?: Database["public"]["Enums"]["status_checklist"]
        }
        Relationships: [
          {
            foreignKeyName: "gestacao_checklist_gestacao_id_fkey"
            columns: ["gestacao_id"]
            isOneToOne: false
            referencedRelation: "gestacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestacao_checklist_protocolo_item_id_fkey"
            columns: ["protocolo_item_id"]
            isOneToOne: false
            referencedRelation: "protocolo_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      gestacoes: {
        Row: {
          created_at: string
          desfecho: Database["public"]["Enums"]["desfecho_gestacao"] | null
          desfecho_observacao: string | null
          dpp_final: string
          dpp_origem: Database["public"]["Enums"]["dpp_origem"]
          dpp_usg: string | null
          dum: string | null
          id: string
          paciente_id: string
          status: Database["public"]["Enums"]["status_gestacao"]
          tipo: Database["public"]["Enums"]["tipo_gestacao"]
        }
        Insert: {
          created_at?: string
          desfecho?: Database["public"]["Enums"]["desfecho_gestacao"] | null
          desfecho_observacao?: string | null
          dpp_final: string
          dpp_origem: Database["public"]["Enums"]["dpp_origem"]
          dpp_usg?: string | null
          dum?: string | null
          id?: string
          paciente_id: string
          status?: Database["public"]["Enums"]["status_gestacao"]
          tipo?: Database["public"]["Enums"]["tipo_gestacao"]
        }
        Update: {
          created_at?: string
          desfecho?: Database["public"]["Enums"]["desfecho_gestacao"] | null
          desfecho_observacao?: string | null
          dpp_final?: string
          dpp_origem?: Database["public"]["Enums"]["dpp_origem"]
          dpp_usg?: string | null
          dum?: string | null
          id?: string
          paciente_id?: string
          status?: Database["public"]["Enums"]["status_gestacao"]
          tipo?: Database["public"]["Enums"]["tipo_gestacao"]
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
      pacientes: {
        Row: {
          contato_emergencia: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          id: string
          nome: string
          profile_id: string | null
        }
        Insert: {
          contato_emergencia?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          id?: string
          nome: string
          profile_id?: string | null
        }
        Update: {
          contato_emergencia?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          id?: string
          nome?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          crm: string | null
          crm_uf: string | null
          id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm?: string | null
          crm_uf?: string | null
          id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm?: string | null
          crm_uf?: string | null
          id?: string
          nome?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      protocolo_itens: {
        Row: {
          ativo: boolean
          id: string
          nome: string
          obrigatorio: boolean
          ordem: number
          raiz_id: string
          semana_fim: number
          semana_ini: number
          trimestre: number
        }
        Insert: {
          ativo?: boolean
          id?: string
          nome: string
          obrigatorio?: boolean
          ordem?: number
          raiz_id: string
          semana_fim: number
          semana_ini: number
          trimestre: number
        }
        Update: {
          ativo?: boolean
          id?: string
          nome?: string
          obrigatorio?: boolean
          ordem?: number
          raiz_id?: string
          semana_fim?: number
          semana_ini?: number
          trimestre?: number
        }
        Relationships: [
          {
            foreignKeyName: "protocolo_itens_raiz_id_fkey"
            columns: ["raiz_id"]
            isOneToOne: false
            referencedRelation: "protocolo_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          medica_id: string
          paciente_id: string
          papel: Database["public"]["Enums"]["papel_vinculo"]
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          medica_id: string
          paciente_id: string
          papel: Database["public"]["Enums"]["papel_vinculo"]
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          medica_id?: string
          paciente_id?: string
          papel?: Database["public"]["Enums"]["papel_vinculo"]
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_medica_id_fkey"
            columns: ["medica_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      convites_status: {
        Row: {
          ativado_em: string | null
          criado_em: string | null
          criado_por: string | null
          expira_em: string | null
          id: string | null
          paciente_id: string | null
          revogado_em: string | null
        }
        Insert: {
          ativado_em?: string | null
          criado_em?: string | null
          criado_por?: string | null
          expira_em?: string | null
          id?: string | null
          paciente_id?: string | null
          revogado_em?: string | null
        }
        Update: {
          ativado_em?: string | null
          criado_em?: string | null
          criado_por?: string | null
          expira_em?: string | null
          id?: string | null
          paciente_id?: string | null
          revogado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convites_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acoes_auditadas: {
        Args: never
        Returns: {
          acao: string
        }[]
      }
      agenda_da_clinica: {
        Args: { p_ate: string; p_de: string; p_medica_id?: string }
        Returns: {
          consulta_id: string
          data_hora: string
          gestacao_id: string
          local: string
          medica_id: string
          medica_nome: string
          nome: string
          paciente_id: string
          status: Database["public"]["Enums"]["status_consulta"]
          tipo: string
        }[]
      }
      agendar_consulta: {
        Args: {
          p_data_hora: string
          p_local?: string
          p_medica_id: string
          p_paciente_id: string
          p_tipo?: string
        }
        Returns: string
      }
      aposentar_protocolo_item: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      assinar_evolucao: {
        Args: {
          p_id: string
          p_motivo_retificacao?: string
          p_revisao_base: number
        }
        Returns: string
      }
      atribuir_vinculo_pela_secretaria: {
        Args: {
          p_medica_id: string
          p_paciente_id: string
          p_papel: Database["public"]["Enums"]["papel_vinculo"]
        }
        Returns: string
      }
      atualizar_dum_pela_secretaria: {
        Args: { p_dum: string; p_gestacao_id: string }
        Returns: undefined
      }
      atualizar_gestacao: {
        Args: {
          p_dpp_origem: Database["public"]["Enums"]["dpp_origem"]
          p_dpp_usg?: string
          p_dum?: string
          p_gestacao_id: string
          p_tipo?: Database["public"]["Enums"]["tipo_gestacao"]
        }
        Returns: undefined
      }
      atualizar_paciente_pela_secretaria: {
        Args: {
          p_contato_emergencia?: string
          p_cpf?: string
          p_data_nascimento?: string
          p_nome: string
          p_paciente_id: string
        }
        Returns: undefined
      }
      atualizar_protocolo_item: {
        Args: {
          p_item_id: string
          p_nome: string
          p_obrigatorio: boolean
          p_ordem: number
          p_semana_fim: number
          p_semana_ini: number
          p_trimestre: number
        }
        Returns: string
      }
      auditoria_da_clinica: {
        Args: {
          p_acao?: string
          p_ate: string
          p_desde: string
          p_entidade?: string
        }
        Returns: {
          acao: string
          alvo: string
          ator_id: string
          ator_nome: string
          em: string
          entidade: string
          entidade_id: string
          meta: Json
          registro_id: number
        }[]
      }
      cancelar_consulta: { Args: { p_consulta_id: string }; Returns: undefined }
      checklist_da_gestacao: {
        Args: { p_gestacao_id: string }
        Returns: {
          data: string
          janela: string
          nome: string
          obrigatorio: boolean
          observacao: string
          ordem: number
          protocolo_item_id: string
          semana_fim: number
          semana_ini: number
          status: Database["public"]["Enums"]["status_checklist"]
          trimestre: number
        }[]
      }
      confirmar_upload_documento: {
        Args: { p_documento_id: string }
        Returns: undefined
      }
      convite_codigo_hash: { Args: { p_codigo: string }; Returns: string }
      convites_da_secretaria: {
        Args: { p_busca?: string; p_situacao?: string }
        Returns: {
          ativado_em: string
          convite_id: string
          cpf: string
          criado_em: string
          expira_em: string
          medicas: string
          nome: string
          paciente_id: string
          revogado_em: string
          situacao: string
        }[]
      }
      criar_documento_rascunho: {
        Args: {
          p_achado_alterado?: boolean
          p_data_exame?: string
          p_extensao: string
          p_gestacao_id: string
          p_tipo: Database["public"]["Enums"]["tipo_documento"]
          p_titulo: string
        }
        Returns: {
          documento_id: string
          storage_path: string
        }[]
      }
      criar_gestacao: {
        Args: {
          p_dpp_origem: Database["public"]["Enums"]["dpp_origem"]
          p_dpp_usg?: string
          p_dum?: string
          p_paciente_id: string
          p_tipo?: Database["public"]["Enums"]["tipo_gestacao"]
        }
        Returns: string
      }
      criar_gestacao_pela_secretaria: {
        Args: { p_dum: string; p_paciente_id: string }
        Returns: string
      }
      criar_paciente_com_convite: {
        Args: {
          p_contato_emergencia?: string
          p_cpf?: string
          p_data_nascimento?: string
          p_nome: string
          p_papel_vinculo?: Database["public"]["Enums"]["papel_vinculo"]
        }
        Returns: {
          codigo: string
          paciente_id: string
        }[]
      }
      criar_paciente_pela_secretaria: {
        Args: {
          p_contato_emergencia?: string
          p_cpf?: string
          p_data_nascimento?: string
          p_medica_id: string
          p_nome: string
          p_papel_vinculo?: Database["public"]["Enums"]["papel_vinculo"]
        }
        Returns: string
      }
      criar_protocolo_item: {
        Args: {
          p_nome: string
          p_obrigatorio?: boolean
          p_ordem?: number
          p_semana_fim: number
          p_semana_ini: number
          p_trimestre: number
        }
        Returns: string
      }
      current_papel: {
        Args: never
        Returns: Database["public"]["Enums"]["papel_usuario"]
      }
      definir_crm: {
        Args: { p_crm?: string; p_crm_uf?: string; p_medica_id: string }
        Returns: undefined
      }
      emitir_convite_pela_secretaria: {
        Args: { p_paciente_id: string }
        Returns: string
      }
      emitir_convites_em_lote: {
        Args: { p_paciente_ids: string[] }
        Returns: {
          codigo: string
          emitido: boolean
          nome: string
          paciente_id: string
        }[]
      }
      encerrar_gestacao: {
        Args: {
          p_desfecho: Database["public"]["Enums"]["desfecho_gestacao"]
          p_gestacao_id: string
          p_observacao?: string
        }
        Returns: undefined
      }
      evolucao_vigente: { Args: { p_raiz_id: string }; Returns: string }
      excluir_documento_rascunho: {
        Args: { p_documento_id: string }
        Returns: undefined
      }
      excluir_rascunho_evolucao: { Args: { p_id: string }; Returns: undefined }
      gerar_codigo_convite: { Args: never; Returns: string }
      gestacao_ativa_da_paciente: {
        Args: { p_paciente_id: string }
        Returns: {
          dpp_final: string
          dpp_origem: Database["public"]["Enums"]["dpp_origem"]
          dpp_usg: string
          dum: string
          gestacao_id: string
          tipo: Database["public"]["Enums"]["tipo_gestacao"]
        }[]
      }
      ig_semanas: { Args: { p_dpp_final: string }; Returns: number }
      inativar_vinculo_pela_secretaria: {
        Args: { p_vinculo_id: string }
        Returns: undefined
      }
      iniciar_retificacao: {
        Args: { p_evolucao_id: string; p_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_medica: { Args: never; Returns: boolean }
      is_secretaria: { Args: never; Returns: boolean }
      janela_checklist: {
        Args: {
          p_ig_semanas: number
          p_semana_fim: number
          p_semana_ini: number
        }
        Returns: string
      }
      log_documento_acesso: {
        Args: { p_documento_id: string }
        Returns: undefined
      }
      marcar_checklist_item: {
        Args: {
          p_data?: string
          p_gestacao_id: string
          p_observacao?: string
          p_protocolo_item_id: string
          p_status: Database["public"]["Enums"]["status_checklist"]
        }
        Returns: undefined
      }
      marcar_consulta: {
        Args: {
          p_consulta_id: string
          p_status: Database["public"]["Enums"]["status_consulta"]
        }
        Returns: undefined
      }
      marcar_falta: { Args: { p_consulta_id: string }; Returns: undefined }
      medica_vinculada_a_gestacao: {
        Args: { p_gestacao_id: string }
        Returns: boolean
      }
      medica_vinculada_ao_documento: {
        Args: { p_documento_id: string }
        Returns: boolean
      }
      medica_vinculada_ao_paciente: {
        Args: { p_paciente_id: string }
        Returns: boolean
      }
      medidas_da_gestacao: {
        Args: { p_gestacao_id: string }
        Returns: {
          altura_uterina_cm: number
          apresentacao: Database["public"]["Enums"]["apresentacao_fetal"]
          atendida_em: string
          bcf_bpm: number
          edema: Database["public"]["Enums"]["grau_edema"]
          evolucao_id: string
          ig_dias: number
          movimentacao_fetal: Database["public"]["Enums"]["movimentacao_fetal"]
          pa_diastolica: number
          pa_sistolica: number
          peso_kg: number
        }[]
      }
      paciente_dona_da_gestacao: {
        Args: { p_gestacao_id: string }
        Returns: boolean
      }
      paciente_id_for_me: { Args: never; Returns: string }
      pacientes_da_secretaria: {
        Args: { p_busca?: string }
        Returns: {
          contato_emergencia: string
          cpf: string
          data_nascimento: string
          medicas: string
          nome: string
          paciente_id: string
          tem_acesso: boolean
        }[]
      }
      painel_da_medica: {
        Args: never
        Returns: {
          achados_para_comunicar: number
          checklist_vencendo: number
          checklist_vencidos: number
          consulta_a_registrar_em: string
          consulta_a_registrar_id: string
          convite_ativado_em: string
          convite_revogado_em: string
          data_nascimento: string
          dpp_final: string
          faltou_sem_reagendar: boolean
          gestacao_id: string
          ig_semanas: number
          laudos_para_publicar: number
          nome: string
          paciente_id: string
          proxima_consulta_em: string
          trimestre: number
          urgencia_score: number
        }[]
      }
      promover_para_admin: {
        Args: { p_nome?: string; p_user_id: string }
        Returns: undefined
      }
      promover_para_medica: {
        Args: { p_nome?: string; p_user_id: string }
        Returns: undefined
      }
      promover_para_secretaria: {
        Args: { p_nome?: string; p_user_id: string }
        Returns: undefined
      }
      prontuario_da_paciente: {
        Args: { p_paciente_id: string }
        Returns: {
          altura_uterina_cm: number
          apresentacao: Database["public"]["Enums"]["apresentacao_fetal"]
          assinada_em: string
          atendida_em: string
          atualizado_em: string
          autora_id: string
          autora_nome: string
          avaliacao: string
          bcf_bpm: number
          conduta: string
          consulta_id: string
          crm: string
          crm_uf: string
          edema: Database["public"]["Enums"]["grau_edema"]
          exame_fisico: string
          gestacao_id: string
          id: string
          ig_dias: number
          motivo_retificacao: string
          movimentacao_fetal: Database["public"]["Enums"]["movimentacao_fetal"]
          pa_diastolica: number
          pa_sistolica: number
          papel_vinculo: Database["public"]["Enums"]["papel_vinculo"]
          peso_kg: number
          queixa: string
          raiz_id: string
          retifica_id: string
          retificada: boolean
          revisao: number
          status: Database["public"]["Enums"]["status_evolucao"]
          vigente: boolean
        }[]
      }
      protocolo_da_clinica: {
        Args: { p_incluir_aposentados?: boolean }
        Returns: {
          ativo: boolean
          item_id: string
          marcacoes: number
          nome: string
          obrigatorio: boolean
          ordem: number
          raiz_id: string
          semana_fim: number
          semana_ini: number
          trimestre: number
        }[]
      }
      publicar_documento: {
        Args: { p_confirmar_comunicado?: boolean; p_documento_id: string }
        Returns: undefined
      }
      reagendar_consulta: {
        Args: { p_consulta_id: string; p_data_hora: string }
        Returns: undefined
      }
      reativar_protocolo_item: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      reemitir_convite: { Args: { p_paciente_id: string }; Returns: string }
      registrar_ativacao_convite: {
        Args: { p_codigo_hash: string }
        Returns: string
      }
      relatorio_checklist_vencidos: {
        Args: { p_incluir_vencendo?: boolean }
        Returns: {
          gestacao_id: string
          ig_semanas: number
          item_nome: string
          janela: string
          medicas: string
          obrigatorio: boolean
          paciente_id: string
          paciente_nome: string
          protocolo_item_id: string
          semana_fim: number
          semana_ini: number
          status: Database["public"]["Enums"]["status_checklist"]
        }[]
      }
      relatorio_convites_pendentes: {
        Args: { p_incluir_expirados?: boolean }
        Returns: {
          convite_id: string
          cpf: string
          criado_em: string
          dias_para_expirar: number
          expira_em: string
          medicas: string
          paciente_id: string
          paciente_nome: string
          situacao: string
        }[]
      }
      relatorio_documentos_publicados: {
        Args: {
          p_ate: string
          p_desde: string
          p_tipo?: Database["public"]["Enums"]["tipo_documento"]
        }
        Returns: {
          achado_alterado: boolean
          comunicado_presencialmente: boolean
          data_exame: string
          documento_id: string
          paciente_nome: string
          publicado_em: string
          publicado_por_nome: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
          titulo: string
        }[]
      }
      relatorio_faltas: {
        Args: { p_ate: string; p_desde: string; p_medica_id?: string }
        Returns: {
          consulta_id: string
          data_hora: string
          local: string
          medica_nome: string
          paciente_id: string
          paciente_nome: string
          reagendou: boolean
          tipo: string
        }[]
      }
      reordenar_protocolo: { Args: { p_ids: string[] }; Returns: undefined }
      revogar_convite_pela_secretaria: {
        Args: { p_paciente_id: string }
        Returns: number
      }
      salvar_rascunho_evolucao: {
        Args: {
          p_altura_uterina_cm?: number
          p_apresentacao?: Database["public"]["Enums"]["apresentacao_fetal"]
          p_atendida_em: string
          p_avaliacao?: string
          p_bcf_bpm?: number
          p_conduta?: string
          p_consulta_id?: string
          p_edema?: Database["public"]["Enums"]["grau_edema"]
          p_exame_fisico?: string
          p_gestacao_id: string
          p_id: string
          p_movimentacao_fetal?: Database["public"]["Enums"]["movimentacao_fetal"]
          p_pa_diastolica?: number
          p_pa_sistolica?: number
          p_peso_kg?: number
          p_queixa?: string
          p_revisao_base: number
        }
        Returns: number
      }
      transferir_vinculo_pela_secretaria: {
        Args: { p_nova_medica_id: string; p_vinculo_id: string }
        Returns: string
      }
      trimestre_ig: { Args: { p_ig_semanas: number }; Returns: number }
      urgencia_score: {
        Args: {
          p_achados_para_comunicar: number
          p_checklist_vencendo: number
          p_checklist_vencidos: number
          p_faltou_sem_reagendar: boolean
          p_laudos_para_publicar: number
        }
        Returns: number
      }
      validar_dados_gestacao: {
        Args: {
          p_dpp_origem: Database["public"]["Enums"]["dpp_origem"]
          p_dpp_usg: string
          p_dum: string
        }
        Returns: undefined
      }
      validar_medidas_evolucao: {
        Args: {
          p_altura_uterina_cm: number
          p_bcf_bpm: number
          p_pa_diastolica: number
          p_pa_sistolica: number
          p_peso_kg: number
        }
        Returns: undefined
      }
      vinculos_da_paciente: {
        Args: { p_paciente_id: string }
        Returns: {
          ativo: boolean
          created_at: string
          medica_id: string
          medica_nome: string
          papel: Database["public"]["Enums"]["papel_vinculo"]
          vinculo_id: string
        }[]
      }
    }
    Enums: {
      apresentacao_fetal: "cefalica" | "pelvica" | "transversa" | "indefinida"
      desfecho_gestacao:
        | "parto_normal"
        | "cesarea"
        | "aborto"
        | "obito_fetal"
        | "transferencia_cuidado"
        | "outro"
      dpp_origem: "dum" | "usg"
      grau_edema:
        | "ausente"
        | "uma_cruz"
        | "duas_cruzes"
        | "tres_cruzes"
        | "quatro_cruzes"
      movimentacao_fetal: "presente" | "diminuida" | "ausente"
      papel_usuario: "paciente" | "medica" | "secretaria" | "admin"
      papel_vinculo: "obstetra" | "medicina_fetal"
      status_checklist:
        | "pendente"
        | "solicitado"
        | "realizado"
        | "nao_aplicavel"
      status_consulta: "agendada" | "realizada" | "cancelada" | "faltou"
      status_evolucao: "rascunho" | "assinada"
      status_gestacao: "ativa" | "encerrada"
      tipo_documento:
        | "laudo_usg"
        | "exame_lab"
        | "receita"
        | "atestado"
        | "outro"
      tipo_gestacao: "unica" | "gemelar"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      apresentacao_fetal: ["cefalica", "pelvica", "transversa", "indefinida"],
      desfecho_gestacao: [
        "parto_normal",
        "cesarea",
        "aborto",
        "obito_fetal",
        "transferencia_cuidado",
        "outro",
      ],
      dpp_origem: ["dum", "usg"],
      grau_edema: [
        "ausente",
        "uma_cruz",
        "duas_cruzes",
        "tres_cruzes",
        "quatro_cruzes",
      ],
      movimentacao_fetal: ["presente", "diminuida", "ausente"],
      papel_usuario: ["paciente", "medica", "secretaria", "admin"],
      papel_vinculo: ["obstetra", "medicina_fetal"],
      status_checklist: [
        "pendente",
        "solicitado",
        "realizado",
        "nao_aplicavel",
      ],
      status_consulta: ["agendada", "realizada", "cancelada", "faltou"],
      status_evolucao: ["rascunho", "assinada"],
      status_gestacao: ["ativa", "encerrada"],
      tipo_documento: [
        "laudo_usg",
        "exame_lab",
        "receita",
        "atestado",
        "outro",
      ],
      tipo_gestacao: ["unica", "gemelar"],
    },
  },
} as const

