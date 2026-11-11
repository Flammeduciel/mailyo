/**
 * Contacts from the Google People API: saved contacts, "other contacts"
 * (people the user has exchanged mail with) and the user's own profile.
 * Requires the `contacts.readonly` and `contacts.other.readonly` scopes.
 */

import type { AccessTokenProvider } from '@/providers/gmail/gmail-tokens';

const PEOPLE_API = 'https://people.googleapis.com/v1';
const MAX_PAGES = 20;

/** What Google knows about one person, beyond the photo. */
export interface ContactDetails {
  name: string | null;
  phones: string[];
  organization: string | null;
  jobTitle: string | null;
  addresses: string[];
  birthday: string | null;
  /** In the user's saved contacts (not only "other contacts"). */
  saved: boolean;
}

export interface GoogleContacts {
  /** Lower-cased email address → photo URL. */
  photos: Map<string, string>;
  /** Lower-cased email address → details. */
  details: Map<string, ContactDetails>;
}

interface PeoplePerson {
  names?: { displayName?: string; metadata?: { primary?: boolean } }[];
  emailAddresses?: { value?: string }[];
  photos?: { url?: string; default?: boolean; metadata?: { primary?: boolean } }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
  organizations?: { name?: string; title?: string }[];
  addresses?: { formattedValue?: string }[];
  birthdays?: { date?: { year?: number; month?: number; day?: number }; text?: string }[];
}

interface PeoplePage {
  connections?: PeoplePerson[];
  otherContacts?: PeoplePerson[];
  nextPageToken?: string;
}

/**
 * The person's own photo when they set one, otherwise the letter avatar Google
 * generates for them (`default: true`).
 */
function photoOf(person: PeoplePerson): string | null {
  const photos = (person.photos ?? []).filter((photo) => photo.url);
  const real = photos.filter((photo) => !photo.default);
  const photo =
    real.find((candidate) => candidate.metadata?.primary) ??
    real[0] ??
    photos.find((candidate) => candidate.metadata?.primary) ??
    photos[0];
  return photo?.url ?? null;
}

function birthdayOf(person: PeoplePerson): string | null {
  const birthday = person.birthdays?.[0];
  const date = birthday?.date;
  if (date?.day && date.month) {
    const day = String(date.day).padStart(2, '0');
    const month = String(date.month).padStart(2, '0');
    return date.year ? `${day}/${month}/${date.year}` : `${day}/${month}`;
  }
  return birthday?.text ?? null;
}

function detailsOf(person: PeoplePerson, saved: boolean): ContactDetails {
  const names = person.names ?? [];
  const name = (names.find((candidate) => candidate.metadata?.primary) ?? names[0])?.displayName;
  const organization = person.organizations?.[0];
  return {
    name: name ?? null,
    phones: (person.phoneNumbers ?? [])
      .map((phone) => phone.value ?? phone.canonicalForm ?? '')
      .filter(Boolean),
    organization: organization?.name ?? null,
    jobTitle: organization?.title ?? null,
    addresses: (person.addresses ?? []).map((address) => address.formattedValue ?? '').filter(Boolean),
    birthday: birthdayOf(person),
    saved,
  };
}

function collect(people: PeoplePerson[] | undefined, saved: boolean, into: GoogleContacts): void {
  for (const person of people ?? []) {
    const url = photoOf(person);
    const details = detailsOf(person, saved);
    for (const email of person.emailAddresses ?? []) {
      if (!email.value) {
        continue;
      }
      const key = email.value.toLowerCase();
      // A saved contact wins over the same address in "other contacts".
      if (into.details.get(key)?.saved && !saved) {
        continue;
      }
      if (url) {
        into.photos.set(key, url);
      }
      into.details.set(key, details);
    }
  }
}

async function getJson(
  url: string,
  getAccessToken: AccessTokenProvider,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  });
  if (response.status === 401) {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${await getAccessToken(true)}` },
    });
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`Google People API : HTTP ${response.status} ${detail}`);
  }
  return response.json();
}

async function listAll(
  baseUrl: string,
  saved: boolean,
  getAccessToken: AccessTokenProvider,
  fetchImpl: typeof fetch,
  into: GoogleContacts,
): Promise<void> {
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = pageToken ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}` : baseUrl;
    const data = (await getJson(url, getAccessToken, fetchImpl)) as PeoplePage;
    collect(data.connections, saved, into);
    collect(data.otherContacts, saved, into);
    pageToken = data.nextPageToken;
    if (!pageToken) {
      return;
    }
  }
}

/** Photos and details keyed by lower-cased address. Each source fails independently. */
export async function fetchGoogleContacts(
  ownAddress: string,
  getAccessToken: AccessTokenProvider,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleContacts> {
  const contacts: GoogleContacts = { photos: new Map(), details: new Map() };
  // "Other contacts" first so saved contacts, listed second, take precedence.
  const sources: (() => Promise<void>)[] = [
    () =>
      listAll(
        // Without the PROFILE source Google only returns what the user saved,
        // never the person's own profile photo.
        `${PEOPLE_API}/otherContacts?readMask=names,emailAddresses,phoneNumbers,photos&pageSize=1000` +
          '&sources=READ_SOURCE_TYPE_CONTACT&sources=READ_SOURCE_TYPE_PROFILE',
        false,
        getAccessToken,
        fetchImpl,
        contacts,
      ),
    () =>
      listAll(
        `${PEOPLE_API}/people/me/connections?pageSize=1000&personFields=` +
          'names,emailAddresses,phoneNumbers,photos,organizations,addresses,birthdays',
        true,
        getAccessToken,
        fetchImpl,
        contacts,
      ),
    async () => {
      const me = (await getJson(
        `${PEOPLE_API}/people/me?personFields=photos`,
        getAccessToken,
        fetchImpl,
      )) as PeoplePerson;
      const url = photoOf(me);
      if (url) {
        contacts.photos.set(ownAddress.toLowerCase(), url);
      }
    },
  ];
  const failures: unknown[] = [];
  for (const source of sources) {
    try {
      await source();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length === sources.length) {
    throw failures[0];
  }
  return contacts;
}
