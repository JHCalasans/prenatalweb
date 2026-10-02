import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { CartaoService, ItemChecklist } from '../../../core/cartao/cartao.service';
import { ExamesService } from '../../../core/exames/exames.service';
import { PacientesService } from '../../../core/pacientes/pacientes.service';
import { CartaoGestante } from './cartao-gestante';

const paciente = {
  id: 'p1',
  nome: 'Ana Célia',
  dataNascimento: '1995-04-10',
  cpf: '12345678900',
  contatoEmergencia: 'José',
};

const gestacaoAtiva = {
  id: 'g1',
  dppFinal: '2026-12-01',
  dppOrigem: 'dum',
  tipo: 'unica',
  status: 'ativa',
  desfecho: null,
  desfechoObservacao: null,
  createdAt: '2026-05-01T12:00:00Z',
};

const itemVencido = {
  protocolo_item_id: 'i1',
  nome: 'Hemograma completo',
  trimestre: 1,
  semana_ini: 6,
  semana_fim: 12,
  obrigatorio: true,
  ordem: 20,
  status: 'pendente',
  data: null,
  observacao: null,
  janela: 'vencido',
} as ItemChecklist;

function montar(servico: Partial<CartaoService>) {
  TestBed.configureTestingModule({
    imports: [CartaoGestante],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: CartaoService, useValue: servico },
      {
        provide: ExamesService,
        useValue: {
          catalogo: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
          exames: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
          vacinas: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
        },
      },
      {
        provide: PacientesService,
        useValue: { reemitirConvite: vi.fn().mockResolvedValue({ ok: true, valor: 'NOVO-0001' }) },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => 'p1' } } },
      },
    ],
  });
  return TestBed.createComponent(CartaoGestante);
}

const servicoCompleto = () => ({
  paciente: vi.fn().mockResolvedValue({ ok: true, valor: paciente }),
  gestacoes: vi.fn().mockResolvedValue({ ok: true, valor: [gestacaoAtiva] }),
  vinculos: vi.fn().mockResolvedValue({
    ok: true,
    valor: [
      {
        vinculo_id: 'v1',
        medica_id: 'm1',
        medica_nome: 'Dra A',
        papel: 'obstetra',
        ativo: true,
        created_at: '2026-05-01T12:00:00Z',
      },
    ],
  }),
  consultas: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
  checklist: vi.fn().mockResolvedValue({ ok: true, valor: [itemVencido] }),
  // O CartaoDocumentos embutido injeta este mesmo dublê e chama documentos().
  documentos: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
});

interface Interno {
  abrirMarcacao(item: unknown): void;
  confirmarMarcacao(): Promise<void>;
  pendentes(): number;
  consultaVencida(c: unknown): boolean;
  abrirRegistro(c: unknown): void;
  confirmarRegistro(): Promise<void>;
  registro: { setValue(v: unknown): void };
}

describe('CartaoGestante', () => {
  it('mostra dados, equipe e checklist com a janela do banco', async () => {
    const fixture = montar(servicoCompleto());
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Ana Célia');
    expect(texto).toContain('123.456.789-00');
    expect(texto).toContain('Dra A');
    expect(texto).toContain('Hemograma completo');
    expect(texto).toContain('Vencido');
    expect(texto).toContain('Documentos');
    expect(texto).toContain('Nenhum documento nesta gestação');
  });

  it('conta os itens vencidos e vencendo', async () => {
    const fixture = montar(servicoCompleto());
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(componente.pendentes()).toBe(1);
  });

  it('só marca depois de confirmar o diálogo', async () => {
    const marcarChecklist = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({ ...servicoCompleto(), marcarChecklist });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    expect(marcarChecklist).not.toHaveBeenCalled();

    componente.abrirMarcacao(itemVencido);
    await componente.confirmarMarcacao();

    expect(marcarChecklist).toHaveBeenCalledWith(
      expect.objectContaining({ gestacaoId: 'g1', protocoloItemId: 'i1' }),
    );
  });

  it('sem gestação, avisa em vez de mostrar seções vazias', async () => {
    const fixture = montar({
      ...servicoCompleto(),
      gestacoes: vi.fn().mockResolvedValue({ ok: true, valor: [] }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem gestação cadastrada');
  });

  it('mostra a mensagem de erro do serviço', async () => {
    const fixture = montar({
      ...servicoCompleto(),
      paciente: vi.fn().mockResolvedValue({ ok: false, mensagem: 'Paciente não encontrada.' }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Paciente não encontrada.',
    );
  });

  it('oferece Registrar na agendada vencida, desabilitado na futura', async () => {
    const agora = Date.now();
    const agendadas = [
      {
        id: 'c1',
        dataHora: new Date(agora + 60 * 60 * 1000).toISOString(),
        tipo: 'Consulta de pré-natal',
        local: null,
        status: 'agendada',
      },
      {
        id: 'c2',
        dataHora: new Date(agora - 60 * 60 * 1000).toISOString(),
        tipo: 'Consulta de pré-natal',
        local: null,
        status: 'agendada',
      },
    ];
    const fixture = montar({
      ...servicoCompleto(),
      consultas: vi.fn().mockResolvedValue({ ok: true, valor: agendadas }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const registrar = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'Registrar',
    );
    expect(registrar).toHaveLength(2);
    expect(registrar.filter((b) => b.hasAttribute('disabled'))).toHaveLength(1);
  });

  it('não oferece Registrar em consulta já resolvida', async () => {
    const resolvida = [
      {
        id: 'c3',
        dataHora: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        tipo: 'Consulta de pré-natal',
        local: null,
        status: 'realizada',
      },
    ];
    const fixture = montar({
      ...servicoCompleto(),
      consultas: vi.fn().mockResolvedValue({ ok: true, valor: resolvida }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    // "Registrar resultado" (exames) é outro botão: aqui vale só o da consulta.
    const botoes = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    expect(botoes.some((b) => b.textContent?.trim() === 'Registrar')).toBe(false);
  });

  it('registra a consulta pelo diálogo e recarrega o cartão', async () => {
    const vencida = {
      id: 'c2',
      dataHora: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      tipo: 'Consulta de pré-natal',
      local: null,
      status: 'agendada',
    };
    const consultas = vi.fn().mockResolvedValue({ ok: true, valor: [vencida] });
    const registrarConsulta = vi.fn().mockResolvedValue({ ok: true, valor: null });
    const fixture = montar({ ...servicoCompleto(), consultas, registrarConsulta });
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    await fixture.whenStable();

    const componente = fixture.componentInstance as unknown as Interno;
    componente.abrirRegistro(vencida);
    componente.registro.setValue({ status: 'faltou' });
    await componente.confirmarRegistro();

    expect(registrarConsulta).toHaveBeenCalledWith('c2', 'faltou');
    expect(consultas).toHaveBeenCalledTimes(2);
  });
});
