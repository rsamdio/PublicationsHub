import { permanentRedirect } from 'next/navigation';

/** Bare `/p` is incomplete — send readers to the catalog. */
export default function BarePublicationIndex() {
  permanentRedirect('/');
}
