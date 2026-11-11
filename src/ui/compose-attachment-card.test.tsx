import { fireEvent, render } from '@testing-library/react-native';

import { ComposeAttachmentCard } from './ComposeAttachmentCard';

const file = {
  uri: 'file:///c/devis.pdf',
  filename: 'devis.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
};

describe('ComposeAttachmentCard', () => {
  it('shows name, type and size, renames keeping the extension, and removes', () => {
    const onRename = jest.fn();
    const onRemove = jest.fn();
    const screen = render(
      <ComposeAttachmentCard file={file} onRename={onRename} onRemove={onRemove} testID="f" />,
    );
    expect(screen.getByText('devis.pdf')).toBeTruthy();
    expect(screen.getByText('PDF · 2 Ko')).toBeTruthy();

    fireEvent.press(screen.getByTestId('f-rename'));
    const input = screen.getByTestId('f-name');
    fireEvent.changeText(input, 'Devis / mars');
    fireEvent(input, 'submitEditing');
    expect(onRename).toHaveBeenCalledWith('Devis mars.pdf');

    fireEvent.press(screen.getByTestId('f-remove'));
    expect(onRemove).toHaveBeenCalled();
  });
});
