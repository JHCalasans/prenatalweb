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
  crm: '123456',
  crmUf: 'SP',
};

const secretaria = {
  ...medica,
  id: 'u3',
  nome: 'Sec',
  papel: 'secretaria' as const,
  crm: null,
  crmUf: null,
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
        useValue: { perfil: signal({ id: meuId, nome: 'Adm', papel: 'admin' }) },
      },
    ],
  });
  return TestBed.createComponent(EquipeLista);
}

interface Interno {
  aDesativar: { set(v: unknown): void };
  confirmarDesativacao(): Promise<void>;
  redefinirSenha(m: unknown): Promise<void>;
  papeis: readonly { rotulo: string; valor: string }[];
  formulario: { setValue(v: { nome: string; email: string; papel: string }): void };
  criar(): Promise<void>;
  abrirCrm(m: unknown): void;
  formularioCrm: { setValue(v: { crm: string; crmUf: string | null }): void; invalid: boolean };
  salvarCrm(): Promise<void>;
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

  it('oferece os três papéis e criar com admin chega ao serviço', async () => {
    const criar = vi.fn().mockResolvedValue({ ok: true, valor: 'SENHA-ADMIN-1' });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
      criar,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(componente.papeis.map((p) => p.valor)).toEqual(['medica', 'secretaria', 'admin']);
    expect(componente.papeis.map((p) => p.rotulo)).toContain('Administração');

    componente.formulario.setValue({
      nome: 'Nova Admin',
      email: 'admin@clinica.com',
      papel: 'admin',
    });
    await componente.criar();

    expect(criar).toHaveBeenCalledWith({
      nome: 'Nova Admin',
      email: 'admin@clinica.com',
      papel: 'admin',
    });
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

  it('mostra o CRM e oferece "Definir CRM" só para médica', async () => {
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [medica, secretaria] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const elemento = fixture.nativeElement as HTMLElement;
    expect(elemento.textContent).toContain('123456/SP');
    const botoes = Array.from(elemento.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Definir CRM'),
    );
    expect(botoes).toHaveLength(1);
  });

  it('salva o CRM e limpa quando os dois campos ficam vazios', async () => {
    const definirCrm = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [medica] }),
      definirCrm,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.abrirCrm(medica);
    componente.formularioCrm.setValue({ crm: ' 654321 ', crmUf: 'RJ' });
    await componente.salvarCrm();
    componente.abrirCrm(medica);
    componente.formularioCrm.setValue({ crm: '', crmUf: null });
    await componente.salvarCrm();

    expect(definirCrm).toHaveBeenNthCalledWith(1, 'u1', '654321', 'RJ');
    expect(definirCrm).toHaveBeenNthCalledWith(2, 'u1', null, null);
  });

  it('não envia CRM com letras', async () => {
    const definirCrm = vi.fn();
    const fixture = montar({
      listar: vi.fn().mockResolvedValue({ ok: true, valor: [medica] }),
      definirCrm,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.abrirCrm(medica);
    componente.formularioCrm.setValue({ crm: '12A', crmUf: 'SP' });
    await componente.salvarCrm();

    expect(componente.formularioCrm.invalid).toBe(true);
    expect(definirCrm).not.toHaveBeenCalled();
  });
});
