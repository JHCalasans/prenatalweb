import { Database } from '../../../types/database.types';

export type PapelUsuario = Database['public']['Enums']['papel_usuario'];

// Papéis com acesso ao web. `paciente` usa o app mobile.
export type PapelEquipe = Extract<PapelUsuario, 'medica' | 'secretaria'>;

export const PAPEIS_EQUIPE: readonly PapelEquipe[] = ['medica', 'secretaria'];

export function ehPapelEquipe(papel: PapelUsuario): papel is PapelEquipe {
  return (PAPEIS_EQUIPE as readonly PapelUsuario[]).includes(papel);
}

export function rotuloPapel(papel: PapelEquipe): string {
  return papel === 'medica' ? 'Médica' : 'Secretaria';
}
