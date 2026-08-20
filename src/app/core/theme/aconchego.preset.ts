import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/**
 * Tema "Aconchego" traduzido para os design tokens do PrimeNG.
 *
 * Fonte da paleta (mobile): `prenatalapp/lib/core/theme/aconchego_colors.dart`.
 * O mapa completo cor a cor está em `docs/tema-aconchego.md` — mude os dois
 * lados juntos ou o web diverge do app.
 */
export const AconchegoPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fdf1eb',
      100: '#fbe0d3',
      200: '#f6c3ab',
      300: '#f1a583',
      400: '#e8835f', // ctaStart — início do gradiente do CTA e cor de foco
      500: '#d96a48', // ctaEnd — cor de marca (fundo do botão primário)
      600: '#c15b3a', // link
      700: '#a84c30',
      800: '#8b3f28',
      900: '#713422',
      950: '#4a2c22', // textPrimary
    },
    formField: {
      borderRadius: '16px', // raio dos inputs no mobile
      paddingX: '1rem',
      paddingY: '0.6875rem',
    },
    content: {
      borderRadius: '16px',
    },
    overlay: {
      select: {
        borderRadius: '16px',
        shadow: '0 8px 20px 0 rgba(214, 120, 84, 0.25)', // brandShadow
      },
      popover: {
        borderRadius: '16px',
        shadow: '0 8px 20px 0 rgba(214, 120, 84, 0.25)',
      },
      modal: {
        borderRadius: '20px',
        shadow: '0 10px 24px -6px rgba(217, 106, 72, 0.5)', // ctaShadow
      },
      navigation: {
        shadow: '0 8px 20px 0 rgba(214, 120, 84, 0.25)',
      },
    },
    colorScheme: {
      light: {
        surface: {
          0: '#fffdfa', // cartões, campos e overlays
          50: '#fbf3ec',
          100: '#f6e7db',
          200: '#efd6c3',
          300: '#e3bfa5',
          400: '#cda184',
          500: '#b3816c', // textTertiary — texto mudo
          600: '#9a6550', // textSecondary
          700: '#7c4b39', // textLabel
          800: '#5a3a2e', // textField — texto de input
          900: '#4a2c22', // textPrimary — texto principal
          950: '#362019',
        },
        text: {
          color: '{surface.900}',
          hoverColor: '{surface.950}',
          mutedColor: '{surface.500}',
          hoverMutedColor: '{surface.600}',
        },
        formField: {
          background: '{surface.0}',
          borderColor: '{surface.300}',
          hoverBorderColor: '{surface.400}',
          focusBorderColor: '{primary.400}', // borda de foco terracota do mobile
          invalidBorderColor: '#b3261e',
          color: '{surface.800}',
          placeholderColor: '{surface.500}',
          invalidPlaceholderColor: '#b3261e',
          floatLabelColor: '{surface.600}',
          floatLabelFocusColor: '{primary.600}',
          floatLabelActiveColor: '{surface.600}',
          iconColor: '{surface.500}',
          shadow: '0 2px 8px 0 rgba(214, 120, 84, 0.12)', // inputShadow
        },
        content: {
          background: '{surface.0}',
          hoverBackground: '{surface.100}',
          borderColor: '{surface.200}',
          color: '{surface.900}',
          hoverColor: '{surface.950}',
        },
        overlay: {
          select: {
            background: '{surface.0}',
            borderColor: '{surface.200}',
            color: '{surface.900}',
          },
          popover: {
            background: '{surface.0}',
            borderColor: '{surface.200}',
            color: '{surface.900}',
          },
          modal: {
            background: '{surface.0}',
            borderColor: '{surface.200}',
            color: '{surface.900}',
          },
        },
        list: {
          option: {
            focusBackground: '{primary.50}',
            selectedBackground: '{primary.100}',
            selectedFocusBackground: '{primary.200}',
            color: '{surface.800}',
            focusColor: '{primary.700}',
            selectedColor: '{primary.700}',
            selectedFocusColor: '{primary.800}',
            icon: { color: '{surface.500}', focusColor: '{primary.700}' },
          },
          optionGroup: { background: 'transparent', color: '{surface.600}' },
        },
      },
    },
  },
  components: {
    button: {
      root: {
        borderRadius: '16px',
        label: { fontWeight: '700' }, // CTA do mobile usa 800; na web densa, 700
      },
      colorScheme: {
        light: {
          root: {
            primary: {
              // Gradiente horizontal do CTA (ctaStart → ctaEnd).
              background: 'linear-gradient(90deg, {primary.400} 0%, {primary.500} 100%)',
              hoverBackground: 'linear-gradient(90deg, {primary.500} 0%, {primary.600} 100%)',
              activeBackground: 'linear-gradient(90deg, {primary.600} 0%, {primary.700} 100%)',
              borderColor: '{primary.500}',
              hoverBorderColor: '{primary.600}',
              activeBorderColor: '{primary.700}',
            },
            secondary: {
              background: '{surface.100}',
              hoverBackground: '{surface.200}',
              activeBackground: '{surface.300}',
              borderColor: '{surface.100}',
              hoverBorderColor: '{surface.200}',
              activeBorderColor: '{surface.300}',
            },
          },
        },
      },
    },
  },
});
