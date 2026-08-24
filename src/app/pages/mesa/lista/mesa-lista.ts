import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { formatarDataHora } from '../../../core/formato/data';
import { normalizarBusca } from '../../../core/formato/texto';
import { MesaService, PacienteMesa } from '../../../core/mesa/mesa.service';

type Pendencia = 'laudos' | 'achados' | 'checklist' | 'faltas';

@Component({
  imports: [
    ButtonModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    TagModule,
  ],
  selector: 'app-mesa-lista',
  styleUrl: './mesa-lista.scss',
  templateUrl: './mesa-lista.html',
})
export class MesaLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly mesa = inject(MesaService);

  protected readonly todas = signal<PacienteMesa[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  private readonly busca = signal('');
  private readonly trimestre = signal<number | null>(null);
  private readonly pendencia = signal<Pendencia | null>(null);

  protected readonly trimestres = [
    { rotulo: 'Todos os trimestres', valor: null },
    { rotulo: '1º trimestre', valor: 1 },
    { rotulo: '2º trimestre', valor: 2 },
    { rotulo: '3º trimestre', valor: 3 },
  ];

  protected readonly pendencias = [
    { rotulo: 'Todas as pendências', valor: null },
    { rotulo: 'Laudos para publicar', valor: 'laudos' },
    { rotulo: 'Achados para comunicar', valor: 'achados' },
    { rotulo: 'Checklist vencido ou vencendo', valor: 'checklist' },
    { rotulo: 'Falta sem reagendamento', valor: 'faltas' },
  ];

  protected readonly formulario = this.fb.group({
    busca: '',
    trimestre: [null as number | null],
    pendencia: [null as Pendencia | null],
  });

  protected readonly formatarDataHora = formatarDataHora;

  // A ordem vem da RPC; filtrar preserva.
  protected readonly linhas = computed(() => {
    const termo = normalizarBusca(this.busca());
    const tri = this.trimestre();
    const pend = this.pendencia();

    return this.todas().filter((p) => {
      if (termo !== '' && !normalizarBusca(p.nome).includes(termo)) {
        return false;
      }
      if (tri !== null && p.trimestre !== tri) {
        return false;
      }
      if (pend !== null && !this.temPendencia(p, pend)) {
        return false;
      }
      return true;
    });
  });

  protected readonly total = computed(() => this.linhas().length);

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.mesa.listar();
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

  protected aplicar(): void {
    const { busca, trimestre, pendencia } = this.formulario.getRawValue();
    this.busca.set(busca);
    this.trimestre.set(trimestre);
    this.pendencia.set(pendencia);
  }

  protected limpar(): void {
    this.formulario.setValue({ busca: '', trimestre: null, pendencia: null });
    this.aplicar();
  }

  protected statusAcesso(p: PacienteMesa): string {
    if (p.convite_ativado_em !== null && p.convite_revogado_em === null) {
      return 'Acesso ativo';
    }
    if (p.convite_revogado_em !== null) {
      return 'Código revogado';
    }
    return 'Aguardando 1º acesso';
  }

  private temPendencia(p: PacienteMesa, pend: Pendencia): boolean {
    switch (pend) {
      case 'laudos':
        return p.laudos_para_publicar > 0;
      case 'achados':
        return p.achados_para_comunicar > 0;
      case 'checklist':
        return p.checklist_vencidos > 0 || p.checklist_vencendo > 0;
      case 'faltas':
        return p.faltou_sem_reagendar;
    }
  }
}
