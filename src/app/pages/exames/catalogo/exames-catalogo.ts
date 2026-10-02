import { Component, computed, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { CatalogoExamesService } from '../../../core/exames/catalogo-exames.service';
import {
  ComponenteCatalogo,
  ExamesService,
  NaturezaComponente,
  TipoExameCatalogo,
} from '../../../core/exames/exames.service';

type Natureza = NaturezaComponente;

interface ControlesComponente {
  codigo: FormControl<string>;
  nome: FormControl<string>;
  natureza: FormControl<Natureza>;
  unidade: FormControl<string | null>;
  refMin: FormControl<number | null>;
  refMax: FormControl<number | null>;
  rotuloNegativo: FormControl<string>;
  rotuloPositivo: FormControl<string>;
  positivoAlterado: FormControl<boolean>;
  obrigatorio: FormControl<boolean>;
}

const SLUG = /^[a-z0-9_]+$/;

// Componente qualitativo exige os dois rótulos: é o que a caderneta mostra.
function rotulosDoQualitativo(grupo: AbstractControl): ValidationErrors | null {
  if (grupo.get('natureza')?.value !== 'qualitativo') {
    return null;
  }
  const negativo = (grupo.get('rotuloNegativo')?.value ?? '').trim();
  const positivo = (grupo.get('rotuloPositivo')?.value ?? '').trim();
  return !negativo || !positivo ? { rotulos: true } : null;
}

function codigosUnicos(lista: AbstractControl): ValidationErrors | null {
  const codigos = (lista.value as { codigo?: string }[])
    .map((c) => (c.codigo ?? '').trim())
    .filter((c) => c !== '');
  return new Set(codigos).size !== codigos.length ? { duplicado: true } : null;
}

@Component({
  imports: [
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
  ],
  selector: 'app-exames-catalogo',
  styleUrl: './exames-catalogo.scss',
  templateUrl: './exames-catalogo.html',
})
export class ExamesCatalogo implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly exames = inject(ExamesService);
  private readonly catalogo = inject(CatalogoExamesService);

  protected readonly tipos = signal<TipoExameCatalogo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly erroDialogo = signal<string | null>(null);

  protected readonly criando = signal(false);
  protected readonly editando = signal<TipoExameCatalogo | null>(null);
  protected readonly aExcluir = signal<TipoExameCatalogo | null>(null);

  protected readonly naturezas: { rotulo: string; valor: Natureza }[] = [
    { rotulo: 'Quantitativo (valor numérico)', valor: 'quantitativo' },
    { rotulo: 'Qualitativo (ex.: reagente)', valor: 'qualitativo' },
  ];

  protected readonly formulario = this.fb.group({
    codigo: ['', Validators.pattern(SLUG)],
    nome: ['', [Validators.required, Validators.minLength(3)]],
    ordem: [0, [Validators.required, Validators.min(0)]],
    componentes: this.fb.array<FormGroup<ControlesComponente>>([], {
      validators: [Validators.required, codigosUnicos],
    }),
  });

  // montarFormulario troca o array por um novo: getter evita referência solta.
  protected get componentes(): FormArray<FormGroup<ControlesComponente>> {
    return this.formulario.controls.componentes;
  }
  protected readonly aberto = computed(() => this.criando() || this.editando() !== null);

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.exames.catalogo();
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.tipos.set([]);
        return;
      }
      this.tipos.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected abrirCriacao(): void {
    this.editando.set(null);
    this.montarFormulario(null);
    this.criando.set(true);
  }

  protected abrirEdicao(tipo: TipoExameCatalogo): void {
    this.criando.set(false);
    this.montarFormulario(tipo);
    this.editando.set(tipo);
  }

  protected fechar(): void {
    this.criando.set(false);
    this.editando.set(null);
  }

  protected adicionarComponente(): void {
    this.componentes.push(this.novoComponente());
  }

  protected removerComponente(indice: number): void {
    this.componentes.removeAt(indice);
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erroDialogo.set(null);
    try {
      const dados = this.formulario.getRawValue();
      const resultado = await this.catalogo.salvar({
        criando: !this.editando(),
        codigo: dados.codigo.trim(),
        nome: dados.nome.trim(),
        ordem: dados.ordem,
        componentes: dados.componentes.map((c) => ({
          codigo: c.codigo.trim(),
          nome: c.nome.trim(),
          natureza: c.natureza,
          unidade: c.natureza === 'quantitativo' ? c.unidade?.trim() || null : null,
          refMin: c.natureza === 'quantitativo' ? c.refMin : null,
          refMax: c.natureza === 'quantitativo' ? c.refMax : null,
          rotuloNegativo: c.natureza === 'qualitativo' ? c.rotuloNegativo.trim() : '',
          rotuloPositivo: c.natureza === 'qualitativo' ? c.rotuloPositivo.trim() : '',
          positivoAlterado: c.natureza === 'qualitativo' ? c.positivoAlterado : true,
          obrigatorio: c.obrigatorio,
        })),
      });
      if (!resultado.ok) {
        this.erroDialogo.set(resultado.mensagem);
        return;
      }
      this.fechar();
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarExclusao(): Promise<void> {
    const tipo = this.aExcluir();
    if (tipo === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.catalogo.excluir(tipo.codigo);
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

  private montarFormulario(tipo: TipoExameCatalogo | null): void {
    this.erroDialogo.set(null);
    const componentes =
      tipo === null ? [this.novoComponente()] : tipo.componentes.map((c) => this.novoComponente(c));
    this.formulario.setControl(
      'componentes',
      this.fb.array(componentes, { validators: [Validators.required, codigosUnicos] }),
    );
    this.formulario.reset({
      codigo: tipo?.codigo ?? '',
      nome: tipo?.nome ?? '',
      ordem: tipo?.ordem ?? this.proximaOrdem(),
    });
    // Código é chave referenciada por resultados e protocolo: imutável depois de criado.
    const controle = this.formulario.controls.codigo;
    if (tipo === null) {
      controle.enable();
    } else {
      controle.disable();
    }
  }

  private proximaOrdem(): number {
    const ordens = this.tipos().map((t) => t.ordem);
    return ordens.length === 0 ? 1 : Math.max(...ordens) + 1;
  }

  private novoComponente(c?: ComponenteCatalogo): FormGroup<ControlesComponente> {
    const novo = c === undefined;
    return this.fb.group(
      {
        codigo: [{ value: c?.codigo ?? '', disabled: !novo }, Validators.pattern(SLUG)],
        nome: [c?.nome ?? '', [Validators.required, Validators.minLength(3)]],
        natureza: [c?.natureza ?? ('quantitativo' as Natureza)],
        unidade: [c?.unidade ?? null],
        refMin: [c?.refMin ?? null],
        refMax: [c?.refMax ?? null],
        rotuloNegativo: [c?.rotuloNegativo ?? ''],
        rotuloPositivo: [c?.rotuloPositivo ?? ''],
        positivoAlterado: [c?.positivoAlterado ?? true],
        obrigatorio: [c?.obrigatorio ?? true],
      },
      { validators: [rotulosDoQualitativo] },
    );
  }
}
