import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AgendaService, ConsultaAgenda, StatusConsulta } from '../../core/agenda/agenda.service';
import { AuthService } from '../../core/auth/auth.service';
import { rotuloPapel } from '../../core/auth/papel';
import { formatarData, formatarHora } from '../../core/formato/data';
import { MesaService, PacienteMesa } from '../../core/mesa/mesa.service';

// Chaves do filtro de pendência da mesa; os chips da home linkam para elas.
export type PendenciaMesa = 'laudos' | 'achados' | 'checklist' | 'faltas';

interface ChipPendencia {
  pendencia: PendenciaMesa;
  total: number;
  rotulo: string;
}

type NivelUrgencia = 'critica' | 'alta' | 'atencao';

const STATUS_ROTULO: Record<StatusConsulta, string> = {
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  faltou: 'Faltou',
};

const TOP_URGENCIAS = 5;

@Component({
  imports: [ButtonModule, MessageModule, RouterLink],
  selector: 'app-inicio',
  styleUrl: './inicio.scss',
  templateUrl: './inicio.html',
})
export class Inicio implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly mesa = inject(MesaService);
  private readonly agenda = inject(AgendaService);

  protected readonly perfil = this.auth.perfil;
  protected readonly papelRotulo = computed(() => {
    const papel = this.auth.papel();
    return papel === null ? '' : rotuloPapel(papel);
  });
  protected readonly ehMedica = computed(() => this.auth.papel() === 'medica');

  protected readonly pacientes = signal<PacienteMesa[]>([]);
  protected readonly consultas = signal<ConsultaAgenda[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erroMesa = signal<string | null>(null);
  protected readonly erroAgenda = signal<string | null>(null);

  protected readonly formatarData = formatarData;
  protected readonly formatarHora = formatarHora;

  protected readonly hojeRotulo = capitalizar(
    new Date().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

  // Ordem do dano clínico: achado parado > vencido/falta > laudo/vencendo.
  protected readonly pendenciaChips = computed<ChipPendencia[]>(() => {
    const pacientes = this.pacientes();
    const somar = (valor: (p: PacienteMesa) => number): number =>
      pacientes.reduce((soma, p) => soma + valor(p), 0);

    const faltas = pacientes.filter((p) => p.faltou_sem_reagendar).length;
    const chips: ChipPendencia[] = [
      {
        pendencia: 'achados',
        total: somar((p) => p.achados_para_comunicar),
        rotulo: 'a comunicar',
      },
      {
        pendencia: 'checklist',
        // Mesmo critério do filtro `checklist` da mesa, senão o número do chip
        // não bate com a lista que ele abre.
        total: somar((p) => p.checklist_vencidos + p.checklist_vencendo),
        rotulo: 'vencidos ou vencendo',
      },
      {
        pendencia: 'faltas',
        total: faltas,
        rotulo: faltas === 1 ? 'paciente faltou' : 'pacientes faltaram',
      },
      { pendencia: 'laudos', total: somar((p) => p.laudos_para_publicar), rotulo: 'a publicar' },
    ];
    return chips.filter((chip) => chip.total > 0);
  });

  protected readonly mesaEmDia = computed(() => this.pendenciaChips().length === 0);

  // Cancelada não é compromisso do dia; o histórico fica em /agenda.
  protected readonly consultasDeHoje = computed(() =>
    this.consultas().filter((c) => c.status !== 'cancelada'),
  );

  // A RPC já devolve ordenada por urgência; só recorta o topo.
  protected readonly topUrgencias = computed(() =>
    this.pacientes()
      .filter((p) => p.urgencia_score > 0)
      .slice(0, TOP_URGENCIAS),
  );

  ngOnInit(): void {
    void this.carregar();
  }

  protected async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erroMesa.set(null);
    this.erroAgenda.set(null);
    try {
      const agora = new Date();
      const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
      const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
      const [painel, agenda] = await Promise.all([
        this.ehMedica() ? this.mesa.listar() : null,
        // Sem filtro de médica: a RPC restringe à própria agenda quando médica e
        // devolve a clínica inteira para a secretaria.
        this.agenda.listar(inicioDoDia, fimDoDia, null),
      ]);

      // Um bloco que falha não derruba o outro.
      if (painel !== null) {
        if (painel.ok) {
          this.pacientes.set(painel.valor);
        } else {
          this.erroMesa.set(painel.mensagem);
          this.pacientes.set([]);
        }
      }
      if (agenda.ok) {
        this.consultas.set(agenda.valor);
      } else {
        this.erroAgenda.set(agenda.mensagem);
        this.consultas.set([]);
      }
    } finally {
      this.carregando.set(false);
    }
  }

  // Mesmos pesos da `urgencia_score`: achado parado pesa 100, vencido 40 e
  // falta 30 — a espinha segue a ordem do dano clínico, não o número bruto.
  protected nivelUrgencia(p: PacienteMesa): NivelUrgencia {
    if (p.achados_para_comunicar > 0) {
      return 'critica';
    }
    if (p.checklist_vencidos > 0 || p.faltou_sem_reagendar) {
      return 'alta';
    }
    return 'atencao';
  }

  protected nivelChip(chip: ChipPendencia): NivelUrgencia {
    switch (chip.pendencia) {
      case 'achados':
        return 'critica';
      case 'checklist':
      case 'faltas':
        return 'alta';
      case 'laudos':
        return 'atencao';
    }
  }

  protected gestacaoRotulo(p: PacienteMesa): string {
    if (p.ig_semanas === null) {
      return 'Sem gestação ativa';
    }
    const dpp = p.dpp_final === null ? '—' : formatarData(p.dpp_final);
    return `${p.ig_semanas} sem · DPP ${dpp}`;
  }

  protected resumoPendencias(p: PacienteMesa): string {
    const partes: string[] = [];
    if (p.achados_para_comunicar > 0) {
      partes.push(`${p.achados_para_comunicar} a comunicar`);
    }
    if (p.checklist_vencidos > 0) {
      partes.push(`${p.checklist_vencidos} vencidos`);
    }
    if (p.faltou_sem_reagendar) {
      partes.push('Faltou');
    }
    if (p.laudos_para_publicar > 0) {
      partes.push(`${p.laudos_para_publicar} a publicar`);
    }
    if (p.checklist_vencendo > 0) {
      partes.push(`${p.checklist_vencendo} vencendo`);
    }
    return partes.length === 0 ? 'Em dia' : partes.join(' · ');
  }

  protected rotuloStatus(status: StatusConsulta): string {
    return STATUS_ROTULO[status];
  }
}

function capitalizar(valor: string): string {
  return valor.length === 0 ? valor : valor.charAt(0).toUpperCase() + valor.slice(1);
}
