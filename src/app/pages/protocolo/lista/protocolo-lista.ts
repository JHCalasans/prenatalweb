import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ItemProtocolo, ProtocoloService } from '../../../core/protocolo/protocolo.service';

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
    TagModule,
  ],
  selector: 'app-protocolo-lista',
  styleUrl: './protocolo-lista.scss',
  templateUrl: './protocolo-lista.html',
})
export class ProtocoloLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly protocolo = inject(ProtocoloService);

  protected readonly itens = signal<ItemProtocolo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly mostrarAposentados = signal(false);

  protected readonly editando = signal<ItemProtocolo | null>(null);
  protected readonly criando = signal(false);
  protected readonly aAposentar = signal<ItemProtocolo | null>(null);

  protected readonly trimestres = [
    { rotulo: '1º trimestre', valor: 1 },
    { rotulo: '2º trimestre', valor: 2 },
    { rotulo: '3º trimestre', valor: 3 },
  ];

  protected readonly formulario = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    trimestre: [1, Validators.required],
    semanaIni: [0, Validators.required],
    semanaFim: [0, Validators.required],
    obrigatorio: [true],
    ordem: [0],
  });

  protected readonly aberto = computed(() => this.criando() || this.editando() !== null);

  // Editar item já marcado por alguma gestação cria uma versão nova; a médica
  // precisa saber disso antes de salvar.
  protected readonly avisoVersao = computed(() => {
    const item = this.editando();
    return item !== null && item.marcacoes > 0;
  });

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.protocolo.listar(this.mostrarAposentados());
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        this.itens.set([]);
        return;
      }
      this.itens.set(resultado.valor);
    } finally {
      this.carregando.set(false);
    }
  }

  protected async alternarAposentados(): Promise<void> {
    this.mostrarAposentados.update((v) => !v);
    await this.carregar();
  }

  protected abrirCriacao(): void {
    this.formulario.setValue({
      nome: '',
      trimestre: 1,
      semanaIni: 0,
      semanaFim: 0,
      obrigatorio: true,
      ordem: 0,
    });
    this.criando.set(true);
  }

  protected abrirEdicao(item: ItemProtocolo): void {
    this.formulario.setValue({
      nome: item.nome,
      trimestre: item.trimestre,
      semanaIni: item.semana_ini,
      semanaFim: item.semana_fim,
      obrigatorio: item.obrigatorio,
      ordem: item.ordem,
    });
    this.editando.set(item);
  }

  protected fechar(): void {
    this.criando.set(false);
    this.editando.set(null);
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const bruto = this.formulario.getRawValue();
      const dados = {
        nome: bruto.nome.trim(),
        trimestre: bruto.trimestre,
        semanaIni: bruto.semanaIni,
        semanaFim: bruto.semanaFim,
        obrigatorio: bruto.obrigatorio,
        ordem: bruto.ordem,
      };

      const item = this.editando();
      const resultado = item
        ? await this.protocolo.atualizar(item.item_id, dados)
        : await this.protocolo.criar(dados);

      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.fechar();
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarAposentadoria(): Promise<void> {
    const item = this.aAposentar();
    if (item === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.protocolo.aposentar(item.item_id);
      this.aAposentar.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async reativar(item: ItemProtocolo): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.protocolo.reativar(item.item_id);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  // Move dentro do próprio trimestre e reescreve a ordem daquele trimestre.
  protected async mover(item: ItemProtocolo, direcao: -1 | 1): Promise<void> {
    if (this.agindo()) {
      return;
    }
    const doTrimestre = this.itens().filter((i) => i.trimestre === item.trimestre && i.ativo);
    const posicao = doTrimestre.findIndex((i) => i.item_id === item.item_id);
    const destino = posicao + direcao;
    if (posicao < 0 || destino < 0 || destino >= doTrimestre.length) {
      return;
    }

    const reordenado = [...doTrimestre];
    [reordenado[posicao], reordenado[destino]] = [reordenado[destino], reordenado[posicao]];

    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.protocolo.reordenar(reordenado.map((i) => i.item_id));
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
