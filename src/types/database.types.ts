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
          id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
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
          semana_fim?: number
          semana_ini?: number
          trimestre?: number
        }
        Relationships: []
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
      atribuir_vinculo_pela_secretaria: {
        Args: {
          p_medica_id: string
          p_paciente_id: string
          p_papel: Database["public"]["Enums"]["papel_vinculo"]
        }
        Returns: string
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
      checklist_da_gestacao: {
        Args: { p_gestacao_id: string }
        Returns: {
          data: string
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
      current_papel: {
        Args: never
        Returns: Database["public"]["Enums"]["papel_usuario"]
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
      excluir_documento_rascunho: {
        Args: { p_documento_id: string }
        Returns: undefined
      }
      gerar_codigo_convite: { Args: never; Returns: string }
      inativar_vinculo_pela_secretaria: {
        Args: { p_vinculo_id: string }
        Returns: undefined
      }
      is_medica: { Args: never; Returns: boolean }
      is_secretaria: { Args: never; Returns: boolean }
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
          checklist_janelas: Json
          consulta_a_registrar_em: string
          consulta_a_registrar_id: string
          convite_ativado_em: string
          convite_revogado_em: string
          data_nascimento: string
          dpp_final: string
          faltou_sem_reagendar: boolean
          gestacao_id: string
          laudos_para_publicar: number
          nome: string
          paciente_id: string
          proxima_consulta_em: string
        }[]
      }
      promover_para_medica: {
        Args: { p_nome?: string; p_user_id: string }
        Returns: undefined
      }
      promover_para_secretaria: {
        Args: { p_nome?: string; p_user_id: string }
        Returns: undefined
      }
      publicar_documento: {
        Args: { p_confirmar_comunicado?: boolean; p_documento_id: string }
        Returns: undefined
      }
      reemitir_convite: { Args: { p_paciente_id: string }; Returns: string }
      registrar_ativacao_convite: {
        Args: { p_codigo_hash: string }
        Returns: string
      }
      revogar_convite_pela_secretaria: {
        Args: { p_paciente_id: string }
        Returns: number
      }
      transferir_vinculo_pela_secretaria: {
        Args: { p_nova_medica_id: string; p_vinculo_id: string }
        Returns: string
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
      desfecho_gestacao:
        | "parto_normal"
        | "cesarea"
        | "aborto"
        | "obito_fetal"
        | "transferencia_cuidado"
        | "outro"
      dpp_origem: "dum" | "usg"
      papel_usuario: "paciente" | "medica" | "secretaria"
      papel_vinculo: "obstetra" | "medicina_fetal"
      status_checklist:
        | "pendente"
        | "solicitado"
        | "realizado"
        | "nao_aplicavel"
      status_consulta: "agendada" | "realizada" | "cancelada" | "faltou"
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
      desfecho_gestacao: [
        "parto_normal",
        "cesarea",
        "aborto",
        "obito_fetal",
        "transferencia_cuidado",
        "outro",
      ],
      dpp_origem: ["dum", "usg"],
      papel_usuario: ["paciente", "medica", "secretaria"],
      papel_vinculo: ["obstetra", "medicina_fetal"],
      status_checklist: [
        "pendente",
        "solicitado",
        "realizado",
        "nao_aplicavel",
      ],
      status_consulta: ["agendada", "realizada", "cancelada", "faltou"],
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

