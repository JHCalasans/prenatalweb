import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { AuditoriaService, RegistroAuditoria } from '../../../core/auditoria/auditoria.service';
import { formatarDataHora } from '../../../core/formato/data';
import { normalizarBusca } from '../../../core/formato/texto';

// As 29 ações que migrations e a Edge Function gerir-equipe gravam hoje; ação
// nova sem rótulo cai na chave crua em vez de sumir da tabela.
const ROTULO_ACAO: Record<string, string> = {
  'checklist.marcado': 'Item de checklist marcado',
  'consulta.agendada': 'Consulta agendada',
  'consulta.cancelada': 'Consulta cancelada',
  'consulta.reagendada': 'Consulta reagendada',
  'consulta.registrada': 'Consulta registrada',
  'convite.ativado': 'Convite ativado',
  'convite.emitido': 'Convite emitido',
  'convite.reemitido': 'Convite reemitido',
  'convite.revogado': 'Convite revogado',
  'documento.lido': 'Documento lido',
  'documento.publicado': 'Documento publicado',
  'documento.rascunho_criado': 'Rascunho de documento criado',
  'documento.rascunho_excluido': 'Rascunho de documento excluído',
  'gestacao.encerrada': 'Gestação encerrada',
  'paciente.atualizado': 'Paciente atualizada',
  'paciente.criado': 'Paciente cadastrada',
  'protocolo.item_aposentado': 'Item de protocolo aposentado',
  'protocolo.item_criado': 'Item de protocolo criado',
  'protocolo.item_editado': 'Item de protocolo editado',
  'protocolo.item_reativado': 'Item de protocolo reativado',
  'protocolo.reordenado': 'Protocolo reordenado',
  'vinculo.atribuido': 'Vínculo atribuído',
  'vinculo.inativado': 'Vínculo encerrado',
  'vinculo.transferido': 'Vínculo transferido',
  'equipe.criada': 'Conta de equipe criada',
  'equipe.papel_alterado': 'Papel alterado',
  'equipe.senha_redefinida': 'Senha redefinida',
  'equipe.desativada': 'Conta desativada',
  'equipe.reativada': 'Conta reativada',
};

const TETO = 500;

@Component({
  imports: [
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
  ],
  selector: 'app-auditoria-lista',
  styleUrl: './auditoria-lista.scss',
  templateUrl: './auditoria-lista.html',
})
export class AuditoriaLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auditoria = inject(AuditoriaService);

  protected readonly todas = signal<RegistroAuditoria[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly acoes = signal<string[]>([]);
  protected readonly detalhe = signal<RegistroAuditoria | null>(null);

  private readonly busca = signal('');

  protected readonly entidades = [
    { rotulo: 'Todas as entidades', valor: null as string | null },
    { rotulo: 'Pacientes', valor: 'pacientes' as string | null },
    { rotulo: 'Convites', valor: 'convites' as string | null },
    { rotulo: 'Vínculos', valor: 'vinculos' as string | null },
    { rotulo: 'Gestações', valor: 'gestacoes' as string | null },
    { rotulo: 'Checklist', valor: 'gestacao_checklist' as string | null },
    { rotulo: 'Consultas', valor: 'consultas' as string | null },
    { rotulo: 'Documentos', valor: 'documentos' as string | null },
    { rotulo: 'Itens de protocolo', valor: 'protocolo_itens' as string | null },
    { rotulo: 'Equipe', valor: 'profiles' as string | null },
  ];

  // A tela abre na janela dos últimos 7 dias, contando hoje.
  protected readonly formulario = this.fb.group({
    desde: [this.diaCivil(-6)],
    ate: [this.diaCivil(0)],
    acao: [null as string | null],
    entidade: [null as string | null],
    busca: [''],
  });

  protected readonly formatarDataHora = formatarDataHora;

  // A ordem vem da RPC; a busca por texto (quem agiu ou o alvo) é sobre as
  // linhas carregadas, porque os nomes já vêm resolvidos na resposta.
  protected readonly linhas = computed(() => {
    const termo = normalizarBusca(this.busca());
    if (termo === '') {
      return this.todas();
    }
    return this.todas().filter(
      (r) =>
        normalizarBusca(r.ator_nome ?? '').includes(termo) ||
        normalizarBusca(r.alvo ?? '').includes(termo),
    );
  });

  protected readonly opcoesAcao = computed(() => [
    { rotulo: 'Todas as ações', valor: null as string | null },
    ...this.acoes().map((a) => ({ rotulo: this.rotuloAcao(a), valor: a as string | null })),
  ]);

  protected readonly truncado = computed(() => this.todas().length === TETO);

  ngOnInit(): void {
    void this.carregarAcoes();
    void this.carregar();
  }

  private diaCivil(deslocamento: number): Date {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + deslocamento);
  }

  protected rotuloAcao(acao: string): string {
    return ROTULO_ACAO[acao] ?? acao;
  }

  protected quem(r: RegistroAuditoria): string {
    return r.ator_nome ?? 'Sistema';
  }

  protected metaFormatado(r: RegistroAuditoria | null): string {
    return JSON.stringify(r?.meta ?? {}, null, 2);
  }

  protected aplicar(): void {
    this.busca.set(this.formulario.controls.busca.value);
    void this.carregar();
  }

  protected limpar(): void {
    this.formulario.setValue({
      desde: this.diaCivil(-6),
      ate: this.diaCivil(0),
      acao: null,
      entidade: null,
      busca: '',
    });
    this.aplicar();
  }

  private async carregarAcoes(): Promise<void> {
    const resultado = await this.auditoria.acoes();
    if (resultado.ok) {
      this.acoes.set(resultado.valor);
    }
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const { desde, ate, acao, entidade } = this.formulario.getRawValue();
      const resultado = await this.auditoria.listar(
        desde.toISOString(),
        this.diaSeguinte(ate).toISOString(),
        acao,
        entidade,
      );
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.todas.set([]);
        return;
      }
      this.todas.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  // p_ate é exclusivo: para incluir o dia escolhido até o fim, a borda é a
  // meia-noite do dia seguinte (datas civis locais viram ISO com fuso, igual
  // ao agenda.service — o Postgres interpreta data sem hora como UTC).
  private diaSeguinte(base: Date): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return d;
  }
}
