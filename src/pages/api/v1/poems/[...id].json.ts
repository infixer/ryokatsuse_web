import type { APIRoute, GetStaticPaths } from 'astro';
import type { Entry } from '@infixer/core';
import { json, loadEntries } from '../../../../lib/api-v1';

export const prerender = true;

export const getStaticPaths = (async () =>
  (await loadEntries('poems', import.meta.env.SITE)).map((entry) => ({
    params: { id: entry.id },
    props: { entry },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: Entry }> = ({ props }) => json(props.entry);
