import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/auth/auth.service';
import { ConsultaCartao } from '../../../core/cartao/cartao.service';
import {
  CONFLITO_RASCUNHO,
  EvolucaoProntuario,
  ProntuarioService,
} from '../../../core/prontuario/prontuario.service';
import { ATRASO_AUTOSAVE_MS, CartaoProntuario } from './cartao-prontuario';

const base: EvolucaoProntuario = {
  id: 'e1',
  raizId: 'e1',
  retificaId: null,
  motivoRetificacao: null,
  gestacaoId: 'g1',
  consultaId: null,
  autoraId: 'm1',
  autoraNome: 'Dra. Ana',
  papelVinculo: 'obstetra',
  status: 'assinada',
  revisao: 2,
  atendidaEm: '2026-09-01T12:00:00Z',
  queixa: null,
  exameFisico: null,
  avaliacao: null,
  conduta: 'Retorno em 30 dias',
  pesoKg: 70,
  paSistolica: 120,
  paDiastolica: 80,
  alturaUterinaCm: 24,
  bcfBpm: 140,
  movimentacaoFetal: null,
  edema: null,
  apresentacao: null,
  igDias: 170,
  assinadaEm: '2026-09-01T12:30:00Z',
  crm: '123456',
  crmUf: 'SP',
  vigente: false,
  retificada: true,
  atualizadoEm: '2026-09-01T12:30:00Z',
};

const retificacao: EvolucaoProntuario = {
  ...base,
  id: 'e2',
  retificaId: 'e1',
  motivoRetificacao: 'Peso digitado errado',
  pesoKg: 72,
  vigente: true,
  retificada: false,
};

const consultaPassada: ConsultaCartao = {
  id: 'c1',
  dataHora: '2026-09-30T13:00:00Z',
  tipo: 'consulta',
  local: null,
  status: 'agendada',
};

function montar(servico: Partial<ProntuarioService>, consultas: ConsultaCartao[] = []) {
  TestBed.configureTestingModule({
    imports: [CartaoProntuario],
    providers: [
      provideZonelessChangeDetection(),
      { provide: ProntuarioService, useValue: servico },
      { provide: AuthService, useValue: { sessao: () => ({ user: { id: 'm1' } }) } },
    ],
  });
  const fixture = TestBed.createComponent(CartaoProntuario);
  fixture.componentRef.setInput('pacienteId', 'p1');
  fixture.componentRef.setInput('gestacaoId', 'g1');
  fixture.componentRef.setInput('gestacaoAtiva', true);
  fixture.componentRef.setInput('consultas', consultas);
  return fixture;
}

interface Interno {
  novaEvolucao(): void;
  continuar(e: EvolucaoProntuario): void;
  alternar(e: EvolucaoProntuario): void;
  historico: { set(v: string | null): void };
  estado(): string;
  revisao(): number;
  erroEditor(): string | null;
  motivo: { set(v: string): void };
  form: { patchValue(v: Record<string, unknown>): void };
  pedirAssinatura(): Promise<void>;
  confirmarAssinatura(): Promise<void>;
  manterEstaTela(): Promise<void>;
  consultasDisponiveis(): { valor: string }[];
}

async function estabilizar(fixture: ReturnType<typeof montar>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('CartaoProntuario', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista só a versão vigente e mostra as anteriores sob demanda', async () => {
    const fixture = montar({
      prontuario: vi.fn().mockResolvedValue({ ok: true, valor: [base, retificacao] }),
    });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    let texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Peso 72');
    expect(texto).not.toContain('Peso 70');
    expect(texto).toContain('Retificada');
    expect(texto).toContain('IG 24s 2d');

    interno.alternar(retificacao);
    interno.historico.set('e1');
    await estabilizar(fixture);
    texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Peso digitado errado');
    expect(texto).toContain('Peso 70');
    expect(texto).toContain('CRM 123456/SP');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      prontuario: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Sem acesso.' }),
    });
    await estabilizar(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem acesso.');
  });

  it('oferece só consulta passada sem evolução original', async () => {
    const futura: ConsultaCartao = {
      ...consultaPassada,
      id: 'c2',
      dataHora: '2099-01-01T12:00:00Z',
    };
    const comEvolucao: ConsultaCartao = { ...consultaPassada, id: 'c3', status: 'realizada' };
    const fixture = montar(
      {
        prontuario: vi.fn().mockResolvedValue({
          ok: true,
          valor: [{ ...retificacao, id: 'e9', raizId: 'e9', retificaId: null, consultaId: 'c3' }],
        }),
      },
      [consultaPassada, futura, comEvolucao],
    );
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    expect(interno.consultasDisponiveis().map((c) => c.valor)).toEqual(['c1']);
  });

  it('salva o rascunho uma vez depois do debounce e avança a revisão', async () => {
    const salvarRascunho = vi.fn().mockResolvedValue({ ok: true, valor: 1 });
    const fixture = montar(
      {
        prontuario: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
        salvarRascunho,
      },
      [consultaPassada],
    );
    await estabilizar(fixture);
    vi.useFakeTimers();
    const interno = fixture.componentInstance as unknown as Interno;

    interno.novaEvolucao();
    interno.form.patchValue({ pesoKg: 71 });
    interno.form.patchValue({ bcfBpm: 142 });
    await vi.advanceTimersByTimeAsync(ATRASO_AUTOSAVE_MS - 1);
    expect(salvarRascunho).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(salvarRascunho).toHaveBeenCalledTimes(1);
    const [, gestacaoId, consultaId, revisaoBase, dados] = salvarRascunho.mock.calls[0]!;
    expect([gestacaoId, consultaId, revisaoBase]).toEqual(['g1', 'c1', 0]);
    expect(dados).toMatchObject({ pesoKg: 71, bcfBpm: 142, queixa: null });
    expect(interno.revisao()).toBe(1);
    expect(interno.estado()).toBe('salvo');
  });

  it('no conflito, "Manter esta tela" grava sobre a revisão mais recente', async () => {
    const rascunho: EvolucaoProntuario = {
      ...base,
      id: 'r1',
      raizId: 'r1',
      status: 'rascunho',
      revisao: 3,
      vigente: false,
      retificada: false,
    };
    const prontuario = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, valor: [rascunho] })
      .mockResolvedValueOnce({ ok: true, valor: [{ ...rascunho, revisao: 5 }] });
    const salvarRascunho = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, mensagem: CONFLITO_RASCUNHO })
      .mockResolvedValueOnce({ ok: true, valor: 6 });
    const fixture = montar({ prontuario, salvarRascunho });
    await estabilizar(fixture);
    vi.useFakeTimers();
    const interno = fixture.componentInstance as unknown as Interno;

    interno.continuar(rascunho);
    interno.form.patchValue({ conduta: 'Solicitar TOTG' });
    await vi.advanceTimersByTimeAsync(ATRASO_AUTOSAVE_MS);
    expect(interno.estado()).toBe('conflito');

    await interno.manterEstaTela();

    expect(salvarRascunho).toHaveBeenCalledTimes(2);
    expect(salvarRascunho.mock.calls[1]![3]).toBe(5);
    expect(salvarRascunho.mock.calls[1]![4]).toMatchObject({ conduta: 'Solicitar TOTG' });
    expect(interno.revisao()).toBe(6);
    expect(interno.estado()).toBe('salvo');
  });

  it('não assina retificação sem motivo', async () => {
    const assinar = vi.fn();
    const rascunho: EvolucaoProntuario = {
      ...retificacao,
      id: 'r2',
      status: 'rascunho',
      revisao: 1,
      vigente: false,
    };
    const fixture = montar({
      prontuario: vi.fn().mockResolvedValue({ ok: true, valor: [rascunho] }),
      assinar,
    });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;

    interno.continuar(rascunho);
    interno.motivo.set('curto');
    await interno.confirmarAssinatura();

    expect(assinar).not.toHaveBeenCalled();
    expect(interno.erroEditor()).toContain('motivo da retificação');
  });

  it('assina com a revisão atual e avisa o cartão', async () => {
    const assinar = vi.fn().mockResolvedValue({ ok: true, valor: '2026-10-01T12:00:00Z' });
    const rascunho: EvolucaoProntuario = {
      ...base,
      id: 'r3',
      raizId: 'r3',
      retificaId: null,
      status: 'rascunho',
      revisao: 4,
      vigente: false,
      retificada: false,
    };
    const fixture = montar({
      prontuario: vi.fn().mockResolvedValue({ ok: true, valor: [rascunho] }),
      assinar,
    });
    await estabilizar(fixture);
    const interno = fixture.componentInstance as unknown as Interno;
    const avisos: unknown[] = [];
    fixture.componentInstance.alterado.subscribe(() => avisos.push(true));

    interno.continuar(rascunho);
    await interno.pedirAssinatura();
    await interno.confirmarAssinatura();

    expect(assinar).toHaveBeenCalledWith('r3', 4, null);
    expect(avisos).toHaveLength(1);
  });
});
