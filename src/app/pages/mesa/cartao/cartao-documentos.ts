import { Component, inject, input, OnInit, signal } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  CartaoService,
  DocumentoCartao,
  ERRO_EXTENSAO_DOCUMENTO,
  ERRO_TAMANHO_DOCUMENTO,
  EXTENSOES_DOCUMENTO,
  TAMANHO_MAXIMO_DOCUMENTO,
  TipoDocumento,
} from '../../../core/cartao/cartao.service';
import { formatarData, paraDataIso } from '../../../core/formato/data';

type Severidade = 'success' | 'secondary' | 'info' | 'warn' | 'danger';

const TIPO_ROTULO: Record<string, string> = {
  laudo_usg: 'Laudo de USG',
  exame_lab: 'Exame laboratorial',
  receita: 'Receita',
  atestado: 'Atestado',
  outro: 'Outro',
};

@Component({
  imports: [
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    DialogModule,
    FormsModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  selector: 'app-cartao-documentos',
  styleUrl: './cartao-documentos.scss',
  templateUrl: './cartao-documentos.html',
})
export class CartaoDocumentos implements OnInit {
  readonly gestacaoId = input.required<string>();
  readonly gestacaoAtiva = input.required<boolean>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cartao = inject(CartaoService);

  protected readonly documentos = signal<DocumentoCartao[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly enviando = signal(false);
  protected readonly aPublicar = signal<DocumentoCartao | null>(null);
  protected readonly aExcluir = signal<DocumentoCartao | null>(null);
  protected readonly comunicado = signal(false);
  protected readonly arquivo = signal<File | null>(null);

  protected readonly formatarData = formatarData;

  protected readonly tipos = [
    { rotulo: 'Laudo de USG', valor: 'laudo_usg' as TipoDocumento },
    { rotulo: 'Exame laboratorial', valor: 'exame_lab' as TipoDocumento },
    { rotulo: 'Receita', valor: 'receita' as TipoDocumento },
    { rotulo: 'Atestado', valor: 'atestado' as TipoDocumento },
    { rotulo: 'Outro', valor: 'outro' as TipoDocumento },
  ];

  protected readonly envio = this.fb.group({
    tipo: ['laudo_usg' as TipoDocumento, Validators.required],
    titulo: ['', [Validators.required, Validators.minLength(3)]],
    dataExame: [null as Date | null],
    achadoAlterado: [false],
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

  protected tipoRotulo(tipo: string): string {
    return TIPO_ROTULO[tipo] ?? tipo;
  }

  protected documentoRotulo(d: DocumentoCartao): string {
    if (d.publicadoEm !== null) {
      return 'Publicado';
    }
    if (d.arquivoEnviadoEm === null) {
      return 'Upload incompleto';
    }
    return d.achadoAlterado && !d.comunicadoPresencialmente ? 'Achado a comunicar' : 'Rascunho';
  }

  protected documentoSeveridade(d: DocumentoCartao): Severidade {
    if (d.publicadoEm !== null) {
      return 'success';
    }
    if (d.arquivoEnviadoEm === null) {
      return 'secondary';
    }
    return d.achadoAlterado && !d.comunicadoPresencialmente ? 'warn' : 'info';
  }

  protected async carregar(): Promise<void> {
    const resultado = await this.cartao.documentos(this.gestacaoId());
    if (!resultado.ok) {
      this.erro.set(resultado.mensagem);
      this.documentos.set([]);
      return;
    }
    this.erro.set(null);
    this.documentos.set(resultado.valor);
  }

  protected abrirEnvio(): void {
    this.envio.reset({ tipo: 'laudo_usg', titulo: '', dataExame: null, achadoAlterado: false });
    this.arquivo.set(null);
    this.enviando.set(true);
  }

  protected escolherArquivo(evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    this.arquivo.set(alvo.files !== null && alvo.files.length > 0 ? alvo.files[0]! : null);
  }

  protected async enviar(): Promise<void> {
    if (this.agindo()) {
      return;
    }
    const problema = this.problemaNoArquivo(this.arquivo());
    if (problema !== null) {
      this.erro.set(problema);
      return;
    }
    if (this.envio.invalid) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const bruto = this.envio.getRawValue();
      const resultado = await this.cartao.criarRascunho({
        gestacaoId: this.gestacaoId(),
        tipo: bruto.tipo,
        titulo: bruto.titulo.trim(),
        dataExame: paraDataIso(bruto.dataExame),
        achadoAlterado: bruto.achadoAlterado,
        arquivo: this.arquivo()!,
      });
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.enviando.set(false);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected pedirPublicacao(d: DocumentoCartao): void {
    if (d.achadoAlterado && !d.comunicadoPresencialmente) {
      this.comunicado.set(false);
      this.aPublicar.set(d);
      return;
    }
    void this.executarPublicacao(d, false);
  }

  protected async confirmarPublicacao(): Promise<void> {
    const d = this.aPublicar();
    if (d === null || !this.comunicado()) {
      return;
    }
    await this.executarPublicacao(d, true);
  }

  private async executarPublicacao(
    d: DocumentoCartao,
    confirmarComunicado: boolean,
  ): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.cartao.publicar(d.id, confirmarComunicado);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.aPublicar.set(null);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarExclusao(): Promise<void> {
    const d = this.aExcluir();
    if (d === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.cartao.excluirRascunho(d.id);
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

  protected async abrir(d: DocumentoCartao): Promise<void> {
    this.erro.set(null);
    void this.cartao.registrarLeitura(d.id);
    const resultado = await this.cartao.abrirArquivo(d.storagePath);
    if (!resultado.ok) {
      this.erro.set(resultado.mensagem);
      return;
    }
    const url = URL.createObjectURL(resultado.valor);
    try {
      if (window.open(url, '_blank') === null) {
        this.erro.set('O navegador bloqueou a janela. Libere pop-ups para ver o arquivo.');
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private problemaNoArquivo(arquivo: File | null): string | null {
    if (arquivo === null) {
      return 'Escolha o arquivo do exame.';
    }
    const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
    if (!EXTENSOES_DOCUMENTO.includes(extensao)) {
      return ERRO_EXTENSAO_DOCUMENTO;
    }
    if (arquivo.size > TAMANHO_MAXIMO_DOCUMENTO) {
      return ERRO_TAMANHO_DOCUMENTO;
    }
    return null;
  }
}
