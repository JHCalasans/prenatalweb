import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SUPABASE_CLIENT } from '../../core/supabase-client';

@Component({
  imports: [FormsModule, ButtonModule, InputTextModule],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  protected email = '';
  protected senha = '';
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  private readonly supabase = inject(SUPABASE_CLIENT);

  protected async entrar(): Promise<void> {
    this.erro.set(null);
    this.enviando.set(true);
    try {
      const { error } = await this.supabase.auth.signInWithPassword({
        email: this.email,
        password: this.senha,
      });
      if (error) {
        this.erro.set(error.message);
      }
      // Redirecionamento pós-sessão chega com o shell/guard da W1.
    } finally {
      this.enviando.set(false);
    }
  }
}
