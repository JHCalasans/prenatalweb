import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../../core/auth/auth.service';

// Só caminho interno: `retorno` vem da URL e viraria open redirect.
function rotaInternaSegura(valor: string | null): string | null {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//')) {
    return null;
  }
  return valor;
}

@Component({
  imports: [ButtonModule, InputTextModule, ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly expirada = signal(this.rota.snapshot.queryParamMap.get('expirada') === '1');

  protected readonly formulario = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected async entrar(): Promise<void> {
    if (this.formulario.invalid || this.enviando()) {
      return;
    }
    this.erro.set(null);
    this.expirada.set(false);
    this.enviando.set(true);
    try {
      const { email, senha } = this.formulario.getRawValue();
      const resultado = await this.auth.entrar(email, senha);
      if (!resultado.ok) {
        this.erro.set(resultado.mensagem);
        return;
      }
      const retorno = rotaInternaSegura(this.rota.snapshot.queryParamMap.get('retorno'));
      await this.router.navigateByUrl(retorno ?? '/inicio');
    } finally {
      this.enviando.set(false);
    }
  }
}
