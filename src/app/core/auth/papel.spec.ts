import { ehPapelEquipe, PAPEIS_EQUIPE, rotuloPapel } from './papel';

describe('papel', () => {
  it('rotula os três papéis de equipe', () => {
    expect(rotuloPapel('medica')).toBe('Médica');
    expect(rotuloPapel('secretaria')).toBe('Secretaria');
    expect(rotuloPapel('admin')).toBe('Administração');
  });

  it('aceita os papéis de equipe e recusa paciente', () => {
    expect(PAPEIS_EQUIPE).toEqual(['medica', 'secretaria', 'admin']);
    expect(ehPapelEquipe('medica')).toBe(true);
    expect(ehPapelEquipe('secretaria')).toBe(true);
    expect(ehPapelEquipe('admin')).toBe(true);
    expect(ehPapelEquipe('paciente')).toBe(false);
  });
});
