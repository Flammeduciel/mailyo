import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import type { ContactSuggestion } from '@/domain/contacts';
import type { EmailAddress } from '@/domain/models';

import { RecipientField } from './RecipientField';

const contacts: ContactSuggestion[] = [
  { name: 'Claire Fontaine', address: 'claire@atelier.fr', count: 3, lastAt: 2 },
  { name: 'Bob', address: 'bob@example.com', count: 1, lastAt: 1 },
];

function Harness({ onChange }: { onChange: (r: EmailAddress[]) => void }) {
  const [recipients, setRecipients] = useState<EmailAddress[]>([]);
  return (
    <RecipientField
      label="À"
      recipients={recipients}
      onChange={(next) => {
        setRecipients(next);
        onChange(next);
      }}
      contacts={contacts}
      testID="to"
    />
  );
}

describe('RecipientField', () => {
  it('shows recent contacts on focus and adds one on tap', () => {
    const onChange = jest.fn();
    const screen = render(<Harness onChange={onChange} />);
    fireEvent(screen.getByTestId('to-input'), 'focus');
    expect(screen.getByText('Contacts récents')).toBeTruthy();
    fireEvent.press(screen.getByTestId('suggestion-claire@atelier.fr'));
    expect(onChange).toHaveBeenLastCalledWith([
      { name: 'Claire Fontaine', address: 'claire@atelier.fr' },
    ]);
    // Already chosen: no longer suggested.
    expect(screen.queryByTestId('suggestion-claire@atelier.fr')).toBeNull();
  });

  it('filters as you type and accepts a typed address', () => {
    const onChange = jest.fn();
    const screen = render(<Harness onChange={onChange} />);
    const input = screen.getByTestId('to-input');
    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'bo');
    expect(screen.queryByTestId('suggestion-claire@atelier.fr')).toBeNull();
    expect(screen.getByTestId('suggestion-bob@example.com')).toBeTruthy();
    fireEvent.changeText(input, 'new@mail.com ');
    expect(onChange).toHaveBeenLastCalledWith([{ name: '', address: 'new@mail.com' }]);
  });
});
