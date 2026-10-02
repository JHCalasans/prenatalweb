import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import {
  ExamesService,
  RegistroVacina,
  ROTULO_CALENDARIO,
  ROTULO_SITUACAO_VACINA,
  ROTULO_VACINA,
  SituacaoCalendario,
  SituacaoVacina,
  Vacina,
  VacinaGestacao,
} from '../../../core/exames/exames.service';
import { deDataIso, formatarData, paraDataIso } from '../../../core/formato/data';

export const ERRO_DATA_APLICACAO = 'Informe a data de aplicação.';

type Severidade = 'success' | 'secondary' | 'info' | 'warn' | 'danger';

const SEVERIDADE: Record<SituacaoCalendario, Severidade> = {
  em_dia: 'success',
  pendente: 'warn',
  recusada: 'danger',
  contraindicada: 'secondary',
  dispensada: 'secondary',
};

interface Editando {
  id: string;
  vacina: Vacina;
  existente: boolean;
}

@Component({
  imports: [
    ButtonModule,
    DatePickerModule,
    DialogModule,
    FormsModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TagModule,
  ],
  selector: 'app-painel-vacinas',
  styleUrl: './painel-vacinas.scss',
  templateUrl: './painel-vacinas.html',
})
export class PainelVacinas implements OnInit {
  readonly gestacaoId = input.required<string>();
  readonly gestacaoAtiva = input.required<boolean>();

  private readonly exames = inject(ExamesService);

  protected readonly vacinas = signal<VacinaGestacao[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly erroDialogo = signal<string | null>(null);

  protected readonly editando = signal<Editando | null>(null);
  protected readonly dose = signal(1);
  protected readonly situacao = signal<SituacaoVacina>('aplicada');
  protected readonly aplicadaEm = signal<Date | null>(null);
  protected readonly lote = signal('');
  protected readonly local = signal('');
  protected readonly observacao = signal('');
  protected readonly aExcluir = signal<{ vacina: Vacina; registro: RegistroVacina } | null>(null);

  protected readonly hoje = new Date();
  protected readonly formatarData = formatarData;
  protected readonly rotuloVacina = ROTULO_VACINA;
  protected readonly rotuloSituacao = ROTULO_SITUACAO_VACINA;
  protected readonly rotuloCalendario = ROTULO_CALENDARIO;

  protected readonly opcoesSituacao = (Object.keys(ROTULO_SITUACAO_VACINA) as SituacaoVacina[]).map(
    (valor) => ({ rotulo: ROTULO_SITUACAO_VACINA[valor], valor }),
  );

  // A dose escolhida só pode ir até o que o esquema da vacina prevê.
  protected readonly opcoesDose = computed(() => {
    const vacina = this.vacinas().find((v) => v.vacina === this.editando()?.vacina);
    return Array.from({ length: vacina?.dosesEsperadas ?? 1 }, (_, i) => ({
      rotulo: `Dose ${i + 1}`,
      valor: i + 1,
    }));
  });

  ngOnInit(): void {
    void this.inicializar();
  }

  private async inicializar(): Promise<void> {
    try {
      await this.carregar();
    } finally {
      this.carregando.set(false);
    }
  }

  protected async carregar(): Promise<void> {
    const resultado = await this.exames.vacinas(this.gestacaoId());
    if (!resultado.ok) {
      this.erro.set(resultado.mensagem);
      this.vacinas.set([]);
      return;
    }
    this.erro.set(null);
    this.vacinas.set(resultado.valor);
  }

  protected severidade(situacao: SituacaoCalendario): Severidade {
    return SEVERIDADE[situacao];
  }

  private zerar(editando: Editando): void {
    this.erroDialogo.set(null);
    this.situacao.set('aplicada');
    this.aplicadaEm.set(null);
    this.lote.set('');
    this.local.set('');
    this.observacao.set('');
    this.editando.set(editando);
  }

  /** Nova dose: sugere a primeira dose ainda sem registro. */
  protected abrirNova(v: VacinaGestacao): void {
    const usadas = new Set(v.registros.map((r) => r.dose));
    let proxima = 1;
    while (usadas.has(proxima) && proxima < v.dosesEsperadas) {
      proxima += 1;
    }
    this.zerar({ id: crypto.randomUUID(), vacina: v.vacina, existente: false });
    this.dose.set(proxima);
  }

  protected abrirEdicao(v: VacinaGestacao, r: RegistroVacina): void {
    this.zerar({ id: r.id, vacina: v.vacina, existente: true });
    this.dose.set(r.dose);
    this.situacao.set(r.situacao);
    this.aplicadaEm.set(deDataIso(r.aplicadaEm));
    this.lote.set(r.lote ?? '');
    this.local.set(r.local ?? '');
    this.observacao.set(r.observacao ?? '');
  }

  protected async salvar(): Promise<void> {
    const editando = this.editando();
    if (editando === null || this.agindo()) {
      return;
    }
    const data = paraDataIso(this.aplicadaEm());
    if (this.situacao() === 'aplicada' && data === null) {
      this.erroDialogo.set(ERRO_DATA_APLICACAO);
      return;
    }
    this.agindo.set(true);
    this.erroDialogo.set(null);
    try {
      const texto = (valor: string): string | null => valor.trim() || null;
      const resultado = await this.exames.registrarVacina(editando.id, this.gestacaoId(), {
        vacina: editando.vacina,
        dose: this.dose(),
        situacao: this.situacao(),
        aplicadaEm: data,
        lote: texto(this.lote()),
        local: texto(this.local()),
        observacao: texto(this.observacao()),
      });
      if (!resultado.ok) {
        this.erroDialogo.set(resultado.mensagem);
        return;
      }
      this.editando.set(null);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarExclusao(): Promise<void> {
    const alvo = this.aExcluir();
    if (alvo === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.exames.excluirVacina(alvo.registro.id);
      this.aExcluir.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }
}
