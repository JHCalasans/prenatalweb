import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/auth/auth.service';
import { EquipeService } from '../../../core/equipe/equipe.service';
import { EquipeLista } from './equipe-lista';

const medica = {
  id: 'u1',
  nome: 'Dra A',
  papel: 'medica' as const,
  telefone: null,
  email: 'a@x.com',
  ativo: true,
};

const desativada = { ...medica, id: 'u2', nome: 'Dra B', ativo: false };

function montar(equipe: Partial<EquipeService>, meuId = 'u9') {
  TestBed.configureTestingModule({
    imports: [EquipeLista],
    providers: [
      provideZonelessChangeDetection(),
      { provide: EquipeService, useValue: equipe },
      {
        provide: AuthService,
        useValue: { perfil: signal({ id: meuId, nome: 'Sec', papel: 'secretaria' }) },
      },
    ],
  });
  return TestBed.createComponent(EquipeLista);
}

interface Interno {
  aDesativar: { set(v: unknown): void };
  confirmarDesativacao(): Promise<void>;
  redefinirSenha(m: unknown): Promise<void>;
}

describe('EquipeLista', () => {
  it('lista os membros com e-mail e situação', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [medica, desativada] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Dra A');
    expect(texto).toContain('a@x.com');
    expect(texto).toContain('Ativa');
    expect(texto).toContain('Desativada');
  });

  it('mostra a senha devolvida ao redefinir', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [medica] }),
      redefinirSenha: vi.fn().mockResolvedValue({ ok: true, valor: 'NOVA-SENHA-1' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    await componente.redefinirSenha(medica);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('NOVA-SENHA-1');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Apenas a secretaria.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Apenas a secretaria.');
  });

  it('só desativa depois da confirmação', async () => {
    const desativar = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [medica] }),
      desativar,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(desativar).not.toHaveBeenCalled();

    componente.aDesativar.set(medica);
    await componente.confirmarDesativacao();

    expect(desativar).toHaveBeenCalledWith('u1');
  });
});
