import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { AuthService } from '../../core/auth/auth.service';
import { PapelEquipe } from '../../core/auth/papel';
import { formatarCpf } from '../../core/formato/cpf';
import { baixarCsv } from '../../core/formato/csv';
import { formatarData, formatarDataHora, paraDataIso } from '../../core/formato/data';
import { Medica, PacientesService } from '../../core/pacientes/pacientes.service';
import {
  ChecklistVencido,
  ConvitePendente,
  DocumentoPublicado,
  Falta,
  RelatoriosService,
  Resultado,
  TipoDocumento,
} from '../../core/relatorios/relatorios.service';

const TETO = 500;

const ROTULO_TIPO: Record<string, string> = {
  laudo_usg: 'Laudo de USG',
  exame_lab: 'Exame laboratorial',
  receita: 'Receita',
  atestado: 'Atestado',
  outro: 'Outro',
};

const ROTULO_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  solicitado: 'Solicitado',
  realizado: 'Realizado',
  nao_aplicavel: 'Não se aplica',
};

const ROTULO_JANELA: Record<string, string> = {
  vencido: 'Vencido',
  vencendo: 'Vencendo',
};

const ROTULO_SITUACAO: Record<string, string> = {
  pendente: 'Pendente',
  expirado: 'Expirado',
};

function texto(valor: string | null): string {
  return valor === null || valor === '' ? '—' : valor;
}

function simNao(valor: boolean): string {
  return valor ? 'Sim' : 'Não';
}

export type ChaveRelatorio = 'documentos' | 'faltas' | 'checklist' | 'convites';

interface Filtros {
  desde: string;
  ate: string;
  tipo: TipoDocumento | null;
  medicaId: string | null;
  ampliar: boolean;
}

interface Coluna<T> {
  rotulo: string;
  valor: (linha: T) => string;
}

// A mesma coluna alimenta a tabela, o CSV e o papel — por isso o valor é sempre
// texto pronto, sem p-tag: tag colorida não sobrevive a nenhuma das duas saídas.
interface Relatorio {
  chave: ChaveRelatorio;
  rotulo: string;
  papeis: readonly PapelEquipe[];
  periodo: boolean;
  rotuloAmpliar: string | null;
  porTipo: boolean;
  porMedica: boolean;
  colunas: readonly Coluna<unknown>[];
  carregar: (s: RelatoriosService, f: Filtros) => Promise<Resultado<unknown[]>>;
}

// Único ponto do arquivo com cast: a união de quatro formatos de linha só fecha
// apagando o tipo aqui, e cada definição continua conferida em T.
function definir<T>(d: {
  chave: ChaveRelatorio;
  rotulo: string;
  papeis: readonly PapelEquipe[];
  periodo?: boolean;
  rotuloAmpliar?: string | null;
  porTipo?: boolean;
  porMedica?: boolean;
  colunas: readonly Coluna<T>[];
  carregar: (s: RelatoriosService, f: Filtros) => Promise<Resultado<T[]>>;
}): Relatorio {
  return {
    periodo: false,
    rotuloAmpliar: null,
    porTipo: false,
    porMedica: false,
    ...d,
  } as Relatorio;
}

const RELATORIOS: readonly Relatorio[] = [
  definir<DocumentoPublicado>({
    chave: 'documentos',
    rotulo: 'Documentos publicados',
    papeis: ['medica'],
    periodo: true,
    porTipo: true,
    carregar: (s, f) => s.documentosPublicados(f.desde, f.ate, f.tipo),
    colunas: [
      { rotulo: 'Publicado em', valor: (l) => formatarDataHora(l.publicado_em) },
      { rotulo: 'Paciente', valor: (l) => l.paciente_nome },
      { rotulo: 'Tipo', valor: (l) => ROTULO_TIPO[l.tipo] ?? l.tipo },
      { rotulo: 'Título', valor: (l) => l.titulo },
      { rotulo: 'Data do exame', valor: (l) => texto(formatarData(l.data_exame)) },
      { rotulo: 'Achado alterado', valor: (l) => simNao(l.achado_alterado) },
      { rotulo: 'Comunicado', valor: (l) => simNao(l.comunicado_presencialmente) },
      { rotulo: 'Publicado por', valor: (l) => texto(l.publicado_por_nome) },
    ],
  }),
  definir<Falta>({
    chave: 'faltas',
    rotulo: 'Faltas',
    papeis: ['medica', 'secretaria'],
    periodo: true,
    porMedica: true,
    carregar: (s, f) => s.faltas(f.desde, f.ate, f.medicaId),
    colunas: [
      { rotulo: 'Quando', valor: (l) => formatarDataHora(l.data_hora) },
      { rotulo: 'Paciente', valor: (l) => l.paciente_nome },
      { rotulo: 'Médica', valor: (l) => l.medica_nome },
      { rotulo: 'Tipo', valor: (l) => l.tipo },
      { rotulo: 'Local', valor: (l) => texto(l.local) },
      { rotulo: 'Remarcou', valor: (l) => simNao(l.reagendou) },
    ],
  }),
  definir<ChecklistVencido>({
    chave: 'checklist',
    rotulo: 'Checklists vencidos',
    papeis: ['medica'],
    rotuloAmpliar: 'Incluir os que vencem esta semana',
    carregar: (s, f) => s.checklistVencidos(f.ampliar),
    colunas: [
      { rotulo: 'Paciente', valor: (l) => l.paciente_nome },
      { rotulo: 'Médicas', valor: (l) => texto(l.medicas) },
      { rotulo: 'IG', valor: (l) => `${l.ig_semanas} sem` },
      { rotulo: 'Item', valor: (l) => l.item_nome },
      { rotulo: 'Janela', valor: (l) => `${l.semana_ini}–${l.semana_fim} sem` },
      { rotulo: 'Situação', valor: (l) => ROTULO_JANELA[l.janela] ?? l.janela },
      { rotulo: 'Status', valor: (l) => ROTULO_STATUS[l.status] ?? l.status },
      { rotulo: 'Obrigatório', valor: (l) => simNao(l.obrigatorio) },
    ],
  }),
  definir<ConvitePendente>({
    chave: 'convites',
    rotulo: 'Convites pendentes',
    papeis: ['medica', 'secretaria'],
    rotuloAmpliar: 'Incluir expirados',
    carregar: (s, f) => s.convitesPendentes(f.ampliar),
    colunas: [
      { rotulo: 'Paciente', valor: (l) => l.paciente_nome },
      { rotulo: 'CPF', valor: (l) => texto(formatarCpf(l.cpf)) },
      { rotulo: 'Médicas', valor: (l) => texto(l.medicas) },
      { rotulo: 'Emitido em', valor: (l) => formatarDataHora(l.criado_em) },
      { rotulo: 'Expira em', valor: (l) => formatarDataHora(l.expira_em) },
      { rotulo: 'Dias restantes', valor: (l) => `${l.dias_para_expirar}` },
      { rotulo: 'Situação', valor: (l) => ROTULO_SITUACAO[l.situacao] ?? l.situacao },
    ],
  }),
];

@Component({
  imports: [
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
  ],
  selector: 'app-relatorios',
  styleUrl: './relatorios.scss',
  templateUrl: './relatorios.html',
})
export class Relatorios implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly relatorios = inject(RelatoriosService);
  private readonly pacientesService = inject(PacientesService);
  private readonly auth = inject(AuthService);

  protected readonly linhas = signal<unknown[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly medicas = signal<Medica[]>([]);

  private readonly chave = signal<ChaveRelatorio>('faltas');

  protected readonly tipos = [
    { rotulo: 'Todos os tipos', valor: null as TipoDocumento | null },
    ...Object.entries(ROTULO_TIPO).map(([valor, rotulo]) => ({
      rotulo,
      valor: valor as TipoDocumento | null,
    })),
  ];

  // Últimos 30 dias, contando hoje: relatório mensal é o recorte que a equipe
  // leva para a reunião.
  protected readonly formulario = this.fb.group({
    relatorio: ['faltas' as ChaveRelatorio],
    desde: [this.diaCivil(-29)],
    ate: [this.diaCivil(0)],
    tipo: [null as TipoDocumento | null],
    medicaId: [null as string | null],
    ampliar: [false],
  });

  protected readonly ehSecretaria = computed(() => this.auth.papel() === 'secretaria');

  protected readonly disponiveis = computed(() => {
    const papel = this.auth.papel();
    return RELATORIOS.filter((r) => papel !== null && r.papeis.includes(papel as PapelEquipe));
  });

  protected readonly opcoesRelatorio = computed(() =>
    this.disponiveis().map((r) => ({ rotulo: r.rotulo, valor: r.chave })),
  );

  protected readonly atual = computed(
    () => RELATORIOS.find((r) => r.chave === this.chave()) ?? RELATORIOS[1],
  );

  protected readonly colunas = computed(() => this.atual().colunas);

  protected readonly medicaOpcoes = computed(() => [
    { rotulo: 'Todas as médicas', valor: null as string | null },
    ...this.medicas().map((m) => ({ rotulo: m.nome, valor: m.id as string | null })),
  ]);

  protected readonly truncado = computed(() => this.linhas().length === TETO);

  ngOnInit(): void {
    const primeiro = this.disponiveis()[0];
    if (primeiro !== undefined) {
      this.chave.set(primeiro.chave);
      this.formulario.controls.relatorio.setValue(primeiro.chave);
    }
    if (this.ehSecretaria()) {
      void this.carregarMedicas();
    }
    this.ajustarCampos();
    void this.carregar();
  }

  private diaCivil(deslocamento: number): Date {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + deslocamento);
  }

  // p_ate é exclusivo: a borda é a meia-noite do dia seguinte ao escolhido.
  private diaSeguinte(base: Date): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return d;
  }

  // Campo de período desabilitado pela API do FormControl, não pelo template:
  // o Angular recusa [disabled] em controle de formulário reativo.
  private ajustarCampos(): void {
    const { desde, ate } = this.formulario.controls;
    const opcoes = { emitEvent: false };
    if (this.atual().periodo) {
      desde.enable(opcoes);
      ate.enable(opcoes);
    } else {
      desde.disable(opcoes);
      ate.disable(opcoes);
    }
  }

  protected trocar(): void {
    this.chave.set(this.formulario.controls.relatorio.value);
    this.linhas.set([]);
    this.formulario.controls.ampliar.setValue(false);
    this.ajustarCampos();
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const bruto = this.formulario.getRawValue();
      const resultado = await this.atual().carregar(this.relatorios, {
        desde: bruto.desde.toISOString(),
        ate: this.diaSeguinte(bruto.ate).toISOString(),
        tipo: bruto.tipo,
        medicaId: this.ehSecretaria() ? bruto.medicaId : null,
        ampliar: bruto.ampliar,
      });
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.linhas.set([]);
        return;
      }
      this.linhas.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  private async carregarMedicas(): Promise<void> {
    const resultado = await this.pacientesService.listarMedicas();
    if (resultado.ok) {
      this.medicas.set(resultado.valor);
    }
  }

  protected exportar(): void {
    const colunas = this.colunas();
    baixarCsv(
      `${this.chave()}-${paraDataIso(new Date())}.csv`,
      colunas.map((c) => c.rotulo),
      this.linhas().map((linha) => colunas.map((c) => c.valor(linha))),
    );
  }

  protected imprimir(): void {
    window.print();
  }
}
