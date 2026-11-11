import { filterContacts, type ContactSuggestion } from '@/domain/contacts';

const people: ContactSuggestion[] = [
  { name: 'Nicolas Clément', address: 'nico@example.com', count: 4, lastAt: 3 },
  { name: 'Claire Fontaine', address: 'claire.fontaine@atelier.fr', count: 2, lastAt: 2 },
  { name: '', address: 'zoe@example.com', count: 1, lastAt: 1 },
];

describe('filterContacts', () => {
  it('keeps the recent order without a query, minus excluded addresses', () => {
    expect(filterContacts(people, '', ['ZOE@example.com']).map((c) => c.address)).toEqual([
      'nico@example.com',
      'claire.fontaine@atelier.fr',
    ]);
  });

  it('ranks word prefixes first and ignores accents', () => {
    expect(filterContacts(people, 'cl').map((c) => c.name)).toEqual([
      'Nicolas Clément',
      'Claire Fontaine',
    ]);
    expect(filterContacts(people, 'clem').map((c) => c.address)).toEqual(['nico@example.com']);
    expect(filterContacts(people, 'Zo').map((c) => c.address)).toEqual(['zoe@example.com']);
    expect(filterContacts(people, 'atelier')).toHaveLength(1);
    expect(filterContacts(people, 'xyz')).toHaveLength(0);
  });
});
