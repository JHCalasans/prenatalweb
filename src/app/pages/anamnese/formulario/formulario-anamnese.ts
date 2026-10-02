import { Component, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import {
  Anamnese,
  AntecedenteFamiliar,
  Comorbidade,
  Consumo,
  DadosAnamnese,
  FatorRh,
  IntercorrenciaObstetrica,
  ROTULO_ANTECEDENTE_FAMILIAR,
  ROTULO_COMORBIDADE,
  ROTULO_CONSUMO,
  ROTULO_INTERCORRENCIA,
  TipoSanguineo,
} from '../../../core/anamnese/anamnese.service';
import { deDataIso, paraDataIso } from '../../../core/formato/data';

function opcoes<T extends string>(rotulos: Record<T, string>): { rotulo: string; valor: T }[] {
  return (Object.keys(rotulos) as T[]).map((valor) => ({ rotulo: rotulos[valor], valor }));
}

function texto(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

// Mesmas mensagens da RPC registrar_anamnese.
export const ERRO_CONTAGEM = 'Partos e abortos não podem somar mais que as gestações anteriores';
export const ERRO_NATIMORTOS = 'Natimortos não podem passar do número de partos';
export const ERRO_TIPAGEM = 'Informe o tipo sanguíneo e o fator Rh juntos';

@Component({
  imports: [
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    ReactiveFormsModule,
    SelectModule,
    TextareaModule,
  ],
  selector: 'app-formulario-anamnese',
  styleUrl: './formulario-anamnese.scss',
  templateUrl: './formulario-anamnese.html',
})
export class FormularioAnamnese {
  /** Versão vigente que preenche o formulário; null quando a ficha ainda não existe. */
  readonly anamnese = input<Anamnese | null>(null);
  readonly salvando = input(false);
  readonly salvar = output<DadosAnamnese>();
  readonly cancelar = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly erro = signal<string | null>(null);
  protected readonly hoje = new Date();

  protected readonly tipos = (['A', 'B', 'AB', 'O'] as TipoSanguineo[]).map((t) => ({
    rotulo: t,
    valor: t,
  }));
  protected readonly fatores = [
    { rotulo: 'Positivo', valor: 'positivo' as FatorRh },
    { rotulo: 'Negativo', valor: 'negativo' as FatorRh },
  ];
  protected readonly comorbidadeOpcoes = opcoes(ROTULO_COMORBIDADE);
  protected readonly intercorrenciaOpcoes = opcoes(ROTULO_INTERCORRENCIA);
  protected readonly familiarOpcoes = opcoes(ROTULO_ANTECEDENTE_FAMILIAR);
  protected readonly consumoOpcoes = opcoes(ROTULO_CONSUMO);

  protected readonly form = this.fb.group({
    tipoSanguineo: [null as TipoSanguineo | null],
    fatorRh: [null as FatorRh | null],
    semAlergiasConhecidas: [false],
    alergias: [''],
    medicacoesEmUso: [''],
    comorbidades: [[] as Comorbidade[]],
    comorbidadesOutras: [''],
    cirurgiasPrevias: [''],
    gestacoesAnteriores: [0 as number | null],
    partosNormais: [0 as number | null],
    cesareas: [0 as number | null],
    abortos: [0 as number | null],
    natimortos: [0 as number | null],
    dataUltimoParto: [null as Date | null],
    intercorrenciasPrevias: [[] as IntercorrenciaObstetrica[]],
    intercorrenciasOutras: [''],
    antecedentesFamiliares: [[] as AntecedenteFamiliar[]],
    familiaresOutros: [''],
    tabagismo: [null as Consumo | null],
    alcool: [null as Consumo | null],
    outrasDrogas: [null as Consumo | null],
  });

  constructor() {
    effect(() => this.preencher(this.anamnese()));

    // "Sem alergias conhecidas" e a descrição de alergias se excluem.
    this.form.controls.semAlergiasConhecidas.valueChanges.subscribe((sem) => {
      const alergias = this.form.controls.alergias;
      if (sem) {
        alergias.setValue('', { emitEvent: false });
        alergias.disable({ emitEvent: false });
      } else {
        alergias.enable({ emitEvent: false });
      }
    });
  }

  private preencher(a: Anamnese | null): void {
    this.erro.set(null);
    this.form.reset({
      tipoSanguineo: a?.tipoSanguineo ?? null,
      fatorRh: a?.fatorRh ?? null,
      semAlergiasConhecidas: a?.semAlergiasConhecidas ?? false,
      alergias: a?.alergias ?? '',
      medicacoesEmUso: a?.medicacoesEmUso ?? '',
      comorbidades: a?.comorbidades ?? [],
      comorbidadesOutras: a?.comorbidadesOutras ?? '',
      cirurgiasPrevias: a?.cirurgiasPrevias ?? '',
      gestacoesAnteriores: a?.gestacoesAnteriores ?? 0,
      partosNormais: a?.partosNormais ?? 0,
      cesareas: a?.cesareas ?? 0,
      abortos: a?.abortos ?? 0,
      natimortos: a?.natimortos ?? 0,
      dataUltimoParto: deDataIso(a?.dataUltimoParto ?? null),
      intercorrenciasPrevias: a?.intercorrenciasPrevias ?? [],
      intercorrenciasOutras: a?.intercorrenciasOutras ?? '',
      antecedentesFamiliares: a?.antecedentesFamiliares ?? [],
      familiaresOutros: a?.familiaresOutros ?? '',
      tabagismo: a?.tabagismo ?? null,
      alcool: a?.alcool ?? null,
      outrasDrogas: a?.outrasDrogas ?? null,
    });
    if (a?.semAlergiasConhecidas) {
      this.form.controls.alergias.disable({ emitEvent: false });
    } else {
      this.form.controls.alergias.enable({ emitEvent: false });
    }
  }

  protected enviar(): void {
    if (this.salvando()) {
      return;
    }
    const v = this.form.getRawValue();
    const gestacoes = v.gestacoesAnteriores ?? 0;
    const normais = v.partosNormais ?? 0;
    const cesareas = v.cesareas ?? 0;
    const abortos = v.abortos ?? 0;
    const natimortos = v.natimortos ?? 0;

    if (normais + cesareas + abortos > gestacoes) {
      this.erro.set(ERRO_CONTAGEM);
      return;
    }
    if (natimortos > normais + cesareas) {
      this.erro.set(ERRO_NATIMORTOS);
      return;
    }
    if ((v.tipoSanguineo === null) !== (v.fatorRh === null)) {
      this.erro.set(ERRO_TIPAGEM);
      return;
    }
    this.erro.set(null);

    this.salvar.emit({
      tipoSanguineo: v.tipoSanguineo,
      fatorRh: v.fatorRh,
      semAlergiasConhecidas: v.semAlergiasConhecidas,
      alergias: v.semAlergiasConhecidas ? null : texto(v.alergias),
      medicacoesEmUso: texto(v.medicacoesEmUso),
      comorbidades: v.comorbidades,
      comorbidadesOutras: texto(v.comorbidadesOutras),
      cirurgiasPrevias: texto(v.cirurgiasPrevias),
      gestacoesAnteriores: gestacoes,
      partosNormais: normais,
      cesareas,
      abortos,
      natimortos,
      dataUltimoParto: paraDataIso(v.dataUltimoParto),
      intercorrenciasPrevias: v.intercorrenciasPrevias,
      intercorrenciasOutras: texto(v.intercorrenciasOutras),
      antecedentesFamiliares: v.antecedentesFamiliares,
      familiaresOutros: texto(v.familiaresOutros),
      tabagismo: v.tabagismo,
      alcool: v.alcool,
      outrasDrogas: v.outrasDrogas,
    });
  }
}
