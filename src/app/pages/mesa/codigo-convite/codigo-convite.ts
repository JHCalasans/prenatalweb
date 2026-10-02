import { Component, input, linkedSignal, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';

// Apresentação do código de convite que a RPC devolve uma única vez; o
// banco guarda só o hash, então este diálogo é a única chance de anotar.
@Component({
  imports: [ButtonModule, DialogModule, MessageModule],
  selector: 'app-codigo-convite',
  styleUrl: './codigo-convite.scss',
  templateUrl: './codigo-convite.html',
})
export class CodigoConvite {
  readonly codigo = input.required<string | null>();
  readonly fechado = output<void>();

  // Zera a cada código novo: o mesmo diálogo serve cadastro e reemissão, e um
  // "Copiado" herdado faria a médica fechar sem anotar.
  protected readonly copiado = linkedSignal<string | null, boolean>({
    source: this.codigo,
    computation: () => false,
  });

  protected async copiar(): Promise<void> {
    // A API de clipboard não existe em contexto inseguro (http).
    try {
      await navigator.clipboard.writeText(this.codigo() ?? '');
      this.copiado.set(true);
    } catch {
      this.copiado.set(false);
    }
  }
}
