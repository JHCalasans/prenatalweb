import { Component, inject, OnInit, signal } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../../../core/auth/auth.service';
import { PapelEquipe, rotuloPapel } from '../../../core/auth/papel';
import { EquipeService, MembroEquipe } from '../../../core/equipe/equipe.service';

@Component({
  imports: [
    ButtonModule,
    DialogModule,
    FormsModule,
    InputTextModule,
    MessageModule,
    ReactiveFormsModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  selector: 'app-equipe-lista',
  styleUrl: './equipe-lista.scss',
  templateUrl: './equipe-lista.html',
})
export class EquipeLista implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly equipe = inject(EquipeService);
  private readonly auth = inject(AuthService);

  protected readonly membros = signal<MembroEquipe[]>([]);
  protected readonly carregando = signal(true);
  protected readonly agindo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly criando = signal(false);
  protected readonly senha = signal<string | null>(null);
  protected readonly senhaDe = signal<string>('');
  protected readonly copiado = signal(false);
  protected readonly aDesativar = signal<MembroEquipe | null>(null);

  protected readonly eu = this.auth.perfil;
  protected readonly rotuloPapel = rotuloPapel;

  protected readonly papeis = [
    { rotulo: 'Médica', valor: 'medica' as PapelEquipe },
    { rotulo: 'Secretaria', valor: 'secretaria' as PapelEquipe },
  ];

  protected readonly formulario = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    papel: ['medica' as PapelEquipe, Validators.required],
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.carregar();
    } finally {
      this.carregando.set(false);
    }
  }

  protected async carregar(): Promise<void> {
    const resultado = await this.equipe.listar();
    if (!resultado.ok) {
      this.erro.set(resultado.mensagem);
      this.membros.set([]);
      return;
    }
    this.membros.set(resultado.valor);
  }

  protected async criar(): Promise<void> {
    if (this.formulario.invalid || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const dados = this.formulario.getRawValue();
      const resultado = await this.equipe.criar({
        nome: dados.nome.trim(),
        email: dados.email.trim(),
        papel: dados.papel,
      });
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.criando.set(false);
      this.formulario.setValue({ nome: '', email: '', papel: 'medica' });
      this.mostrarSenha(dados.nome.trim(), resultado.valor);
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async alterarPapel(membro: MembroEquipe, papel: PapelEquipe): Promise<void> {
    if (this.agindo() || membro.papel === papel) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.equipe.alterarPapel(membro.id, papel);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async redefinirSenha(membro: MembroEquipe): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.equipe.redefinirSenha(membro.id);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      this.mostrarSenha(membro.nome, resultado.valor);
    } finally {
      this.agindo.set(false);
    }
  }

  protected async confirmarDesativacao(): Promise<void> {
    const membro = this.aDesativar();
    if (membro === null || this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.equipe.desativar(membro.id);
      this.aDesativar.set(null);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected async reativar(membro: MembroEquipe): Promise<void> {
    if (this.agindo()) {
      return;
    }
    this.agindo.set(true);
    this.erro.set(null);
    try {
      const resultado = await this.equipe.reativar(membro.id);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      await this.carregar();
    } finally {
      this.agindo.set(false);
    }
  }

  protected fecharSenha(): void {
    this.senha.set(null);
    this.senhaDe.set('');
    this.copiado.set(false);
  }

  // A senha só existe nesta resposta: fechada a janela, só redefinindo.
  protected async copiarSenha(): Promise<void> {
    const valor = this.senha();
    if (valor === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(valor);
      this.copiado.set(true);
    } catch {
      this.copiado.set(false);
      this.erro.set('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  private mostrarSenha(nome: string, valor: string): void {
    this.copiado.set(false);
    this.senhaDe.set(nome);
    this.senha.set(valor);
  }
}
