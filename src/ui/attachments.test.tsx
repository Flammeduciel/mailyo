import { fireEvent, render } from '@testing-library/react-native';

import type { Attachment } from '@/domain/models';

import { AttachmentList } from './AttachmentList';
import { ChatComposer } from './ChatComposer';
import { HtmlMessageView } from './HtmlMessageView';

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att_1',
    messageId: 'm1',
    filename: 'devis.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 250_000,
    remotePartId: 'p1',
    localPath: null,
    downloadState: 'remote',
    ...overrides,
  };
}

describe('AttachmentList', () => {
  it('shows the name, type and size, and opens / saves on press', () => {
    const onOpen = jest.fn();
    const onSave = jest.fn();
    const screen = render(
      <AttachmentList attachments={[attachment()]} onOpen={onOpen} onSave={onSave} />,
    );
    expect(screen.getByText('devis.pdf')).toBeTruthy();
    expect(screen.getByText('PDF · 244 Ko')).toBeTruthy();

    fireEvent.press(screen.getByTestId('attachment-att_1'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'att_1' }));
    fireEvent.press(screen.getByTestId('attachment-save-att_1'));
    expect(onSave).toHaveBeenCalled();
  });

  it('shows the download progress instead of the button', () => {
    const screen = render(
      <AttachmentList
        attachments={[attachment()]}
        onOpen={jest.fn()}
        onSave={jest.fn()}
        progress={{ id: 'att_1', ratio: 0.42 }}
      />,
    );
    expect(screen.getByText('42 %')).toBeTruthy();
    expect(screen.queryByTestId('attachment-save-att_1')).toBeNull();
  });
});

describe('ChatComposer attachments', () => {
  it('lists picked files and allows sending without text', () => {
    const onSend = jest.fn();
    const onRemove = jest.fn();
    const screen = render(
      <ChatComposer
        value=""
        onChangeText={jest.fn()}
        onSend={onSend}
        attachments={[{ filename: 'photo.jpg', sizeBytes: 2048 }]}
        onAttach={jest.fn()}
        onRemoveAttachment={onRemove}
      />,
    );
    expect(screen.getByText('photo.jpg · 2 Ko')).toBeTruthy();
    fireEvent.press(screen.getByTestId('thread-send'));
    expect(onSend).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Retirer photo.jpg'));
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});

describe('HtmlMessageView', () => {
  it('offers to show blocked remote images', () => {
    const html = '<p>Bonjour</p><img src="https://track.example/p.gif">';
    const screen = render(<HtmlMessageView html={html} blockImages testID="html" />);
    expect(screen.getByText('Images masquées pour votre vie privée')).toBeTruthy();
    fireEvent.press(screen.getByTestId('html-show-images'));
    expect(screen.queryByText('Images masquées pour votre vie privée')).toBeNull();
  });

  it('has no "Afficher plus": the mail is always shown in full', () => {
    const screen = render(<HtmlMessageView html="<p>Très long</p>" />);
    expect(screen.queryByText('Afficher plus')).toBeNull();
  });
});
