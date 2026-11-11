import { fireEvent, render } from '@testing-library/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AttachmentPickerSheet } from './AttachmentPickerSheet';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderSheet(props: Parameters<typeof AttachmentPickerSheet>[0]) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AttachmentPickerSheet {...props} />
    </SafeAreaProvider>,
  );
}

describe('AttachmentPickerSheet', () => {
  it('shows the three options and reports the chosen source', () => {
    const onPick = jest.fn();
    const screen = renderSheet({ visible: true, onPick, onClose: jest.fn() });
    expect(screen.getByText('Joindre')).toBeTruthy();
    expect(screen.getByText('Galerie')).toBeTruthy();
    expect(screen.getByText('Appareil photo')).toBeTruthy();
    expect(screen.getByText('Document')).toBeTruthy();

    fireEvent.press(screen.getByTestId('attach-gallery'));
    expect(onPick).toHaveBeenLastCalledWith('gallery');
    fireEvent.press(screen.getByTestId('attach-camera'));
    expect(onPick).toHaveBeenLastCalledWith('camera');
    fireEvent.press(screen.getByTestId('attach-document'));
    expect(onPick).toHaveBeenLastCalledWith('document');
  });

  it('closes from the backdrop', () => {
    const onClose = jest.fn();
    const screen = renderSheet({ visible: true, onPick: jest.fn(), onClose });
    fireEvent.press(screen.getByLabelText('Fermer'));
    expect(onClose).toHaveBeenCalled();
  });
});
