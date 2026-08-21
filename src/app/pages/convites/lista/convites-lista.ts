import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  ConviteEmitido,
  ConviteLista,
  ConvitesService,
} from '../../../core/convites/convites.service';
import { formatarCpf } from '../../../core/formato/cpf';

type Severidade = 'success' | 'secondary' | 'info' | 'warn' | 'danger';

const ROTULOS: Record<string, string> = {
  sem_convite: 'Sem convite',
  pendente: 'Pendente',
  ativo: 'Ativo',
  expirado: 'Expirado',
  revogado: 'Revogado',
};

const SEVERIDADES: Record<string, Severidade> = {
  sem_convite: 'secondary',
  pendente: 'info',
  ativo: 'success',
  expirado: 'warn',
  revogado: 'danger',
};

@Component({
  imports: [
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  selector: 'app-convites-lista',
  styleUrl: './convites-lista.scss',
  templateUrl: './convites-lista.html',
})
export class ConvitesLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly convites = inject(ConvitesService);

  protected readonly linhas = signal<ConviteLista[]>([]);
  protected readonly selecionadas = signal<ConviteLista[]>([]);
  protected readonly carregando = signal(false);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly emitidos = signal<ConviteEmitido[]>([]);
  protected readonly copiado = signal(false);
  protected readonly aRevogar = signal<ConviteLista | null>(null);

  protected readonly situacoes = [
    { rotulo: 'Todas as situações', valor: '' },
    { rotulo: 'Sem convite', valor: 'sem_convite' },
    { rotulo: 'Pendente', valor: 'pendente' },
    { rotulo: 'Ativo', valor: 'ativo' },
    { rotulo: 'Expirado', valor: 'expirado' },
    { rotulo: 'Revogado', valor: 'revogado' },
  ];

  protected readonly formulario = this.fb.group({ busca: '', situacao: '' });

  protected readonly totalSelecionado = computed(() => this.selecionadas().length);

  protected readonly formatarCpf = formatarCpf;

  ngOnInit(): void {
    void this.carregar();
  }

  protected rotulo(situacao: string): string {
    return ROTULOS[situacao] ?? situacao;
  }

  protected severidade(situacao: string): Severidade {
    return SEVERIDADES[situacao] ?? 'secondary';
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erro.set(null);
    this.selecionadas.set([]);
    try {
      const { busca, situacao } = this.formulario.getRawValue();
      const resultado = await this.convites.listar(busca, situacao);
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

  protected async limpar(): Promise<void> {
    this.formulario.setValue({ busca: '', situacao: '' });
    await this.carregar();
  }

  protected async emitir(linha: ConviteLista): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.convites.emitir(linha.paciente_id);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.abrirCodigos([
        {
          paciente_id: linha.paciente_id,
          nome: linha.nome,
          codigo: resultado.valor,
          emitido: true,
        },
      ]);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async emitirLote(): Promise<void> {
    const ids = this.selecionadas().map((l) => l.paciente_id);
    if (ids.length === 0 || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.convites.emitirEmLote(ids);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.abrirCodigos(resultado.valor);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarRevogacao(): Promise<void> {
    const linha = this.aRevogar();
    if (linha === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.convites.revogar(linha.paciente_id);
      this.aRevogar.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected fecharCodigos(): void {
    this.emitidos.set([]);
    this.copiado.set(false);
  }

  // O código só existe no retorno da RPC: uma vez fechada a janela, a única
  // saída é reemitir.
  protected async copiarTudo(): Promise<void> {
    const texto = this.emitidos()
      .filter((e) => e.codigo !== null)
      .map((e) => `${e.nome}: ${e.codigo}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(true);
    } catch {
      this.copiado.set(false);
      this.erro.set('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  private abrirCodigos(linhas: ConviteEmitido[]): void {
    this.copiado.set(false);
    this.emitidos.set(linhas);
  }
}
