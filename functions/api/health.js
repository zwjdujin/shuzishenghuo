import { json } from '../_lib.js';

export async function onRequestGet() {
  return json({ ok: true, version: '0.2.1' });
}
