import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SheetHost, showAlert, showChoice } from './SheetHost';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function mount() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SheetHost />
    </SafeAreaProvider>,
  );
}

describe('SheetHost', () => {
  it('shows an alert as a bottom sheet and runs the chosen button', async () => {
    const screen = mount();
    const onDelete = jest.fn();
    act(() => {
      showAlert('Supprimer ?', 'Les mails iront dans la corbeille.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: onDelete },
      ]);
    });
    expect(screen.getByText('Supprimer ?')).toBeTruthy();
    expect(screen.getByText('Les mails iront dans la corbeille.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-button-Supprimer'));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it('ticks the current choice and reports the picked one', async () => {
    const screen = mount();
    const onPick = jest.fn();
    act(() => {
      showChoice(
        'Thème',
        [
          { value: 'system', label: 'Système' },
          { value: 'dark', label: 'Sombre' },
        ],
        'system',
        onPick,
      );
    });
    expect(screen.getByTestId('sheet-choice-system').props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
    fireEvent.press(screen.getByTestId('sheet-choice-dark'));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith('dark'));
  });
});
